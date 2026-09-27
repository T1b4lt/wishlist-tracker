"""
Product service — business logic for products, dashboard summaries, and detail views.

A product is tracked in one or more stores (offers, see ``offer_service``).
The best offer follows ``best_offer``; its price statistics are delegated to
``price_stats``.
"""

import time
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import and_, func
from sqlmodel import Session, col, select
from src.ai.factory import load_ai_provider
from src.core.config import (
    RANGE_KEYS,
    get_config_value,
    get_hist_window_size,
    range_window_days,
)
from src.models.database_models import Category, Offer, OfferHist, Product, Store
from src.schemas.product import (
    LowestPrice,
    OfferDetail,
    OfferHistResponse,
    OfferResponse,
    OfferSummary,
    ProductCreate,
    ProductDashboardSummary,
    ProductDetailResponse,
    ProductInfoRequest,
    ProductInfoResponse,
    ProductMergeRequest,
    ProductResponse,
    ProductUpdate,
    RangeStats,
)
from src.services import offer_service, store_service
from src.services.best_offer import (
    OfferHistory,
    compute_product_offer_stats,
    current_record,
    lowest_across_offers,
)
from src.services.price_stats import (
    SECONDS_PER_DAY,
    compute_window_stats,
    filter_window,
)
from src.services.staleness import days_since_check, is_stale, product_stale_days
from src.stagehand_utils import get_product_info

# --- CRUD operations ---


def to_product_response(session: Session, product: Product) -> ProductResponse:
    """Return a product with its offers.

    Args:
        session (Session): Active database session.
        product (Product): A stored product.

    Returns:
        ProductResponse: Shared fields and offers.
    """
    return ProductResponse(
        **product.model_dump(),
        offers=[
            OfferResponse(**offer.model_dump())
            for offer in offer_service.offers_of(session, product.id)
        ],
    )


def _get_or_404(session: Session, product_id: int) -> Product:
    """Return a product or raise a 404."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def create(session: Session, payload: ProductCreate) -> ProductResponse:
    """Create a product together with its first offer.

    Args:
        session (Session): Active database session.
        payload (ProductCreate): Shared fields and the first offer.

    Returns:
        ProductResponse: The new product.

    Raises:
        HTTPException: 422 if the offer URL has no hostname.
    """
    store = offer_service.resolve_store(
        session, payload.offer.url, payload.offer.store_id
    )
    product = Product.model_validate(payload.model_dump(exclude={"offer"}))
    session.add(product)
    session.flush()
    session.add(
        Offer(
            product_id=product.id,
            url=payload.offer.url,
            store_id=store.id,
            currency=payload.offer.currency.upper(),
        )
    )
    session.commit()
    session.refresh(product)
    return to_product_response(session, product)


def get_all(session: Session) -> list[ProductResponse]:
    """Return every product with its offers."""
    products = session.exec(select(Product).order_by(Product.id)).all()
    return [to_product_response(session, product) for product in products]


def update(
    session: Session, product_id: int, payload: ProductUpdate
) -> ProductResponse:
    """Partially update a product's shared fields.

    Raises:
        HTTPException: 404 if the product does not exist.
    """
    product = _get_or_404(session, product_id)
    product.sqlmodel_update(payload.model_dump(exclude_unset=True))
    session.add(product)
    session.commit()
    session.refresh(product)
    return to_product_response(session, product)


def delete(session: Session, product_id: int) -> dict:
    """Delete a product; offers and their history are cascade-deleted.

    Raises:
        HTTPException: 404 if the product does not exist.
    """
    product = _get_or_404(session, product_id)
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


def _window_records(session: Session, cutoff: int) -> dict[int, list[OfferHist]]:
    """Load every history record at or after ``cutoff``, grouped by offer."""
    rows = session.exec(
        select(OfferHist)
        .where(OfferHist.timestamp >= cutoff)
        .order_by(OfferHist.offer_id, OfferHist.timestamp, OfferHist.id)
    ).all()
    grouped: dict[int, list[OfferHist]] = defaultdict(list)
    for row in rows:
        grouped[row.offer_id].append(row)
    return grouped


def _latest_records(session: Session) -> dict[int, OfferHist]:
    """Load the newest history record of every offer, in one query.

    It may be older than the window, so it is loaded separately from
    ``_window_records``; the highest id wins on timestamp ties.
    """
    newest = (
        select(
            OfferHist.offer_id,
            func.max(OfferHist.timestamp).label("max_timestamp"),
        )
        .group_by(OfferHist.offer_id)
        .subquery()
    )
    rows = session.exec(
        select(OfferHist)
        .join(
            newest,
            and_(
                OfferHist.offer_id == newest.c.offer_id,
                OfferHist.timestamp == newest.c.max_timestamp,
            ),
        )
        .order_by(OfferHist.id)
    ).all()
    return {row.offer_id: row for row in rows}


def _offer_summary_fields(offer: Offer, store: Store | None, current, now: int) -> dict:
    """Return the ``OfferSummary`` fields of an offer.

    Args:
        offer (Offer): The offer.
        store (Store | None): Its store, if any.
        current: Its newest ``OfferHist`` record, or None.
        now (int): Reference Unix timestamp for the staleness fields.

    Returns:
        dict: Keyword arguments for ``OfferSummary`` / ``OfferDetail``.
    """
    last_checked_at = current.timestamp if current else None
    return {
        "id": offer.id,
        "url": offer.url,
        "store_id": store.id if store else None,
        "store_name": store.name if store else None,
        "store_domain": store.domain if store else None,
        "store_has_favicon": bool(store and store.favicon),
        "current_price": current.price if current else None,
        "is_in_stock": current.is_in_stock if current else None,
        "last_checked_at": last_checked_at,
        "days_since_check": days_since_check(last_checked_at, now),
        "is_stale": is_stale(last_checked_at, now),
    }


def _history_for_rules(window: list, current, cutoff: int) -> list:
    """The window plus the current record when it is older than the window."""
    if current is not None and current.timestamp < cutoff:
        return [*window, current]
    return window


def get_dashboard_summary(
    session: Session, now: int | None = None
) -> list[ProductDashboardSummary]:
    """Build the dashboard summary: one entry per product, valued by its best offer.

    Runs a constant number of queries regardless of the number of products
    or offers. The best offer follows ``best_offer``; its price statistics
    follow ``price_stats`` over the configured window (in days).

    Args:
        session (Session): Active database session.
        now (int | None): Reference Unix timestamp; defaults to now.

    Returns:
        list[ProductDashboardSummary]: One summary per product.
    """
    now = int(time.time()) if now is None else now
    window_days = get_hist_window_size(session)
    cutoff = now - window_days * SECONDS_PER_DAY

    products = session.exec(select(Product).order_by(Product.id)).all()
    offers_by_product: dict[int, list[Offer]] = defaultdict(list)
    for offer in session.exec(select(Offer).order_by(Offer.id)).all():
        offers_by_product[offer.product_id].append(offer)
    all_offers = [offer for offers in offers_by_product.values() for offer in offers]
    categories = _by_id(session, Category, {p.category_id for p in products})
    stores = _by_id(session, Store, {offer.store_id for offer in all_offers})
    windows = _window_records(session, cutoff)
    latest = _latest_records(session)

    summary_list: list[ProductDashboardSummary] = []
    for product in products:
        offers = offers_by_product.get(product.id, [])
        offer_stats = compute_product_offer_stats(
            [
                OfferHistory(
                    offer_id=offer.id,
                    history=_history_for_rules(
                        windows.get(offer.id, []), latest.get(offer.id), cutoff
                    ),
                )
                for offer in offers
            ],
            window_days,
            now,
        )
        best_id = offer_stats.best_offer_id
        best_window = windows.get(best_id, []) if best_id is not None else []
        best_current = latest.get(best_id) if best_id is not None else None
        stats = compute_window_stats(best_window, best_current)
        category = categories.get(product.category_id)
        stale_days = product_stale_days(
            [
                latest[offer.id].timestamp if offer.id in latest else None
                for offer in offers
            ],
            now,
        )

        summary_list.append(
            ProductDashboardSummary(
                id=product.id,
                name=product.name,
                category_id=product.category_id,
                category_name=category.name if category else "Unknown",
                category_color=category.color if category else "gray",
                priority=product.priority,
                currency=offers[0].currency if offers else "",
                current_price=best_current.price if best_current else None,
                price_change_pct=stats.price_change_pct,
                is_in_stock=offer_stats.is_in_stock,
                is_at_lowest=offer_stats.is_at_lowest,
                recent_prices=[record.price for record in best_window],
                best_offer_id=best_id,
                offers=[
                    OfferSummary(
                        **_offer_summary_fields(
                            offer,
                            stores.get(offer.store_id),
                            latest.get(offer.id),
                            now,
                        )
                    )
                    for offer in offers
                ],
                is_stale=stale_days is not None,
                stale_days=stale_days,
            )
        )

    return summary_list


def _range_stats(
    offers: list[OfferHistory], best_offer_id: int | None, now: int
) -> list[RangeStats]:
    """Compute the statistics of every range of the product detail.

    Args:
        offers (list[OfferHistory]): Every offer with its full history.
        best_offer_id (int | None): The offer that values the product.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        list[RangeStats]: One entry per ``RANGE_KEYS`` key, in order.
    """
    best_history = next(
        (offer.history for offer in offers if offer.offer_id == best_offer_id), []
    )
    best_current = current_record(best_history)
    ranges = []
    for key in RANGE_KEYS:
        window_days = range_window_days(key)
        stats = compute_window_stats(
            filter_window(best_history, window_days, now), best_current
        )
        lowest = lowest_across_offers(offers, window_days, now)
        ranges.append(
            RangeStats(
                key=key,
                window_start=(
                    None if window_days is None else now - window_days * SECONDS_PER_DAY
                ),
                average=stats.average,
                price_change_pct=stats.price_change_pct,
                lowest=(
                    LowestPrice(
                        price=lowest.price,
                        timestamp=lowest.timestamp,
                        offer_id=lowest.offer_id,
                    )
                    if lowest
                    else None
                ),
            )
        )
    return ranges


def get_detail(
    session: Session, product_id: int, now: int | None = None
) -> ProductDetailResponse:
    """Build the full product detail: every offer with its whole history, the
    best offer and the precomputed statistics of every chart range.

    Args:
        session (Session): Active database session.
        product_id (int): The product to describe.
        now (int | None): Reference Unix timestamp; defaults to now.

    Raises:
        HTTPException: 404 if the product does not exist.
    """
    product = _get_or_404(session, product_id)
    now = int(time.time()) if now is None else now
    category = session.get(Category, product.category_id)
    offers = offer_service.offers_of(session, product_id)
    stores = _by_id(session, Store, {offer.store_id for offer in offers})

    histories: dict[int, list[OfferHist]] = defaultdict(list)
    for row in session.exec(
        select(OfferHist)
        .where(col(OfferHist.offer_id).in_([offer.id for offer in offers]))
        .order_by(OfferHist.offer_id, OfferHist.timestamp, OfferHist.id)
    ).all():
        histories[row.offer_id].append(row)

    offer_histories = [
        OfferHistory(offer_id=offer.id, history=histories[offer.id]) for offer in offers
    ]
    # Neither the best offer nor the product's stock depends on the window.
    offer_stats = compute_product_offer_stats(offer_histories, None, now)
    stale_days = product_stale_days(
        [
            histories[offer.id][-1].timestamp if histories[offer.id] else None
            for offer in offers
        ],
        now,
    )

    return ProductDetailResponse(
        id=product.id,
        name=product.name,
        priority=product.priority,
        category_id=product.category_id,
        category_name=category.name if category else "Unknown",
        category_color=category.color if category else "gray",
        description=product.description,
        currency=offers[0].currency if offers else "",
        offers=[
            OfferDetail(
                **_offer_summary_fields(
                    offer,
                    stores.get(offer.store_id),
                    histories[offer.id][-1] if histories[offer.id] else None,
                    now,
                ),
                price_history=[
                    OfferHistResponse(
                        price=record.price,
                        is_in_stock=record.is_in_stock,
                        timestamp=record.timestamp,
                    )
                    for record in histories[offer.id]
                ],
            )
            for offer in offers
        ],
        is_stale=stale_days is not None,
        stale_days=stale_days,
        best_offer_id=offer_stats.best_offer_id,
        is_in_stock=offer_stats.is_in_stock,
        default_range=str(get_hist_window_size(session)),
        ranges=_range_stats(offer_histories, offer_stats.best_offer_id, now),
    )


# --- Merge ---


_SHARED_FIELDS = ("name", "priority", "category_id", "description")


def merge(
    session: Session, target_id: int, payload: ProductMergeRequest
) -> ProductDetailResponse:
    """Merge another product into ``target_id``.

    Every source offer (with its history) moves to the target, the target
    takes the source's shared fields when ``keep == "source"``, and the
    source product is deleted.

    Raises:
        HTTPException: 400 when merging a product with itself, 404 for an
            unknown product, 409 for another currency or a shared URL.
    """
    if payload.source_product_id == target_id:
        raise HTTPException(
            status_code=400, detail="Cannot merge a product with itself"
        )
    target = _get_or_404(session, target_id)
    source = _get_or_404(session, payload.source_product_id)
    source_offers = offer_service.offers_of(session, source.id)
    for offer in source_offers:
        offer_service.ensure_same_currency(session, target.id, offer.currency)
        offer_service.ensure_unique_url(session, target.id, offer.url)

    for offer in source_offers:
        offer.product_id = target.id
        session.add(offer)
    if payload.keep == "source":
        for field in _SHARED_FIELDS:
            setattr(target, field, getattr(source, field))
        session.add(target)
    # Move the offers before deleting the source, or the cascade takes them.
    session.flush()
    session.delete(source)
    session.commit()
    return get_detail(session, target.id)


# --- AI extraction ---


async def extract_product_info(
    session: Session,
    request: ProductInfoRequest,
) -> ProductInfoResponse:
    """Use Stagehand to extract product information from a URL.

    Reads the active AI provider, language, and category list from the
    database and delegates to ``stagehand_utils.get_product_info``. When
    the URL's domain is not a known store yet, the store is created with
    the extracted name and the favicon downloaded from the page.

    Args:
        session (Session): Active database session.
        request (ProductInfoRequest): Contains the target URL.

    Returns:
        ProductInfoResponse: AI-extracted product information.

    Raises:
        HTTPException: 400 if the AI provider or categories are missing,
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

    # Active AI provider
    provider = load_ai_provider(session)
    if not provider.is_configured():
        raise HTTPException(status_code=400, detail=provider.not_configured_message)

    # Delegate to Stagehand; the favicon is only downloaded for new stores.
    existing_store = store_service.get_by_domain(session, domain)
    result = await get_product_info(
        provider,
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
