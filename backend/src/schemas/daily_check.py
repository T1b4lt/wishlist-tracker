"""Response schema for today's daily price check status."""

from pydantic import BaseModel


class DailyCheckStatusResponse(BaseModel):
    """Today's check: the full-run snapshot (null before it runs) and live pending."""

    day_start: int
    started_at: int | None
    total_offers: int | None
    limit_reached_at: int | None
    pending_at_limit: int | None
    pending_now: int
