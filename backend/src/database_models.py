"""
Database models for the Wishlist Tracker application.
"""

from sqlmodel import Field, SQLModel


class Config(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)
    value: str


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    color: str


class Product(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    url: str
    priority: str = Field(index=True)  # high, medium, low
    category_id: int | None = Field(default=None, foreign_key="category.id")


class PriceHist(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    price: float
    timestamp: int  # Unix timestamp in seconds
