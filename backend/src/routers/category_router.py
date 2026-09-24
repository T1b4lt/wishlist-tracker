"""
Category router — CRUD endpoints for /categories/.
"""

from fastapi import APIRouter
from src.core.database import SessionDep
from src.models.database_models import Category
from src.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate
from src.services import category_service

router = APIRouter(tags=["categories"])


@router.post("/categories/")
def create_category(payload: CategoryCreate, session: SessionDep) -> Category:
    """Create a new category.

    Returns the plain ``Category`` (no ``product_count``): a freshly
    created category always has zero products.
    """
    return category_service.create(session, payload)


@router.get("/categories/")
def read_categories(session: SessionDep) -> list[CategoryResponse]:
    """List all categories, each including its ``product_count``."""
    return category_service.get_all(session)


@router.get("/categories/{category_id}")
def read_category(category_id: int, session: SessionDep) -> CategoryResponse:
    """Retrieve a single category by ID, including its ``product_count``."""
    return category_service.get_by_id(session, category_id)


@router.patch("/categories/{category_id}")
def update_category(
    category_id: int, payload: CategoryUpdate, session: SessionDep
) -> Category:
    """Partially update a category."""
    return category_service.update(session, category_id, payload)


@router.delete("/categories/{category_id}")
def delete_category(category_id: int, session: SessionDep) -> dict:
    """Delete a category (fails if products reference it)."""
    return category_service.delete(session, category_id)
