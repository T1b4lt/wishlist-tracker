"""Smoke tests for the /categories/ endpoints: create, list and delete."""


def test_create_category_returns_the_created_category(client):
    response = client.post(
        "/categories/", json={"name": "Electronics", "color": "#FF0000"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] is not None
    assert data["name"] == "Electronics"
    assert data["color"] == "#FF0000"


def test_list_categories_returns_all_created_categories(client):
    client.post("/categories/", json={"name": "Books", "color": "#00FF00"})
    client.post("/categories/", json={"name": "Games", "color": "#0000FF"})

    response = client.get("/categories/")

    assert response.status_code == 200
    names = [category["name"] for category in response.json()]
    assert names == ["Books", "Games"]


def test_list_categories_reports_zero_product_count_when_empty(client):
    client.post("/categories/", json={"name": "Toys", "color": "#ABCDEF"})

    response = client.get("/categories/")

    data = {category["name"]: category["product_count"] for category in response.json()}
    assert data["Toys"] == 0


def test_list_categories_reports_product_count_for_associated_products(client, session):
    from src.models.database_models import Category, Product

    with_products = Category(name="HasProducts", color="#111111")
    without_products = Category(name="Empty", color="#222222")
    session.add(with_products)
    session.add(without_products)
    session.commit()
    session.refresh(with_products)
    session.refresh(without_products)

    session.add(
        Product(
            name="Item One",
            url="https://example.com/1",
            priority="low",
            category_id=with_products.id,
            description="desc",
            currency="USD",
        )
    )
    session.add(
        Product(
            name="Item Two",
            url="https://example.com/2",
            priority="low",
            category_id=with_products.id,
            description="desc",
            currency="USD",
        )
    )
    session.commit()

    response = client.get("/categories/")

    data = {category["name"]: category["product_count"] for category in response.json()}
    assert data["HasProducts"] == 2
    assert data["Empty"] == 0


def test_delete_category_removes_it(client):
    created = client.post(
        "/categories/", json={"name": "Temporary", "color": "#123456"}
    )
    category_id = created.json()["id"]

    response = client.delete(f"/categories/{category_id}")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert client.get(f"/categories/{category_id}").status_code == 404
