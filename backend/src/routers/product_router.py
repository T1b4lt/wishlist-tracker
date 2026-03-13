"""
Product router — CRUD, dashboard summary, detail, and AI extraction endpoints.
"""

from typing import List

from fastapi import APIRouter

from src.core.database import SessionDep
from src.models.database_models import Product
from src.schemas.product import (
    ProductCreate,
    ProductDashboardSummary,
    ProductDetailResponse,
    ProductInfoRequest,
    ProductInfoResponse,
    ProductUpdate,
)
from src.services import product_service

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
def create_product(payload: ProductCreate, session: SessionDep) -> Product:
    """Create a new product."""
    return product_service.create(session, payload)


@router.get("/products/")
def read_products(session: SessionDep) -> List[Product]:
    """List all products."""
    return product_service.get_all(session)


@router.get("/products/dashboard-summary")
def get_products_dashboard_summary(
    session: SessionDep,
) -> List[ProductDashboardSummary]:
    """Get enriched product summaries for the dashboard view."""
    return product_service.get_dashboard_summary(session)


@router.get("/products/{product_id}")
def get_product_detail(product_id: int, session: SessionDep) -> ProductDetailResponse:
    """Get full product details including price history."""
    return product_service.get_detail(session, product_id)


@router.patch("/products/{product_id}")
def update_product(
    product_id: int, payload: ProductUpdate, session: SessionDep
) -> Product:
    """Partially update a product."""
    return product_service.update(session, product_id, payload)


@router.delete("/products/{product_id}")
def delete_product(product_id: int, session: SessionDep) -> dict:
    """Delete a product (history is cascade-deleted)."""
    return product_service.delete(session, product_id)
