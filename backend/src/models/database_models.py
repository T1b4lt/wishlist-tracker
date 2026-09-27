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
    """What the user wants to buy; tracked in one or more stores (offers)."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    priority: str = Field(index=True)  # high, medium, low
    category_id: int | None = Field(default=None, foreign_key="category.id")
    description: str


class Offer(SQLModel, table=True):
    """A product in one store: its URL, store and currency.

    Every product has at least one offer, and all offers of a product share
    its currency. Each offer has its own price history and daily check.
    """

    id: int | None = Field(default=None, primary_key=True)
    product_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("product.id", ondelete="CASCADE"), index=True
        ),
    )
    url: str
    store_id: int | None = Field(default=None, foreign_key="store.id", index=True)
    currency: str


class OfferHist(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    offer_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("offer.id", ondelete="CASCADE"), index=True
        ),
    )
    price: float
    is_in_stock: bool
    timestamp: int  # Unix timestamp in seconds


class PendingStatusRetry(SQLModel, table=True):
    """An offer whose daily status check hit a provider-wide stop (Gemini quota or provider unavailable).

    The cronjob retries these offers later the same local day until each one
    gets its record. Rows from a previous day are stale: they are
    discarded, since the next analysis-hour run checks every product again.
    """

    offer_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("offer.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    day_start: int  # Unix timestamp (seconds) of the local day's start


class DailyCheckRun(SQLModel, table=True):
    """Summary of one local day's price check, created by its full run.

    ``limit_reached_at`` / ``pending_at_limit`` / ``limit_reason`` are the
    snapshot of the day's first provider-wide stop (null when it never
    happened): ``"quota"`` (the Gemini quota ran out) or ``"unavailable"``
    (the provider, e.g. Ollama, could not be reached). They are never
    overwritten by the retries. ``PendingStatusRetry`` holds the live list of
    offers still pending. The ``*_alert_sent`` flags make the Telegram
    "provider unavailable" / "back online" alerts go out at most once a day.
    """

    day_start: int = Field(primary_key=True)  # Unix seconds, local day start
    started_at: int  # Unix seconds
    total_offers: int
    limit_reached_at: int | None = None  # Unix seconds
    pending_at_limit: int | None = None
    limit_reason: str | None = None  # "quota" | "unavailable"
    report_sent: bool = False
    unavailable_alert_sent: bool = False
    recovered_alert_sent: bool = False
