"""
Database models for the Wishlist Tracker application.
"""

from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field, SQLModel


class Config(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)
    value: str


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    color: str


class Store(SQLModel, table=True):
    """An online store (retailer), identified by its normalized domain.

    Shared by every product whose URL points to the same domain, so the
    favicon is downloaded and stored only once per store.
    """

    id: int | None = Field(default=None, primary_key=True)
    domain: str = Field(unique=True, index=True)  # e.g. "pccomponentes.com"
    name: str
    favicon: bytes | None = None  # Raw image bytes
    favicon_mime: str | None = None  # e.g. "image/png"


class Product(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    url: str
    priority: str = Field(index=True)  # high, medium, low
    category_id: int | None = Field(default=None, foreign_key="category.id")
    description: str
    currency: str
    store_id: int | None = Field(default=None, foreign_key="store.id", index=True)


class ProductHist(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    product_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("product.id", ondelete="CASCADE"), index=True
        ),
    )
    price: float
    is_in_stock: bool
    timestamp: int  # Unix timestamp in seconds
