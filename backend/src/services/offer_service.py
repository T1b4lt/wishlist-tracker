"""
Offer service — a product in one store: store resolution, currency and URL
guards, and the add / edit / unlink / delete operations.
"""

from fastapi import HTTPException
from sqlmodel import Session, select
from src.models.database_models import Offer, Product, Store
from src.schemas.product import OfferCreate, OfferUpdate
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


def _get_offer_or_404(session: Session, offer_id: int) -> Offer:
    """Return an offer or raise a 404."""
    offer = session.get(Offer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


def ensure_same_currency(session: Session, product_id: int, currency: str) -> None:
    """Raise a 409 if ``currency`` differs from the product's.

    Raises:
        HTTPException: 409 when the product already uses another currency.
    """
    existing = product_currency(session, product_id)
    if existing is not None and existing.upper() != currency.upper():
        raise HTTPException(
            status_code=409,
            detail=f"All stores of a product must use {existing}",
        )


def ensure_unique_url(
    session: Session, product_id: int, url: str, exclude_offer_id: int | None = None
) -> None:
    """Raise a 409 if another offer of the product already has ``url``.

    Raises:
        HTTPException: 409 on a duplicate URL.
    """
    for offer in offers_of(session, product_id):
        if offer.id != exclude_offer_id and offer.url == url:
            raise HTTPException(
                status_code=409, detail="This store URL is already tracked"
            )


def _ensure_not_last(session: Session, offer: Offer) -> None:
    """Raise a 409 if ``offer`` is its product's only offer."""
    if len(offers_of(session, offer.product_id)) == 1:
        raise HTTPException(
            status_code=409,
            detail="A product needs at least one store; delete the product instead",
        )


def add(session: Session, product_id: int, payload: OfferCreate) -> Offer:
    """Add a store to a product.

    Raises:
        HTTPException: 404 for an unknown product, 409 for another currency
            or a duplicate URL, 422 if the URL has no hostname.
    """
    if not session.get(Product, product_id):
        raise HTTPException(status_code=404, detail="Product not found")
    ensure_same_currency(session, product_id, payload.currency)
    ensure_unique_url(session, product_id, payload.url)
    store = resolve_store(session, payload.url, payload.store_id)
    offer = Offer(
        product_id=product_id,
        url=payload.url,
        store_id=store.id,
        currency=payload.currency.upper(),
    )
    session.add(offer)
    session.commit()
    session.refresh(offer)
    return offer


def update(session: Session, offer_id: int, payload: OfferUpdate) -> Offer:
    """Change an offer's URL; the store is re-resolved from it.

    Raises:
        HTTPException: 404 for an unknown offer, 409 for a sibling's URL,
            422 if the URL has no hostname.
    """
    offer = _get_offer_or_404(session, offer_id)
    ensure_unique_url(session, offer.product_id, payload.url, exclude_offer_id=offer.id)
    offer.store_id = resolve_store(session, payload.url, offer.store_id).id
    offer.url = payload.url
    session.add(offer)
    session.commit()
    session.refresh(offer)
    return offer


def unlink(session: Session, offer_id: int) -> Product:
    """Move an offer (with its history) into a new product with the same fields.

    Raises:
        HTTPException: 404 for an unknown offer, 409 for the only offer.
    """
    offer = _get_offer_or_404(session, offer_id)
    _ensure_not_last(session, offer)
    source = session.get(Product, offer.product_id)
    product = Product(
        name=source.name,
        priority=source.priority,
        category_id=source.category_id,
        description=source.description,
    )
    session.add(product)
    session.flush()
    offer.product_id = product.id
    session.add(offer)
    session.commit()
    session.refresh(product)
    return product


def delete(session: Session, offer_id: int) -> dict:
    """Delete an offer and its history.

    Raises:
        HTTPException: 404 for an unknown offer, 409 for the only offer.
    """
    offer = _get_offer_or_404(session, offer_id)
    _ensure_not_last(session, offer)
    session.delete(offer)
    session.commit()
    return {"ok": True}
