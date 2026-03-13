from typing import Any, Dict, List
from pydantic import BaseModel

from stagehand import AsyncStagehand


# --- Extraction result models ---
# These Pydantic models define the expected shape of extracted data.
# In v3, extract() uses JSON Schema dicts, so we pass the schema explicitly
# and then validate the result with these models.


class ProductStatusExtraction(BaseModel):
    """Extracted product price and stock availability."""

    price: float
    is_in_stock: bool


class ProductInfoExtraction(BaseModel):
    """Extracted product information (name, category, currency, description)."""

    name: str
    category: str
    currency: str
    description: str


# --- JSON Schemas for Stagehand v3 extract() ---

PRODUCT_STATUS_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "price": {
            "type": "number",
            "description": "The current price of the product as a float number"
        },
        "is_in_stock": {
            "type": "boolean",
            "description": "Whether the product is currently in stock"
        }
    },
    "required": ["price", "is_in_stock"]
}

PRODUCT_INFO_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "description": "Short, descriptive product name (brand, type, specs)"
        },
        "category": {
            "type": "string",
            "description": "The most accurate product category from the provided list"
        },
        "currency": {
            "type": "string",
            "description": "Currency code (e.g., EUR, USD, GBP) used for the product price"
        },
        "description": {
            "type": "string",
            "description": "Concise summary of the product's key features and uses"
        }
    },
    "required": ["name", "category", "currency", "description"]
}


# --- Local browser configuration for Stagehand v3 ---
# Chrome launch options for WSL/Linux environments.
# The executablePath ensures Stagehand finds the correct Chrome binary,
# and the args handle common WSL sandbox/GPU restrictions.

LOCAL_BROWSER_CONFIG: Dict[str, Any] = {
    "type": "local",
    "launchOptions": {
        "headless": True,
        "executablePath": "/usr/bin/google-chrome",
        "args": [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
        ],
    },
}


# --- Stagehand v3 public functions ---


async def get_product_info(
    google_api_key: str,
    url: str,
    language: str,
    categories: List[str]
) -> ProductInfoExtraction:
    """Fetch the product information from the given URL using Stagehand v3.

    Uses a local browser session managed by the Stagehand embedded server.
    Navigates to the product page, dismisses pop-ups, and extracts structured
    product information via Gemini.

    Args:
        google_api_key (str): The Google API key for the AI model.
        url (str): The URL of the product page.
        language (str): The language to use for the extraction output.
        categories (list[str]): List of possible product categories to choose from.

    Returns:
        ProductInfoExtraction: The extracted product information.

    Raises:
        RuntimeError: If extraction fails or the stream reports an error.
        ValueError: If the extracted data doesn't match the expected schema.
    """
    async with AsyncStagehand(
        server="local",
        model_api_key=google_api_key,
    ) as client:
        # Start a local browser session with Gemini model
        session = await client.sessions.start(
            model_name="google/gemini-2.5-flash",
            browser=LOCAL_BROWSER_CONFIG,
        )

        try:
            # Navigate to the product page
            await session.navigate(url=url)

            # Close any pop-ups or cookie consent banners if present
            await session.act(
                input="Close any pop-ups or cookies consent banners if present",
            )

            # Extract the product information using JSON schema
            extract_response = await session.extract(
                instruction=(
                    f"Extract the product name, category, currency, and description. "
                    f"The name should be short and descriptive, including a short sequence of words like: brand, type, specs, etc. "
                    f"For description, provide a concise summary of the product's key features and uses. "
                    f"For categories, select one from the following list, the most accurate: {', '.join(categories)} "
                    f"For currency, extract the currency code (e.g., EUR, USD, GBP) used for the product price. "
                    f"The product information should be provided in {language} language."
                ),
                schema=PRODUCT_INFO_SCHEMA,
            )
            extracted_data = extract_response.data.result

            # Validate and convert the result dict into our Pydantic model
            product_info = ProductInfoExtraction.model_validate(extracted_data)
            print(f"Extracted product info: {product_info}")
            return product_info
        finally:
            await session.end()


async def get_product_status(
    google_api_key: str,
    url: str
) -> ProductStatusExtraction:
    """Fetch the price and stock status of a product from the given URL using Stagehand v3.

    Uses a local browser session managed by the Stagehand embedded server.
    Navigates to the product page, dismisses pop-ups, and extracts the current
    price and stock availability via Gemini.

    Args:
        google_api_key (str): The Google API key for the AI model.
        url (str): The URL of the product page.

    Returns:
        ProductStatusExtraction: The extracted product price and stock status.

    Raises:
        RuntimeError: If extraction fails or the stream reports an error.
        ValueError: If the extracted data doesn't match the expected schema.
    """
    async with AsyncStagehand(
        server="local",
        model_api_key=google_api_key,
    ) as client:
        # Start a local browser session with Gemini model
        session = await client.sessions.start(
            model_name="google/gemini-2.5-flash",
            browser=LOCAL_BROWSER_CONFIG,
        )

        try:
            # Navigate to the product page
            await session.navigate(url=url)

            # Close any pop-ups or cookie consent banners if present
            await session.act(
                input="Close any pop-ups or cookies consent banners if present",
            )

            # Extract the price and stock status using JSON schema
            extract_response = await session.extract(
                instruction="Extract the price of the product as a float number and if it's in stock as boolean",
                schema=PRODUCT_STATUS_SCHEMA,
            )
            extracted_data = extract_response.data.result

            # Validate and convert the result dict into our Pydantic model
            product_status = ProductStatusExtraction.model_validate(extracted_data)
            print(f"Extracted product status: {product_status}")
            return product_status
        finally:
            await session.end()


if __name__ == "__main__":
    import os
    import asyncio

    from dotenv import load_dotenv

    load_dotenv(override=True)
    test_url = "https://fpvcapital.store/emisora-radiomaster-pocket-elrs/"
    test_language = "english"
    test_categories = ["Electronics", "Books", "Clothing", "Home & Kitchen"]
    google_api_key = os.getenv("ASD_GOOGLE")

    asyncio.run(get_product_info(google_api_key,
                test_url, test_language, test_categories))
    asyncio.run(get_product_status(google_api_key, test_url))
