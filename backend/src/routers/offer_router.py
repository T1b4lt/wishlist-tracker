"""
Offer router — a product in one store: add, edit URL, unlink and delete.
"""

from fastapi import APIRouter, BackgroundTasks
from src.core.database import SessionDep
from src.models.database_models import Offer
from src.schemas.product import OfferCreate, OfferResponse, OfferUpdate, ProductResponse
from src.services import offer_service, product_service
from src.services.offer_check_service import check_offer_now

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


@router.post("/offers/{offer_id}/unlink")
def unlink_offer(offer_id: int, session: SessionDep) -> ProductResponse:
    """Move an offer into a new standalone product."""
    product = offer_service.unlink(session, offer_id)
    return product_service.to_product_response(session, product)


@router.delete("/offers/{offer_id}")
def delete_offer(offer_id: int, session: SessionDep) -> dict:
    """Delete an offer and its history."""
    return offer_service.delete(session, offer_id)
