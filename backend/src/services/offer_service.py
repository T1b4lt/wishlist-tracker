"""
Offer service — a product in one store: store resolution, currency and URL
guards, and the add / edit / unlink / delete operations.
"""

from sqlmodel import Session, select
from src.models.database_models import Offer, Store
from src.services import store_service


def resolve_store(session: Session, url: str, store_id: int | None = None) -> Store:
    """Return the store an offer URL belongs to.

    ``store_id`` is reused only when it exists and matches the URL's
    domain; otherwise the store is looked up (or created) from the URL,
    which is always the source of truth.

    Args:
        session (Session): Active database session.
        url (str): The offer URL.
        store_id (int | None): A candidate store (e.g. from extraction).

    Returns:
        Store: The offer's store.

    Raises:
        HTTPException: 422 if the URL has no hostname.
    """
    domain = store_service.normalize_domain(url)
    if store_id is not None:
        store = session.get(Store, store_id)
        if store and store.domain == domain:
            return store
    return store_service.get_or_create(session, url)


def offers_of(session: Session, product_id: int) -> list[Offer]:
    """Return a product's offers, oldest first."""
    return session.exec(
        select(Offer).where(Offer.product_id == product_id).order_by(Offer.id)
    ).all()


def product_currency(session: Session, product_id: int) -> str | None:
    """Return the currency shared by a product's offers (None without offers)."""
    offers = offers_of(session, product_id)
    return offers[0].currency if offers else None
