"""
Product service — business logic for products, dashboard summaries, and detail views.

Dashboard price statistics are delegated to ``price_stats``.
"""

import time
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import and_, func
from sqlmodel import Session, col, select
from src.core.config import get_config_value, get_hist_window_size
from src.models.database_models import Category, Product, ProductHist, Store
from src.schemas.product import (
    ProductCreate,
    ProductDashboardSummary,
    ProductDetailResponse,
    ProductHistResponse,
    ProductInfoRequest,
    ProductInfoResponse,
    ProductUpdate,
)
from src.services import store_service
from src.services.price_stats import SECONDS_PER_DAY, compute_window_stats
from src.stagehand_utils import get_product_info

# --- Store resolution ---


def _resolve_store(session: Session, url: str, store_id: int | None = None) -> Store:
    """Return the store a product URL belongs to.

    ``store_id`` is reused only when it exists and matches the URL's
    domain; otherwise the store is looked up (or created) from the URL,
    which is always the source of truth.

    Args:
        session (Session): Active database session.
        url (str): The product URL.
        store_id (int | None): A candidate store (e.g. from extraction).

    Returns:
        Store: The product's store.

    Raises:
        HTTPException: 422 if the URL has no hostname.
    """
    domain = store_service.normalize_domain(url)
    if store_id is not None:
        store = session.get(Store, store_id)
        if store and store.domain == domain:
            return store
    return store_service.get_or_create(session, url)


def _store_fields(store: Store | None) -> dict:
    """Return the store fields shared by the summary and detail responses.

    Args:
        store (Store | None): The product's store, if any.

    Returns:
        dict: ``store_id``, ``store_name``, ``store_domain`` and
            ``store_has_favicon`` (empty values when there is no store).
    """
    return {
        "store_id": store.id if store else None,
        "store_name": store.name if store else None,
        "store_domain": store.domain if store else None,
        "store_has_favicon": bool(store and store.favicon),
    }


# --- CRUD operations ---


def create(session: Session, payload: ProductCreate) -> Product:
    """Create a new product.

    Args:
        session (Session): Active database session.
        payload (ProductCreate): Product creation data.

    Returns:
        Product: The newly created product.

    Raises:
        HTTPException: 422 if the URL has no hostname.
    """
    store = _resolve_store(session, payload.url, payload.store_id)
    product = Product.model_validate(payload, update={"store_id": store.id})
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


def get_all(session: Session) -> list[Product]:
    """Return all products.

    Args:
        session (Session): Active database session.

    Returns:
        List[Product]: All products in the database.
    """
    return session.exec(select(Product)).all()


def update(session: Session, product_id: int, payload: ProductUpdate) -> Product:
    """Partially update an existing product.

    Args:
        session (Session): Active database session.
        product_id (int): The product's primary key.
        payload (ProductUpdate): Fields to update (only non-None values).

    Returns:
        Product: The updated product.

    Raises:
        HTTPException: 404 if the product does not exist, 422 if a new
            URL has no hostname.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product_data = payload.model_dump(exclude_unset=True)
    if product_data.get("url") is not None:
        # Keeps the current store when the domain is unchanged.
        product_data["store_id"] = _resolve_store(
            session, product_data["url"], product.store_id
        ).id
    product.sqlmodel_update(product_data)
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


def delete(session: Session, product_id: int) -> dict:
    """Delete a product (history is cascade-deleted via FK).

    Args:
        session (Session): Active database session.
        product_id (int): The product's primary key.

    Returns:
        dict: Confirmation ``{"ok": True}``.

    Raises:
        HTTPException: 404 if the product does not exist.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    session.delete(product)
    session.commit()
    return {"ok": True}


# --- Dashboard and detail aggregation ---


def _by_id(session: Session, model, ids: set) -> dict:
    """Load the rows of ``model`` whose id is in ``ids``, in one query.

    Args:
        session (Session): Active database session.
        model: A SQLModel table class with an ``id`` column.
        ids (set): Ids to load (``None`` values are ignored).

    Returns:
        dict: Rows keyed by id.
    """
    wanted = {row_id for row_id in ids if row_id is not None}
    rows = session.exec(select(model).where(col(model.id).in_(wanted))).all()
    return {row.id: row for row in rows}


def _window_records(session: Session, cutoff: int) -> dict[int, list[ProductHist]]:
    """Load every history record at or after ``cutoff``, grouped by product.

    Args:
        session (Session): Active database session.
        cutoff (int): Oldest Unix timestamp to include.

    Returns:
        dict[int, list[ProductHist]]: Records per product id, oldest first.
    """
    rows = session.exec(
        select(ProductHist)
        .where(ProductHist.timestamp >= cutoff)
        .order_by(ProductHist.product_id, ProductHist.timestamp, ProductHist.id)
    ).all()
    grouped: dict[int, list[ProductHist]] = defaultdict(list)
    for row in rows:
        grouped[row.product_id].append(row)
    return grouped


def _latest_records(session: Session) -> dict[int, ProductHist]:
    """Load the newest history record of every product, in one query.

    It may be older than the window (e.g. when the cronjob stopped), so it
    is loaded separately from ``_window_records``.

    Args:
        session (Session): Active database session.

    Returns:
        dict[int, ProductHist]: Newest record per product id (the highest
            id wins when two records share the newest timestamp).
    """
    newest = (
        select(
            ProductHist.product_id,
            func.max(ProductHist.timestamp).label("max_timestamp"),
        )
        .group_by(ProductHist.product_id)
        .subquery()
    )
    rows = session.exec(
        select(ProductHist)
        .join(
            newest,
            and_(
                ProductHist.product_id == newest.c.product_id,
                ProductHist.timestamp == newest.c.max_timestamp,
            ),
        )
        .order_by(ProductHist.id)
    ).all()
    return {row.product_id: row for row in rows}


def get_dashboard_summary(
    session: Session, now: int | None = None
) -> list[ProductDashboardSummary]:
    """Build the enriched dashboard summary for all products.

    Runs a constant number of queries regardless of the number of
    products. Price statistics follow ``price_stats`` over the configured
    historical window (in days).

    Args:
        session (Session): Active database session.
        now (int | None): Reference Unix timestamp; defaults to the
            current time.

    Returns:
        List[ProductDashboardSummary]: Enriched product summaries.
    """
    now = int(time.time()) if now is None else now
    cutoff = now - get_hist_window_size(session) * SECONDS_PER_DAY

    products = session.exec(select(Product)).all()
    categories = _by_id(session, Category, {p.category_id for p in products})
    stores = _by_id(session, Store, {p.store_id for p in products})
    windows = _window_records(session, cutoff)
    latest = _latest_records(session)

    summary_list: list[ProductDashboardSummary] = []
    for product in products:
        category = categories.get(product.category_id)
        current = latest.get(product.id)
        window = windows.get(product.id, [])
        stats = compute_window_stats(window, current)

        summary_list.append(
            ProductDashboardSummary(
                id=product.id,
                name=product.name,
                url=product.url,
                category_id=product.category_id,
                category_name=category.name if category else "Unknown",
                category_color=category.color if category else "gray",
                priority=product.priority,
                current_price=current.price if current else None,
                price_change_pct=stats.price_change_pct,
                is_in_stock=current.is_in_stock if current else None,
                is_at_lowest=stats.is_at_lowest,
                currency=product.currency,
                **_store_fields(stores.get(product.store_id)),
                recent_prices=[record.price for record in window],
                last_checked_at=current.timestamp if current else None,
            )
        )

    return summary_list


def get_detail(session: Session, product_id: int) -> ProductDetailResponse:
    """Build the full product detail response including price history.

    Args:
        session (Session): Active database session.
        product_id (int): The product's primary key.

    Returns:
        ProductDetailResponse: Complete product details.

    Raises:
        HTTPException: 404 if the product does not exist.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    category = session.get(Category, product.category_id)
    store = (
        session.get(Store, product.store_id) if product.store_id is not None else None
    )

    # Chronological order for charts
    product_history = session.exec(
        select(ProductHist)
        .where(ProductHist.product_id == product_id)
        .order_by(ProductHist.timestamp, ProductHist.id)
    ).all()
    current = product_history[-1] if product_history else None

    return ProductDetailResponse(
        id=product.id,
        name=product.name,
        url=product.url,
        priority=product.priority,
        category_id=product.category_id,
        category_name=category.name if category else "Unknown",
        category_color=category.color if category else "gray",
        description=product.description,
        current_price=current.price if current else None,
        is_in_stock=current.is_in_stock if current else None,
        price_history=[
            ProductHistResponse(
                price=record.price,
                is_in_stock=record.is_in_stock,
                timestamp=record.timestamp,
            )
            for record in product_history
        ],
        currency=product.currency,
        **_store_fields(store),
        last_checked_at=current.timestamp if current else None,
    )


# --- AI extraction ---


async def extract_product_info(
    session: Session,
    request: ProductInfoRequest,
) -> ProductInfoResponse:
    """Use Stagehand to extract product information from a URL.

    Reads the Google API key, language, and category list from the
    database and delegates to ``stagehand_utils.get_product_info``. When
    the URL's domain is not a known store yet, the store is created with
    the extracted name and the favicon downloaded from the page.

    Args:
        session (Session): Active database session.
        request (ProductInfoRequest): Contains the target URL.

    Returns:
        ProductInfoResponse: AI-extracted product information.

    Raises:
        HTTPException: 400 if Google key or categories are missing,
            422 if the URL has no hostname.
    """
    # Validate the URL before any database or browser work.
    domain = store_service.normalize_domain(request.url)

    # Get categories
    categories = session.exec(select(Category)).all()
    category_names = [c.name for c in categories]

    if not category_names:
        raise HTTPException(
            status_code=400,
            detail="No categories found in database. Please create categories first.",
        )

    # Language preference
    selected_language = get_config_value(session, "selected_language", "english")

    # Google API key
    google_api_key = get_config_value(session, "google_api_key")
    if not google_api_key:
        raise HTTPException(
            status_code=400,
            detail="Google API key not configured. Please set it in Settings.",
        )

    # Delegate to Stagehand; the favicon is only downloaded for new stores.
    existing_store = store_service.get_by_domain(session, domain)
    result = await get_product_info(
        google_api_key,
        request.url,
        selected_language,
        category_names,
        fetch_favicon=existing_store is None,
    )
    product_info = result.info

    store = existing_store or store_service.get_or_create(
        session,
        request.url,
        name=product_info.store_name,
        favicon=result.favicon.content if result.favicon else None,
        favicon_mime=result.favicon.mime if result.favicon else None,
    )

    return ProductInfoResponse(
        name=product_info.name,
        category=product_info.category,
        description=product_info.description,
        currency=product_info.currency,
        store=store_service.to_response(store),
    )
