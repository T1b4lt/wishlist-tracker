"""
Offer router — a product in one store: add, edit URL, check now, unlink and
delete.
"""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException
from src.core.database import SessionDep
from src.models.database_models import Offer
from src.schemas.product import (
    OfferCheckResponse,
    OfferCreate,
    OfferResponse,
    OfferUpdate,
    ProductResponse,
)
from src.services import offer_service, product_service
from src.services.offer_check_service import (
    CheckOutcome,
    check_offer_now,
    refresh_offer,
)

router = APIRouter(tags=["offers"])


@router.post("/products/{product_id}/offers")
def add_offer(
    product_id: int,
    payload: OfferCreate,
    session: SessionDep,
    background_tasks: BackgroundTasks,
) -> OfferResponse:
    """Add a store to a product, then check its price in the background."""
    offer = offer_service.add(session, product_id, payload)
    background_tasks.add_task(check_offer_now, offer.id)
    return OfferResponse(**offer.model_dump())


@router.patch("/offers/{offer_id}")
def update_offer(
    offer_id: int,
    payload: OfferUpdate,
    session: SessionDep,
    background_tasks: BackgroundTasks,
) -> OfferResponse:
    """Change an offer's URL; a new URL is checked again in the background."""
    existing = session.get(Offer, offer_id)
    previous_url = existing.url if existing else None
    offer = offer_service.update(session, offer_id, payload)
    if offer.url != previous_url:
        background_tasks.add_task(check_offer_now, offer.id, url_changed=True)
    return OfferResponse(**offer.model_dump())


# HTTP error for each manual check outcome that stored nothing.
_CHECK_ERRORS = {
    CheckOutcome.FAILED: (502, "Could not read a valid price from the store page"),
    CheckOutcome.RATE_LIMITED: (429, "The AI provider quota is exhausted"),
    CheckOutcome.PROVIDER_UNAVAILABLE: (503, "The AI provider is unavailable"),
}


@router.post("/offers/{offer_id}/check")
async def check_offer_price(offer_id: int) -> OfferCheckResponse:
    """Check an offer's price now, replacing today's record if it has one.

    Waits for the scrape (it can take a minute or two) and fails with 502,
    429 or 503 when nothing was stored, keeping today's previous record.
    """
    now = datetime.now()
    outcome = await refresh_offer(offer_id, now=now)
    if outcome in _CHECK_ERRORS:
        status_code, detail = _CHECK_ERRORS[outcome]
        raise HTTPException(status_code=status_code, detail=detail)
    return OfferCheckResponse(outcome="stored", checked_at=int(now.timestamp()))


@router.post("/offers/{offer_id}/unlink")
def unlink_offer(offer_id: int, session: SessionDep) -> ProductResponse:
    """Move an offer into a new standalone product."""
    product = offer_service.unlink(session, offer_id)
    return product_service.to_product_response(session, product)


@router.delete("/offers/{offer_id}")
def delete_offer(offer_id: int, session: SessionDep) -> dict:
    """Delete an offer and its history."""
    return offer_service.delete(session, offer_id)
