"""AI-powered product scraping helpers built on the Stagehand v4 Python SDK.

Each public function launches a local headless Chrome, attaches a Stagehand
instance driven by Gemini, visits the product page, dismisses pop-ups and
extracts structured data validated by a Pydantic model.
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from pydantic import BaseModel, Field
from stagehand import Page, Stagehand, local_browser

# Model used for act() and extract() calls.
MODEL_NAME = "google/gemini-2.5-flash"

# Instruction used to dismiss cookie banners and pop-ups before extracting.
DISMISS_POPUPS_INSTRUCTION = "Close any pop-ups or cookies consent banners if present"

# Extra Chrome flags for WSL/Docker environments (GPU and /dev/shm restrictions).
# The sandbox is disabled separately through ``chromium_sandbox=False``.
CHROME_ARGS = [
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
]


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
    """Extracted product information (name, category, currency, description)."""

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


# --- Public functions ---


async def get_product_info(
    google_api_key: str, url: str, language: str, categories: list[str]
) -> ProductInfoExtraction:
    """Fetch the product information from the given URL using Stagehand.

    Args:
        google_api_key (str): The Google API key for the AI model.
        url (str): The URL of the product page.
        language (str): The language to use for the extraction output.
        categories (list[str]): List of possible product categories to choose from.

    Returns:
        ProductInfoExtraction: The extracted product information.

    Raises:
        pydantic.ValidationError: If the extracted data doesn't match the schema.
    """
    async with _open_product_page(google_api_key, url) as (stagehand, page):
        result = await stagehand.extract(
            (
                f"Extract the product name, category, currency, and description. "
                f"The name should be short and descriptive, including a short sequence of words like: brand, type, specs, etc. "
                f"For description, provide a concise summary of the product's key features and uses. "
                f"For categories, select one from the following list, the most accurate: {', '.join(categories)} "
                f"For currency, extract the currency code (e.g., EUR, USD, GBP) used for the product price. "
                f"The product information should be provided in {language} language."
            ),
            ProductInfoExtraction,
            page=page,
        )
    print(f"Extracted product info: {result.data}")
    return result.data


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
