"""Request and response schemas for products."""

from pydantic import BaseModel


class ProductCreate(BaseModel):
    """Payload for creating a new product."""

    name: str
    url: str
    priority: str
    category_id: int
    description: str
    currency: str
    store_id: int | None = None


class ProductUpdate(BaseModel):
    """Partial update payload for a product."""

    name: str | None = None
    url: str | None = None
    priority: str | None = None
    category_id: int | None = None
    description: str | None = None
    currency: str | None = None


class ProductInfoRequest(BaseModel):
    """Payload for requesting AI-extracted product information."""

    url: str


class ProductInfoResponse(BaseModel):
    """Response with AI-extracted product information."""

    name: str
    category: str
    description: str
    currency: str


class ProductDashboardSummary(BaseModel):
    """Summary of a product for the dashboard view.

    Includes current price, price change trend, and stock status
    enriched from the most recent history records.
    """

    id: int
    name: str
    url: str
    category_id: int
    category_name: str
    category_color: str
    priority: str
    current_price: float | None
    price_change_60d: float | None
    is_in_stock: bool | None
    currency: str
    store_id: int | None
    store_name: str | None
    store_domain: str | None
    store_has_favicon: bool
    recent_prices: list[float]
    last_checked_at: int | None


class ProductHistResponse(BaseModel):
    """Single price-history data point."""

    price: float
    is_in_stock: bool
    timestamp: int


class ProductDetailResponse(BaseModel):
    """Full product detail including history for the detail page."""

    id: int
    name: str
    url: str
    priority: str
    category_id: int
    category_name: str
    category_color: str
    description: str
    current_price: float | None
    min_price: float | None
    is_in_stock: bool | None
    price_history: list[ProductHistResponse]
    currency: str
    store_id: int | None
    store_name: str | None
    store_domain: str | None
    store_has_favicon: bool
    last_checked_at: int | None
