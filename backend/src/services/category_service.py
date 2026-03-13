"""
Category service — CRUD business logic for product categories.
"""

from typing import List

from fastapi import HTTPException
from sqlmodel import Session, select

from src.models.database_models import Category, Product
from src.schemas.category import CategoryCreate, CategoryUpdate


def create(session: Session, payload: CategoryCreate) -> Category:
    """Create a new category.

    Args:
        session (Session): Active database session.
        payload (CategoryCreate): Category creation data.

    Returns:
        Category: The newly created category.
    """
    category = Category.model_validate(payload)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def get_all(session: Session) -> List[Category]:
    """Return all categories.

    Args:
        session (Session): Active database session.

    Returns:
        list[Category]: All categories in the database.
    """
    return session.exec(select(Category)).all()


def get_by_id(session: Session, category_id: int) -> Category:
    """Return a single category by ID.

    Args:
        session (Session): Active database session.
        category_id (int): The category's primary key.

    Returns:
        Category: The requested category.

    Raises:
        HTTPException: 404 if the category does not exist.
    """
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


def update(session: Session, category_id: int, payload: CategoryUpdate) -> Category:
    """Partially update an existing category.

    Args:
        session (Session): Active database session.
        category_id (int): The category's primary key.
        payload (CategoryUpdate): Fields to update (only non-None values).

    Returns:
        Category: The updated category.

    Raises:
        HTTPException: 404 if the category does not exist.
    """
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    category_data = payload.model_dump(exclude_unset=True)
    category.sqlmodel_update(category_data)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def delete(session: Session, category_id: int) -> dict:
    """Delete a category if it has no associated products.

    Args:
        session (Session): Active database session.
        category_id (int): The category's primary key.

    Returns:
        dict: Confirmation ``{"ok": True}``.

    Raises:
        HTTPException: 404 if not found, 400 if products still reference it.
    """
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Guard: prevent deletion if any product references this category
    products_with_category = session.exec(
        select(Product).where(Product.category_id == category_id)
    ).first()

    if products_with_category:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete category with associated products"
        )

    session.delete(category)
    session.commit()
    return {"ok": True}
