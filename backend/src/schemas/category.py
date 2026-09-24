"""Request and response schemas for categories."""

from pydantic import BaseModel


class CategoryCreate(BaseModel):
    """Payload for creating a new category."""

    name: str
    color: str


class CategoryUpdate(BaseModel):
    """Partial update payload for a category."""

    name: str | None = None
    color: str | None = None


class CategoryResponse(BaseModel):
    """Category enriched with its associated product count.

    Used for read endpoints (list and get-by-id). Create and update
    endpoints keep returning the plain ``Category`` model, since the count
    is always 0 right after creation and does not change through an update.
    """

    id: int
    name: str
    color: str
    product_count: int
