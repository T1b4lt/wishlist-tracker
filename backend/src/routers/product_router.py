"""
Product router — CRUD, dashboard summary, detail, and AI extraction endpoints.
"""

from fastapi import APIRouter, BackgroundTasks
from src.core.database import SessionDep
from src.schemas.product import (
    ProductCreate,
    ProductDashboardSummary,
    ProductDetailResponse,
    ProductInfoRequest,
    ProductInfoResponse,
    ProductMergeRequest,
    ProductResponse,
    ProductUpdate,
)
from src.services import product_service
from src.services.offer_check_service import check_offer_now

router = APIRouter(tags=["products"])


# --- AI extraction ---


@router.post("/extract-product-info/")
async def extract_product_info(
    request: ProductInfoRequest, session: SessionDep
) -> ProductInfoResponse:
    """Use AI to extract product information from a URL."""
    return await product_service.extract_product_info(session, request)


# --- CRUD ---


@router.post("/products/")
def create_product(
    payload: ProductCreate, session: SessionDep, background_tasks: BackgroundTasks
) -> ProductResponse:
    """Create a new product, then check its price in the background."""
    product = product_service.create(session, payload)
    background_tasks.add_task(check_offer_now, product.offers[0].id)
    return product


@router.get("/products/")
def read_products(session: SessionDep) -> list[ProductResponse]:
    """List all products."""
    return product_service.get_all(session)


@router.get("/products/dashboard-summary")
def get_products_dashboard_summary(
    session: SessionDep,
) -> list[ProductDashboardSummary]:
    """Get enriched product summaries for the dashboard view."""
    return product_service.get_dashboard_summary(session)


@router.get("/products/{product_id}")
def get_product_detail(product_id: int, session: SessionDep) -> ProductDetailResponse:
    """Get full product details including price history."""
    return product_service.get_detail(session, product_id)


@router.patch("/products/{product_id}")
def update_product(
    product_id: int, payload: ProductUpdate, session: SessionDep
) -> ProductResponse:
    """Partially update a product."""
    return product_service.update(session, product_id, payload)


@router.post("/products/{product_id}/merge")
def merge_products(
    product_id: int, payload: ProductMergeRequest, session: SessionDep
) -> ProductDetailResponse:
    """Merge another product (and its stores) into this one."""
    return product_service.merge(session, product_id, payload)


@router.delete("/products/{product_id}")
def delete_product(product_id: int, session: SessionDep) -> dict:
    """Delete a product (offers and history are cascade-deleted)."""
    return product_service.delete(session, product_id)
