from stagehand import Stagehand
from pydantic import BaseModel


class ProductStatusExtraction(BaseModel):
    price: float
    is_in_stock: bool


class ProductInfoExtraction(BaseModel):
    name: str
    category: str
    currency: str
    description: str


def _create_stagehand(google_api_key: str) -> Stagehand:
    """Create a Stagehand instance with standard browser configuration.

    Args:
        google_api_key (str): The Google API key for authentication.

    Returns:
        Stagehand: A configured Stagehand instance (not yet initialized).
    """
    return Stagehand(
        env="LOCAL",
        model_name="google/gemini-2.5-flash",
        model_api_key=google_api_key,
        local_browser_launch_options={
            "viewport": {"width": 1920, "height": 1080},
            "args": [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-web-security",
                "--allow-running-insecure-content",
            ],
            "env": {
                "NODE_ENV": "development",
                "DEBUG": "true",
            },
        },
    )


async def get_product_info(google_api_key: str, url: str, language: str, categories: list[str]) -> ProductInfoExtraction:
    """
    Fetch the product information from the given URL using Stagehand.

    Args:
        google_api_key (str): The Google API key for authentication.
        url (str): The URL of the product page.
        language (str): The language to use for the extraction.
        categories (list[str]): List of possible product categories.

    Returns:
        ProductInfoExtraction: The extracted product information.
    """
    stagehand = _create_stagehand(google_api_key)

    try:
        await stagehand.init()

        page = stagehand.page
        await page.goto(url)

        # Close any pop-ups or cookie consent banners if present
        await page.act("Close any pop-ups or cookies consent banners if present")

        # Extract the product information
        product_info = await page.extract(
            f"""Extract the product name, category, and currency.
            The name should be short and descriptive, including a short sequence of words like: brand, type, specs, etc.
            For description, provide a concise summary of the product's key features and uses.
            For categories, select one from the following list, the most accurate: {', '.join(categories)}
            For currency, extract the currency code (e.g., EUR, USD, GBP) used for the product price.
            The product information should be provided in {language} language.""",
            schema=ProductInfoExtraction
        )

        print(f"Extracted product info: {product_info}")
        return product_info
    finally:
        await stagehand.close()


async def get_product_status(google_api_key: str, url: str) -> ProductStatusExtraction:
    """
    Fetch the price and stock status of a product from the given URL using Stagehand.

    Args:
        google_api_key (str): The Google API key for authentication.
        url (str): The URL of the product page.

    Returns:
        ProductStatusExtraction: The recurrent extracted product price and stock status.
    """
    stagehand = _create_stagehand(google_api_key)

    try:
        await stagehand.init()

        page = stagehand.page
        await page.goto(url)

        # Close any pop-ups or cookie consent banners if present
        await page.act("Close any pop-ups or cookies consent banners if present")

        # Extract the price of the product
        product_status = await page.extract(
            "Extract the price of the product as a float number and if it's in stock as boolean",
            schema=ProductStatusExtraction
        )

        print(f"Extracted product status: {product_status}")
        return product_status
    finally:
        await stagehand.close()


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
