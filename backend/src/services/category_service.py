"""
Category service — CRUD business logic for product categories.
"""

from fastapi import HTTPException
from sqlmodel import Session, func, select
from src.models.database_models import Category, Product
from src.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate


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


def get_all(session: Session) -> list[CategoryResponse]:
    """Return all categories, each enriched with its product count.

    Uses a single grouped query for the counts (rather than one query per
    category) to avoid N+1 lookups.

    Args:
        session (Session): Active database session.

    Returns:
        list[CategoryResponse]: All categories with ``product_count``.
    """
    categories = session.exec(select(Category)).all()
    counts = dict(
        session.exec(
            select(Product.category_id, func.count(Product.id)).group_by(
                Product.category_id
            )
        ).all()
    )
    return [
        CategoryResponse(
            id=category.id,
            name=category.name,
            color=category.color,
            product_count=counts.get(category.id, 0),
        )
        for category in categories
    ]


def get_by_id(session: Session, category_id: int) -> CategoryResponse:
    """Return a single category by ID, enriched with its product count.

    Args:
        session (Session): Active database session.
        category_id (int): The category's primary key.

    Returns:
        CategoryResponse: The requested category with ``product_count``.

    Raises:
        HTTPException: 404 if the category does not exist.
    """
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    product_count = session.exec(
        select(func.count())
        .select_from(Product)
        .where(Product.category_id == category_id)
    ).one()

    return CategoryResponse(
        id=category.id,
        name=category.name,
        color=category.color,
        product_count=product_count,
    )


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
            status_code=400, detail="Cannot delete category with associated products"
        )

    session.delete(category)
    session.commit()
    return {"ok": True}
