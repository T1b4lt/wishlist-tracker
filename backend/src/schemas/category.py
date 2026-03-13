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
