"""
Offer check service — fetch, validate and store one offer's daily status.

Shared by the daily cronjob (``product_status_cronjob``) and the API, which
checks an offer right after it is added or its URL changes, so a new store
gets its price without waiting for the next daily run, and when the user
refreshes it by hand. There is one record per offer per local day: an offer
already recorded today is skipped (by the daily run too), except after a URL
change or a manual refresh, whose new record replaces the day's record.
"""

import logging
import math
from datetime import datetime
from enum import Enum

from fastapi import HTTPException
from sqlalchemy.orm.exc import ObjectDeletedError
from sqlmodel import Session, delete, select
from src.ai.base import AIProvider, ProviderErrorKind, ProviderUnavailableError
from src.ai.factory import load_ai_provider
from src.core.config import get_config_value
from src.core.database import engine
from src.core.local_day import local_day_bounds
from src.models.database_models import (
    DailyCheckRun,
    Offer,
    OfferHist,
    PendingStatusRetry,
    Product,
    Store,
)
from src.services import daily_check_service
from src.stagehand_utils import get_product_status
from src.telegram_utils import send_price_drop_alert, send_stock_alert

logger = logging.getLogger(__name__)


# Why a pass stopped early (``DailyCheckRun.limit_reason``).
LIMIT_REASON_QUOTA = "quota"
LIMIT_REASON_UNAVAILABLE = "unavailable"


class CheckOutcome(Enum):
    """Result of checking one offer."""

    STORED = "stored"  # A new history record was stored.
    SKIPPED = "skipped"  # The offer already had a record today (or is gone).
    FAILED = "failed"  # Invalid price or non-quota error; nothing stored.
    RATE_LIMITED = "rate_limited"  # The Gemini quota ran out.
    PROVIDER_UNAVAILABLE = "provider_unavailable"  # The AI provider is unreachable.

    @property
    def limit_reason(self) -> str | None:
        """The ``DailyCheckRun.limit_reason`` this outcome stops a pass with."""
        return {
            CheckOutcome.RATE_LIMITED: LIMIT_REASON_QUOTA,
            CheckOutcome.PROVIDER_UNAVAILABLE: LIMIT_REASON_UNAVAILABLE,
        }.get(self)

    @property
    def stops_run(self) -> bool:
        """Whether every later check would fail too, so the pass must stop."""
        return self.limit_reason is not None


def record_stop(run: DailyCheckRun, stopped_at: int, reason: str, pending: int) -> None:
    """Record a provider-wide stop in today's run (the caller commits).

    The first stop of the day is kept as the snapshot (``limit_reached_at``,
    ``pending_at_limit``, ``limit_reason``) and never overwritten. Separately,
    the first time the provider is found unavailable is kept in
    ``provider_unavailable_at``, even when the day's first stop was a quota
    error or the full run finished cleanly, so the Telegram alert still goes
    out.

    Args:
        run (DailyCheckRun): Today's run.
        stopped_at (int): Unix time of the stop.
        reason (str): ``LIMIT_REASON_QUOTA`` or ``LIMIT_REASON_UNAVAILABLE``.
        pending (int): Offers left pending by the stop.
    """
    if run.limit_reached_at is None:
        run.limit_reached_at = stopped_at
        run.pending_at_limit = pending
        run.limit_reason = reason
    if reason == LIMIT_REASON_UNAVAILABLE and run.provider_unavailable_at is None:
        run.provider_unavailable_at = stopped_at


async def _check_price_drop(
    product,
    offer,
    store_name,
    product_status,
    last_in_stock_hist,
    telegram_bot_token,
    telegram_bot_chat_id,
    selected_language,
):
    """Send a Telegram alert if the price dropped while in stock.

    Only prices you could actually buy are compared: the new status must be
    in stock and cheaper than the most recent in-stock record.

    Args:
        product: The Product record.
        offer: The Offer record that was checked.
        store_name (str | None): The offer's store name.
        product_status: Freshly scraped (and validated) status.
        last_in_stock_hist: The most recent in-stock OfferHist record,
            or None if the product was never in stock.
        telegram_bot_token (str): Bot token.
        telegram_bot_chat_id (str): Chat ID.
        selected_language (str): Language code.
    """
    if not product_status.is_in_stock or last_in_stock_hist is None:
        return
    if product_status.price < last_in_stock_hist.price:
        logger.info(
            f"Price drop detected for {product.name}: "
            f"{last_in_stock_hist.price} -> {product_status.price} {offer.currency}"
        )
        try:
            await send_price_drop_alert(
                bot_token=telegram_bot_token,
                chat_id=telegram_bot_chat_id,
                product_name=product.name,
                product_url=offer.url,
                old_price=last_in_stock_hist.price,
                new_price=product_status.price,
                lang=selected_language,
                currency=offer.currency,
                store_name=store_name,
            )
            logger.info(f"Price drop alert sent for {product.name}")
        except Exception as e:
            logger.error(
                f"Failed to send price drop alert for {product.name}: {str(e)}"
            )


async def _check_stock_change(
    product,
    offer,
    store_name,
    product_status,
    last_hist,
    telegram_bot_token,
    telegram_bot_chat_id,
    selected_language,
):
    """Send a Telegram alert if the product came back in stock.

    Args:
        product: The Product record.
        offer: The Offer record that was checked.
        store_name (str | None): The offer's store name.
        product_status: Freshly scraped status.
        last_hist: The most recent OfferHist record.
        telegram_bot_token (str): Bot token.
        telegram_bot_chat_id (str): Chat ID.
        selected_language (str): Language code.
    """
    if not last_hist.is_in_stock and product_status.is_in_stock:
        logger.info(f"Stock availability detected for {product.name}: now in stock")
        try:
            await send_stock_alert(
                bot_token=telegram_bot_token,
                chat_id=telegram_bot_chat_id,
                product_name=product.name,
                product_url=offer.url,
                current_price=product_status.price,
                lang=selected_language,
                currency=offer.currency,
                store_name=store_name,
            )
            logger.info(f"Stock alert sent for {product.name}")
        except Exception as e:
            logger.error(f"Failed to send stock alert for {product.name}: {str(e)}")


def load_telegram_settings(session: Session) -> dict:
    """Read all Telegram-related settings from the Config table.

    Args:
        session (Session): Active database session.

    Returns:
        dict: Keys ``token``, ``chat_id``, ``price_drop``, ``stock_change``,
              ``language``, and ``enabled``.
    """
    token = get_config_value(session, "telegram_bot_token")
    chat_id = get_config_value(session, "telegram_bot_chat_id")
    is_price_drop = (
        get_config_value(session, "is_price_drop_alert", "false").lower() == "true"
    )
    is_stock_change = (
        get_config_value(session, "is_stock_change_alert", "false").lower() == "true"
    )
    language = get_config_value(session, "selected_language", "english")

    return {
        "token": token,
        "chat_id": chat_id,
        "price_drop": is_price_drop,
        "stock_change": is_stock_change,
        "language": language,
        "enabled": bool(token and chat_id),
    }


# Telegram settings for a check that must not send alerts.
NO_ALERTS = {"enabled": False}


def _is_valid_price(price) -> bool:
    """Whether a scraped price can be stored (finite and positive).

    Args:
        price: The scraped price.

    Returns:
        bool: True for a finite number greater than zero.
    """
    return (
        isinstance(price, int | float)
        and not isinstance(price, bool)
        and math.isfinite(price)
        and price > 0
    )


def has_record_between(session: Session, offer_id: int, start: int, end: int) -> bool:
    """Whether the offer already has a history record in ``[start, end)``."""
    return (
        session.exec(
            select(OfferHist.id).where(
                OfferHist.offer_id == offer_id,
                OfferHist.timestamp >= start,
                OfferHist.timestamp < end,
            )
        ).first()
        is not None
    )


def _last_record(session: Session, offer_id: int, in_stock_only: bool = False):
    """Return the offer's most recent record (optionally only in-stock ones)."""
    query = select(OfferHist).where(OfferHist.offer_id == offer_id)
    if in_stock_only:
        query = query.where(OfferHist.is_in_stock == True)  # noqa: E712
    return session.exec(
        query.order_by(OfferHist.timestamp.desc(), OfferHist.id.desc())
    ).first()


async def check_offer(
    session: Session,
    offer: Offer,
    provider: AIProvider,
    tg: dict,
    now: datetime,
    replace_today: bool = False,
) -> CheckOutcome:
    """Fetch, validate and store one offer's status, sending alerts.

    Args:
        session (Session): Active database session.
        offer (Offer): The offer (a product in one store) to check.
        provider (AIProvider): The active AI provider.
        tg (dict): Telegram settings from ``load_telegram_settings``, or
            ``NO_ALERTS``.
        now (datetime): Naive local time of the check.
        replace_today (bool): Check even if the offer already has a record
            today, and replace it with the new one once stored (used after a
            URL change, when today's record belongs to the old URL).

    Returns:
        CheckOutcome: What happened to the offer.
    """
    # The user may remove a store (or its product) while a long run is in
    # progress: skip it instead of stopping the whole run.
    try:
        product = session.get(Product, offer.product_id)
    except ObjectDeletedError:
        product = None
    if product is None:
        logger.warning("Skipping an offer that was deleted during the run")
        return CheckOutcome.SKIPPED
    store = session.get(Store, offer.store_id) if offer.store_id is not None else None
    store_name = store.name if store else None
    label = f"{product.name} @ {store_name or offer.url} (offer ID: {offer.id})"
    day_start, day_end = local_day_bounds(now)
    try:
        if not replace_today and has_record_between(
            session, offer.id, day_start, day_end
        ):
            logger.info(f"Skipping {label}: already checked today")
            return CheckOutcome.SKIPPED

        logger.info(f"Fetching product status for: {label}")
        product_status = await get_product_status(provider, offer.url)

        if not _is_valid_price(product_status.price):
            logger.error(
                f"Invalid price {product_status.price!r} for {label}; nothing stored"
            )
            return CheckOutcome.FAILED

        # The scrape takes a while: another check (the cronjob or the API)
        # may have stored today's record meanwhile.
        if not replace_today and has_record_between(
            session, offer.id, day_start, day_end
        ):
            logger.info(f"Skipping {label}: checked by another run meanwhile")
            return CheckOutcome.SKIPPED

        # Conditional alerts
        if tg["enabled"]:
            if tg["price_drop"]:
                await _check_price_drop(
                    product,
                    offer,
                    store_name,
                    product_status,
                    _last_record(session, offer.id, in_stock_only=True),
                    tg["token"],
                    tg["chat_id"],
                    tg["language"],
                )
            last_offer_hist = _last_record(session, offer.id)
            if tg["stock_change"] and last_offer_hist:
                await _check_stock_change(
                    product,
                    offer,
                    store_name,
                    product_status,
                    last_offer_hist,
                    tg["token"],
                    tg["chat_id"],
                    tg["language"],
                )

        if replace_today:
            session.exec(
                delete(OfferHist).where(
                    OfferHist.offer_id == offer.id,
                    OfferHist.timestamp >= day_start,
                    OfferHist.timestamp < day_end,
                )
            )

        # Store new history record
        session.add(
            OfferHist(
                offer_id=offer.id,
                price=product_status.price,
                is_in_stock=product_status.is_in_stock,
                timestamp=int(now.timestamp()),
            )
        )
        session.commit()

        logger.info(
            f"Stored price {product_status.price} / stock {product_status.is_in_stock} "
            f"for {label}"
        )
        return CheckOutcome.STORED

    except Exception as e:
        kind = provider.classify_error(e)
        if kind is ProviderErrorKind.QUOTA_EXHAUSTED:
            logger.warning(f"Gemini quota exhausted while checking {label}: {str(e)}")
            return CheckOutcome.RATE_LIMITED
        if kind is ProviderErrorKind.UNAVAILABLE:
            # A timeout or a runner crash on one heavy page looks like an
            # outage; if the instance still answers, only this offer failed
            # (otherwise it would block every later offer all day).
            try:
                await provider.preflight()
            except ProviderUnavailableError:
                logger.warning(
                    f"{provider.describe()} unavailable while checking {label}: "
                    f"{str(e)}"
                )
                return CheckOutcome.PROVIDER_UNAVAILABLE
            logger.error(
                f"Error processing {label} ({provider.describe()} still up): {str(e)}"
            )
            return CheckOutcome.FAILED
        logger.error(f"Error processing {label}: {str(e)}")
        return CheckOutcome.FAILED


async def check_offer_now(
    offer_id: int, url_changed: bool = False, now: datetime | None = None
) -> None:
    """Check one offer right away, outside the daily run.

    Run as a background task after an offer is added (with a new product or
    to an existing one) or its URL changes. No Telegram alerts are sent: the
    user is looking at the offer, and after a URL change the previous price
    belongs to another page.

    When today's daily run has already started, a new offer is added to its
    ``total_offers``, and an offer that hits a provider-wide stop (Gemini
    quota or provider unavailable) becomes a pending retry for today (before
    the daily run, that run covers it).

    Args:
        offer_id (int): The offer to check.
        url_changed (bool): The offer's URL changed; its new record replaces
            today's record of the old URL.
        now (datetime | None): Naive local time; defaults to ``datetime.now()``.
    """
    now = now or datetime.now()
    with Session(engine) as session:
        offer = session.get(Offer, offer_id)
        if offer is None:
            return
        provider = load_ai_provider(session)
        if not provider.is_configured():
            logger.info(
                f"{provider.label} not configured; offer left for the daily run"
            )
            return

        daily_run = daily_check_service.get_today_run(session, now)
        if daily_run is not None and not url_changed:
            daily_run.total_offers += 1
            session.add(daily_run)
            session.commit()

        outcome = await check_offer(
            session, offer, provider, NO_ALERTS, now, replace_today=url_changed
        )

        if outcome.stops_run and daily_run is not None:
            day_start, _ = local_day_bounds(now)
            session.merge(PendingStatusRetry(offer_id=offer_id, day_start=day_start))
            record_stop(daily_run, int(now.timestamp()), outcome.limit_reason, 1)
            session.add(daily_run)
            session.commit()


async def refresh_offer(offer_id: int, now: datetime | None = None) -> CheckOutcome:
    """Check one offer now at the user's request, replacing today's record.

    The new record counts as the offer's check for the day, so the daily run
    and the retries skip it afterwards; if the offer already had a record
    today, it is replaced once the new one is stored (a failed check keeps
    it). Telegram alerts are sent as in the daily run, compared with the
    offer's latest record (today's one, if any).

    A stored record takes the offer out of today's pending retries. A
    provider-wide stop (Gemini quota or provider unavailable) after the
    daily run started is recorded in it, and an offer still without a
    record today becomes a pending retry.

    Args:
        offer_id (int): The offer to check.
        now (datetime | None): Naive local time; defaults to ``datetime.now()``.

    Returns:
        CheckOutcome: ``STORED``, ``FAILED``, ``RATE_LIMITED`` or
            ``PROVIDER_UNAVAILABLE``.

    Raises:
        HTTPException: 404 for an unknown offer (or one deleted during the
            check), 409 when no AI provider is configured.
    """
    now = now or datetime.now()
    day_start, day_end = local_day_bounds(now)
    with Session(engine) as session:
        offer = session.get(Offer, offer_id)
        if offer is None:
            raise HTTPException(status_code=404, detail="Offer not found")
        provider = load_ai_provider(session)
        if not provider.is_configured():
            raise HTTPException(
                status_code=409, detail=f"{provider.label} is not configured"
            )

        outcome = await check_offer(
            session,
            offer,
            provider,
            load_telegram_settings(session),
            now,
            replace_today=True,
        )

        if outcome is CheckOutcome.SKIPPED:
            raise HTTPException(status_code=404, detail="Offer not found")
        if outcome is CheckOutcome.STORED:
            session.exec(
                delete(PendingStatusRetry).where(
                    PendingStatusRetry.offer_id == offer_id
                )
            )
            session.commit()
        elif outcome.stops_run:
            daily_run = daily_check_service.get_today_run(session, now)
            if daily_run is not None:
                if not has_record_between(session, offer_id, day_start, day_end):
                    session.merge(
                        PendingStatusRetry(offer_id=offer_id, day_start=day_start)
                    )
                record_stop(daily_run, int(now.timestamp()), outcome.limit_reason, 1)
                session.add(daily_run)
                session.commit()
        return outcome
