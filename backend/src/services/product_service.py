"""
Product service — business logic for products, dashboard summaries, and detail views.

Contains the complex aggregation logic that was previously embedded in the
API route handlers (price change calculation, min price, etc.).
"""

from fastapi import HTTPException
from sqlmodel import Session, select
from src.core.config import get_config_value
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


def _store_fields(session: Session, store_id: int | None) -> dict:
    """Return the store fields shared by the summary and detail responses.

    Args:
        session (Session): Active database session.
        store_id (int | None): The product's store id.

    Returns:
        dict: ``store_id``, ``store_name``, ``store_domain`` and
            ``store_has_favicon`` (empty values when there is no store).
    """
    store = session.get(Store, store_id) if store_id is not None else None
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


def _get_hist_window_size(session: Session) -> int:
    """Read the configured history window size from the Config table.

    Args:
        session (Session): Active database session.

    Returns:
        int: Number of history records to consider (default 60).
    """
    return int(get_config_value(session, "hist_window_size", "60"))


def _compute_price_change(
    current_price: float,
    history: list,
    window_size: int,
) -> float | None:
    """Calculate the percentage price change vs. historical average.

    The comparison window skips the most recent record (current) and
    averages the next *window_size* records.

    Args:
        current_price (float): The latest known price.
        history (list): Product history ordered newest-first.
        window_size (int): How many historical records to average.

    Returns:
        float | None: Percentage change, or None if insufficient data.
    """
    if len(history) <= 1:
        return None

    historical_records = history[1 : window_size + 1]
    if not historical_records:
        return None

    avg_price = sum(r.price for r in historical_records) / len(historical_records)
    if avg_price <= 0:
        return None

    return ((current_price - avg_price) / avg_price) * 100


# Hard ceiling on how many points the dashboard sparkline ever receives,
# regardless of how large the configured history window is.
MAX_RECENT_PRICES = 60


def _get_recent_prices(history: list, window_size: int) -> list[float]:
    """Return recent prices in chronological order, capped at 60 points.

    Args:
        history (list): Product history ordered newest-first.
        window_size (int): Configured history window size.

    Returns:
        list[float]: Prices of the last ``min(window_size, 60)`` records,
            oldest first (chronological order), or ``[]`` if there is no
            history.
    """
    cap = min(window_size, MAX_RECENT_PRICES)
    recent_records = history[:cap]
    return [record.price for record in reversed(recent_records)]


def get_dashboard_summary(session: Session) -> list[ProductDashboardSummary]:
    """Build the enriched dashboard summary for all products.

    For each product this includes the current price, a price-change
    percentage over the configured history window, and the stock status.

    Args:
        session (Session): Active database session.

    Returns:
        List[ProductDashboardSummary]: Enriched product summaries.
    """
    hist_window_size = _get_hist_window_size(session)
    products = session.exec(select(Product)).all()
    summary_list: list[ProductDashboardSummary] = []

    for product in products:
        # Category info
        category = session.get(Category, product.category_id)
        category_name = category.name if category else "Unknown"
        category_color = category.color if category else "gray"

        # Price history (newest first)
        product_history = session.exec(
            select(ProductHist)
            .where(ProductHist.product_id == product.id)
            .order_by(ProductHist.timestamp.desc())
        ).all()

        current_price = None
        price_change_60d = None
        is_in_stock = None
        last_checked_at = None

        if product_history:
            current_price = product_history[0].price
            is_in_stock = product_history[0].is_in_stock
            last_checked_at = product_history[0].timestamp
            price_change_60d = _compute_price_change(
                current_price, product_history, hist_window_size
            )

        recent_prices = _get_recent_prices(product_history, hist_window_size)

        summary_list.append(
            ProductDashboardSummary(
                id=product.id,
                name=product.name,
                url=product.url,
                category_id=product.category_id,
                category_name=category_name,
                category_color=category_color,
                priority=product.priority,
                current_price=current_price,
                price_change_60d=price_change_60d,
                is_in_stock=is_in_stock,
                currency=product.currency,
                **_store_fields(session, product.store_id),
                recent_prices=recent_prices,
                last_checked_at=last_checked_at,
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

    # Category info
    category = session.get(Category, product.category_id)
    category_name = category.name if category else "Unknown"
    category_color = category.color if category else "gray"

    hist_window_size = _get_hist_window_size(session)

    # Price history (newest first)
    product_history = session.exec(
        select(ProductHist)
        .where(ProductHist.product_id == product_id)
        .order_by(ProductHist.timestamp.desc())
    ).all()

    current_price = None
    min_price = None
    is_in_stock = None
    last_checked_at = None

    if product_history:
        current_price = product_history[0].price
        is_in_stock = product_history[0].is_in_stock
        last_checked_at = product_history[0].timestamp

        recent_records = product_history[:hist_window_size]
        if recent_records:
            min_price = min(record.price for record in recent_records)

    # Chronological order for charts
    price_history = [
        ProductHistResponse(
            price=record.price,
            is_in_stock=record.is_in_stock,
            timestamp=record.timestamp,
        )
        for record in reversed(product_history)
    ]

    return ProductDetailResponse(
        id=product.id,
        name=product.name,
        url=product.url,
        priority=product.priority,
        category_id=product.category_id,
        category_name=category_name,
        category_color=category_color,
        description=product.description,
        current_price=current_price,
        min_price=min_price,
        is_in_stock=is_in_stock,
        price_history=price_history,
        currency=product.currency,
        **_store_fields(session, product.store_id),
        last_checked_at=last_checked_at,
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
