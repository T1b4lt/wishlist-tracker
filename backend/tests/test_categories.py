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


def test_delete_category_removes_it(client):
    created = client.post(
        "/categories/", json={"name": "Temporary", "color": "#123456"}
    )
    category_id = created.json()["id"]

    response = client.delete(f"/categories/{category_id}")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert client.get(f"/categories/{category_id}").status_code == 404
