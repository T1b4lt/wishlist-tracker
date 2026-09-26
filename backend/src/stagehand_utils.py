"""AI-powered product scraping helpers built on the Stagehand v4 Python SDK.

Each public function launches a local headless Chrome, attaches a Stagehand
instance driven by Gemini 3.1 Flash-Lite, visits the product page, dismisses
pop-ups and extracts structured data validated by a Pydantic model.
Product-info extraction can also download the store favicon from the loaded
page.
"""

import asyncio
import base64
import binascii
import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from pydantic import BaseModel, Field
from stagehand import Page, Stagehand, local_browser

# Model used for act() and extract() calls.
MODEL_NAME = "google/gemini-flash-lite-latest"

# Instruction used to dismiss cookie banners and pop-ups before extracting.
DISMISS_POPUPS_INSTRUCTION = "Close any pop-ups or cookies consent banners if present"

# Extra Chrome flags for WSL/Docker environments (GPU and /dev/shm restrictions).
# The sandbox is disabled separately through ``chromium_sandbox=False``.
CHROME_ARGS = [
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
]

# Largest favicon accepted (bytes); anything bigger is ignored.
MAX_FAVICON_BYTES = 256 * 1024

# Upper bound for the whole in-page favicon download (all candidates), so a
# stalled icon host never holds up the product extraction.
FAVICON_TIMEOUT_SECONDS = 10

# Leading bytes of the raster formats accepted as favicons, with their mime.
_IMAGE_SIGNATURES = (
    (b"\x00\x00\x01\x00", "image/x-icon"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"BM", "image/bmp"),
)

# Runs inside the product page: tries the declared icons (``rel=icon`` first,
# then ``apple-touch-icon``) and ``/favicon.ico``, downloading them with the
# page's own session (so anti-bot checks already passed apply). Returns a JSON
# string ``{"mime", "data"}`` (base64) for the first usable image, or null.
FAVICON_SCRIPT = """
(async () => {
  const MAX_BYTES = __MAX_BYTES__;
  const links = Array.from(document.querySelectorAll('link[rel][href]'))
    .filter((link) => /(^|\\s)(icon|apple-touch-icon)(\\s|$)/i.test(link.rel));
  const rank = (link) => (/apple-touch-icon/i.test(link.rel) ? 1 : 0);
  const candidates = links.sort((a, b) => rank(a) - rank(b)).map((l) => l.href);
  candidates.push(new URL('/favicon.ico', location.origin).href);
  for (const href of candidates) {
    try {
      const response = await fetch(href, {
        credentials: 'include',
        signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) continue;
      const blob = await response.blob();
      const mime = blob.type.startsWith('image/')
        ? blob.type
        : ['', 'application/octet-stream'].includes(blob.type) &&
            /\\.ico(\\?|$)/i.test(href)
          ? 'image/x-icon'
          : '';
      if (!mime || blob.size === 0 || blob.size > MAX_BYTES) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return JSON.stringify({ mime, data: btoa(binary) });
    } catch (error) {
      // Unreachable or CORS-blocked candidate: try the next one.
    }
  }
  return null;
})()
""".replace("__MAX_BYTES__", str(MAX_FAVICON_BYTES))


# --- Extraction result models ---
# In v4, extract() takes a Pydantic model class as schema and returns
# an instance of it in ``result.data``. Field descriptions guide the LLM.


class ProductStatusExtraction(BaseModel):
    """Extracted product price and stock availability."""

    price: float = Field(
        description="The current price of the product as a float number"
    )
    is_in_stock: bool = Field(description="Whether the product is currently in stock")


class ProductInfoExtraction(BaseModel):
    """Extracted product information (name, category, currency, description, store)."""

    name: str = Field(
        description="Short, descriptive product name (brand, type, specs)"
    )
    category: str = Field(
        description="The most accurate product category from the provided list"
    )
    currency: str = Field(
        description="Currency code (e.g., EUR, USD, GBP) used for the product price"
    )
    description: str = Field(
        description="Concise summary of the product's key features and uses"
    )
    store_name: str = Field(
        description=(
            "Name of the online store/retailer selling the product "
            "(e.g. Amazon, Decathlon, PcComponentes)"
        )
    )


class FaviconData(BaseModel):
    """A validated favicon image downloaded from the store page."""

    content: bytes
    mime: str


class ProductInfoResult(BaseModel):
    """Product information plus the store favicon, if it was fetched."""

    info: ProductInfoExtraction
    favicon: FaviconData | None = None


def _detect_image_mime(content: bytes, claimed_mime: str) -> str | None:
    """Identify an image from its content, ignoring what the server claimed.

    Guards against soft-404s: many sites answer ``/favicon.ico`` with an
    HTML page labelled as an image.

    Args:
        content (bytes): The downloaded bytes.
        claimed_mime (str): The normalized ``Content-Type`` of the response.

    Returns:
        str | None: The detected mime type, or None if it is not an image.
    """
    for signature, mime in _IMAGE_SIGNATURES:
        if content.startswith(signature):
            return mime
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    if claimed_mime == "image/svg+xml":
        head = content[:512].lstrip().lower()
        if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in head):
            return "image/svg+xml"
    return None


def parse_favicon_payload(raw: object) -> FaviconData | None:
    """Validate the JSON string returned by ``FAVICON_SCRIPT``.

    Args:
        raw (object): The value returned by ``page.evaluate``.

    Returns:
        FaviconData | None: The favicon if it is a non-empty ``image/*`` of
            at most ``MAX_FAVICON_BYTES`` whose content really is an image
            (its mime is taken from the content); otherwise None.
    """
    if not isinstance(raw, str) or not raw:
        return None
    try:
        payload = json.loads(raw)
        mime = str(payload["mime"]).split(";")[0].strip().lower()
        content = base64.b64decode(payload["data"], validate=True)
    except (ValueError, KeyError, TypeError, binascii.Error):
        return None
    if not mime.startswith("image/") or not 0 < len(content) <= MAX_FAVICON_BYTES:
        return None
    detected_mime = _detect_image_mime(content, mime)
    if detected_mime is None:
        return None
    return FaviconData(content=content, mime=detected_mime)


# --- Internal helpers ---


@asynccontextmanager
async def _open_product_page(
    google_api_key: str, url: str
) -> AsyncIterator[tuple[Stagehand, Page]]:
    """Launch a local browser, attach Stagehand and open the given URL.

    Pop-ups and cookie banners are dismissed before yielding. Stagehand is
    closed first and the browser last, as recommended by the SDK.

    The Chrome binary is taken from the ``CHROME_PATH`` environment variable
    (e.g. ``/usr/bin/chromium`` in Docker); if unset, Stagehand auto-detects it.

    Args:
        google_api_key (str): The Google API key for the Gemini model.
        url (str): The URL of the product page.

    Yields:
        tuple[Stagehand, Page]: The Stagehand instance and the loaded page.
    """
    browser = await local_browser.launch(
        headless=True,
        executable_path=os.getenv("CHROME_PATH") or None,
        chromium_sandbox=False,
        args=CHROME_ARGS,
    )
    try:
        stagehand = await Stagehand.create(
            browser=browser,
            model=MODEL_NAME,
            model_api_key=google_api_key,
        )
        try:
            page = (await browser.context.pages())[0]
            await page.goto(url)
            await stagehand.act(DISMISS_POPUPS_INSTRUCTION, page=page)
            yield stagehand, page
        finally:
            await stagehand.close()
    finally:
        await browser.close()


async def _fetch_favicon(page: Page) -> FaviconData | None:
    """Download the favicon of the page currently loaded.

    Never raises: any failure is logged and results in None, so a missing
    favicon never breaks the product extraction.

    Args:
        page (Page): The loaded product page.

    Returns:
        FaviconData | None: The favicon, or None if none could be fetched.
    """
    try:
        raw = await asyncio.wait_for(
            page.evaluate(FAVICON_SCRIPT), timeout=FAVICON_TIMEOUT_SECONDS
        )
        return parse_favicon_payload(raw)
    except Exception as error:  # noqa: BLE001 - best effort by design
        print(f"Could not fetch favicon: {error}")
        return None


# --- Public functions ---


async def get_product_info(
    google_api_key: str,
    url: str,
    language: str,
    categories: list[str],
    fetch_favicon: bool = True,
) -> ProductInfoResult:
    """Fetch the product information (and store favicon) from the given URL.

    Args:
        google_api_key (str): The Google API key for the AI model.
        url (str): The URL of the product page.
        language (str): The language to use for the extraction output.
        categories (list[str]): List of possible product categories to choose from.
        fetch_favicon (bool): Whether to download the store favicon too
            (skipped when the store is already known).

    Returns:
        ProductInfoResult: The extracted information and the favicon, if any.

    Raises:
        pydantic.ValidationError: If the extracted data doesn't match the schema.
    """
    async with _open_product_page(google_api_key, url) as (stagehand, page):
        result = await stagehand.extract(
            (
                f"Extract the product name, category, currency, description and store name. "
                f"The name should be short and descriptive, including a short sequence of words like: brand, type, specs, etc. "
                f"For description, provide a concise summary of the product's key features and uses. "
                f"For categories, select one from the following list, the most accurate: {', '.join(categories)} "
                f"For currency, extract the currency code (e.g., EUR, USD, GBP) used for the product price. "
                f"For store name, give the brand name of the online store selling the product (e.g., Amazon, Decathlon, PcComponentes), not the product brand. "
                f"The product information should be provided in {language} language."
            ),
            ProductInfoExtraction,
            page=page,
        )
        favicon = await _fetch_favicon(page) if fetch_favicon else None
    print(f"Extracted product info: {result.data} (favicon: {favicon is not None})")
    return ProductInfoResult(info=result.data, favicon=favicon)


async def get_product_status(google_api_key: str, url: str) -> ProductStatusExtraction:
    """Fetch the price and stock status of a product from the given URL using Stagehand.

    Args:
        google_api_key (str): The Google API key for the AI model.
        url (str): The URL of the product page.

    Returns:
        ProductStatusExtraction: The extracted product price and stock status.

    Raises:
        pydantic.ValidationError: If the extracted data doesn't match the schema.
    """
    async with _open_product_page(google_api_key, url) as (stagehand, page):
        result = await stagehand.extract(
            "Extract the price of the product as a float number and if it's in stock as boolean",
            ProductStatusExtraction,
            page=page,
        )
    print(f"Extracted product status: {result.data}")
    return result.data


if __name__ == "__main__":
    import asyncio

    from dotenv import load_dotenv

    load_dotenv(override=True)
    test_url = "https://fpvcapital.store/emisora-radiomaster-pocket-elrs/"
    test_language = "english"
    test_categories = ["Electronics", "Books", "Clothing", "Home & Kitchen"]
    google_api_key = os.getenv("ASD_GOOGLE")

    asyncio.run(
        get_product_info(google_api_key, test_url, test_language, test_categories)
    )
    asyncio.run(get_product_status(google_api_key, test_url))
