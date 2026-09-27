"""
Offer router — a product in one store: add, edit URL, unlink and delete.
"""

from fastapi import APIRouter
from src.core.database import SessionDep
from src.schemas.product import OfferCreate, OfferResponse, OfferUpdate, ProductResponse
from src.services import offer_service, product_service

router = APIRouter(tags=["offers"])


@router.post("/products/{product_id}/offers")
def add_offer(
    product_id: int, payload: OfferCreate, session: SessionDep
) -> OfferResponse:
    """Add a store to a product."""
    return OfferResponse(**offer_service.add(session, product_id, payload).model_dump())


@router.patch("/offers/{offer_id}")
def update_offer(
    offer_id: int, payload: OfferUpdate, session: SessionDep
) -> OfferResponse:
    """Change an offer's URL."""
    return OfferResponse(
        **offer_service.update(session, offer_id, payload).model_dump()
    )


@router.post("/offers/{offer_id}/unlink")
def unlink_offer(offer_id: int, session: SessionDep) -> ProductResponse:
    """Move an offer into a new standalone product."""
    product = offer_service.unlink(session, offer_id)
    return product_service.to_product_response(session, product)


@router.delete("/offers/{offer_id}")
def delete_offer(offer_id: int, session: SessionDep) -> dict:
    """Delete an offer and its history."""
    return offer_service.delete(session, offer_id)
