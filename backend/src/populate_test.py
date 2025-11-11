"""
Script to populate the database with test data.
Assumes the API is running at http://localhost:8000
"""

import requests
import sys

API_BASE_URL = "http://localhost:8000"


def create_category(name: str, color: str) -> dict:
    """Create a category and return the created category data."""
    response = requests.post(
        f"{API_BASE_URL}/categories/",
        json={"name": name, "color": color}
    )

    if response.status_code == 200:
        print(f"✓ Created category: {name}")
        return response.json()
    else:
        print(f"✗ Failed to create category {name}: {response.status_code} - {response.text}")
        sys.exit(1)


def create_product(name: str, url: str, category_id: int, priority: str, description: str) -> dict:
    """Create a product and return the created product data."""
    response = requests.post(
        f"{API_BASE_URL}/products/",
        json={
            "name": name,
            "url": url,
            "category_id": category_id,
            "priority": priority,
            "description": description
        }
    )

    if response.status_code == 200:
        print(f"✓ Created product: {name}")
        return response.json()
    else:
        print(f"✗ Failed to create product {name}: {response.status_code} - {response.text}")
        sys.exit(1)


def main():
    print("=== Populating database with test data ===\n")

    # Check if API is running
    try:
        response = requests.get(f"{API_BASE_URL}/categories/")
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"✗ Error: Cannot connect to API at {API_BASE_URL}")
        print(f"  Make sure the API is running with: uvicorn src.api:app --reload")
        sys.exit(1)

    print("Step 1: Creating categories...")
    hogar = create_category("Hogar", "#FF5733")
    electronica = create_category("Electrónica", "#33FF57")

    print("\nStep 2: Creating product...")
    producto = create_product(
        name="Millenium MPS-850 E-Drum Set Bundle",
        url="https://www.thomann.es/millenium_mps_850_e_drum_set_bundle.htm",
        category_id=electronica["id"],
        priority="high",
        description="Set de batería electrónica Millenium MPS-850 con todo lo necesario para empezar a tocar."
    )

    print("\n=== Database populated successfully! ===")
    print(f"\nCreated categories:")
    print(f"  - Hogar (ID: {hogar['id']})")
    print(f"  - Electrónica (ID: {electronica['id']})")
    print(f"\nCreated product:")
    print(f"  - {producto['name']} (ID: {producto['id']})")
    print(f"    Category: Electrónica")
    print(f"    Priority: {producto['priority']}")
    print(f"    URL: {producto['url']}")
    print(f"    Description: {producto['description']}")


if __name__ == "__main__":
    main()
