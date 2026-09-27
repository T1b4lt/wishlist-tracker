"""Request and response schemas for products and their offers."""

from typing import Literal

from pydantic import BaseModel
from src.core.config import RangeKey
from src.schemas.store import StoreResponse


class OfferCreate(BaseModel):
    """Payload for a new offer (a product in one store)."""

    url: str
    currency: str
    store_id: int | None = None


class OfferUpdate(BaseModel):
    """Payload for changing an offer's URL."""

    url: str


class ProductCreate(BaseModel):
    """Payload for creating a product together with its first offer."""

    name: str
    priority: str
    category_id: int
    description: str
    offer: OfferCreate


class ProductUpdate(BaseModel):
    """Partial update of a product's shared fields."""

    name: str | None = None
    priority: str | None = None
    category_id: int | None = None
    description: str | None = None


class ProductMergeRequest(BaseModel):
    """Merge ``source_product_id`` into the target product.

    ``keep`` picks whose shared fields (name, category, priority,
    description) the merged product keeps.
    """

    source_product_id: int
    keep: Literal["target", "source"] = "target"


class OfferResponse(BaseModel):
    """An offer as stored."""

    id: int
    product_id: int
    url: str
    store_id: int | None
    currency: str


class ProductResponse(BaseModel):
    """A product's shared fields and its offers."""

    id: int
    name: str
    priority: str
    category_id: int | None
    description: str
    offers: list[OfferResponse]


class ProductInfoRequest(BaseModel):
    """Payload for requesting AI-extracted product information."""

    url: str


class ProductInfoResponse(BaseModel):
    """Response with AI-extracted product information."""

    name: str
    category: str
    description: str
    currency: str
    store: StoreResponse


class OfferSummary(BaseModel):
    """An offer's store and latest status. Pinned by ``contracts/api-fields.json``."""

    id: int
    url: str
    store_id: int | None
    store_name: str | None
    store_domain: str | None
    store_has_favicon: bool
    current_price: float | None
    is_in_stock: bool | None
    last_checked_at: int | None
    days_since_check: int | None
    is_stale: bool


class OfferHistResponse(BaseModel):
    """Single price-history data point."""

    price: float
    is_in_stock: bool
    timestamp: int


class OfferDetail(OfferSummary):
    """An offer with its full price history (chronological)."""

    price_history: list[OfferHistResponse]


class ProductDashboardSummary(BaseModel):
    """A product on the dashboard, valued by its best offer.

    Rules in ``src/services/best_offer.py``; price statistics of the best
    offer follow ``src/services/price_stats.py``. Field names are pinned by
    ``contracts/api-fields.json``.
    """

    id: int
    name: str
    category_id: int
    category_name: str
    category_color: str
    priority: str
    currency: str
    current_price: float | None
    price_change_pct: float | None
    is_in_stock: bool | None
    is_at_lowest: bool
    recent_prices: list[float]
    best_offer_id: int | None
    offers: list[OfferSummary]
    is_stale: bool
    stale_days: int | None


class LowestPrice(BaseModel):
    """The cheapest in-stock price of any store inside a range."""

    price: float
    timestamp: int
    offer_id: int


class RangeStats(BaseModel):
    """Statistics of one range of the product detail's chart.

    ``average`` and ``price_change_pct`` follow ``src/services/price_stats.py``
    over the best offer's history; ``lowest`` looks at every store
    (``best_offer.lowest_across_offers``).
    """

    key: RangeKey
    window_start: int | None
    average: float | None
    price_change_pct: float | None
    lowest: LowestPrice | None


class ProductDetailResponse(BaseModel):
    """Full product detail with every offer and its history, plus the
    precomputed statistics of every chart range.
    """

    id: int
    name: str
    priority: str
    category_id: int
    category_name: str
    category_color: str
    description: str
    currency: str
    offers: list[OfferDetail]
    is_stale: bool
    stale_days: int | None
    best_offer_id: int | None
    is_in_stock: bool | None
    default_range: RangeKey
    ranges: list[RangeStats]
