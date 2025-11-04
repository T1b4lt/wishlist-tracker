import os
from dotenv import load_dotenv
import asyncio
from stagehand import Stagehand
from pydantic import BaseModel


class PriceExtraction(BaseModel):
    price: float


class ProductExtraction(BaseModel):
    name: str
    category: str


async def get_product_info(url: str, categories: list[str]) -> ProductExtraction:
    """
    Fetch the product information from the given URL using Stagehand.
    Args:
        url (str): The URL of the product page.
        categories (list[str]): List of possible product categories.
    Returns:
        ProductExtraction: The extracted product information.
    """
    stagehand = Stagehand(
        env="LOCAL",
        model_name="google/gemini-2.5-flash",
        model_api_key=os.getenv("GOOGLE_API_KEY"),
        local_browser_launch_options={
            "viewport": {"width": 1920, "height": 1080},
            "args": [
                "--headless=True"
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

    # Initialize Stagehand
    await stagehand.init()

    # Navigate to the product page
    page = stagehand.page
    await page.goto(url)

    # Close any pop-ups or cookie consent banners if present
    await page.act("close any pop-ups or cookies consent banners if present")

    # Extract the product information
    product = await page.extract(
        f"""Extract the product name and category.
        The name should be short and descriptive, including a short sequence of words like: brand, type, specs, etc.
        For categories, select one from the following list, the most accurate: {', '.join(categories)}""",
        schema=ProductExtraction
    )

    # Close Stagehand
    await stagehand.close()

    return product


async def get_item_price(url: str) -> float:
    """
    Fetch the price of an item from the given URL using Stagehand.
    Args:
        url (str): The URL of the item page.
    Returns:
        float: The price of the item.
    """

    stagehand = Stagehand(
        env="LOCAL",
        model_name="google/gemini-2.5-flash",
        model_api_key=os.getenv("GOOGLE_API_KEY"),
        local_browser_launch_options={
            "viewport": {"width": 1920, "height": 1080},
            "args": [
                "--headless=True"
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

    # Initialize Stagehand
    await stagehand.init()

    # Navigate to the item page
    page = stagehand.page
    await page.goto(url)

    # Close any pop-ups or cookie consent banners if present
    await page.act("close any pop-ups or cookies consent banners if present")

    # Extract the price of the item
    item = await page.extract(
        "extract the price of the item",
        schema=PriceExtraction
    )

    # Close Stagehand
    await stagehand.close()

    return item.price

if __name__ == "__main__":
    load_dotenv(override=True)
    test_url = "https://fpvcapital.store/emisora-radiomaster-pocket-elrs/"
    categories = ["Electronics", "Books", "Clothing", "Home & Kitchen"]

    asyncio.run(get_product_info(test_url, categories))
    asyncio.run(get_item_price(test_url))
