"""Local-day helpers shared by the cronjob, the API and the daily report.

"Local" is the process local time, set with the ``TZ`` environment variable
(the Docker image defaults to UTC). There is one price record per product
per local day.
"""

from datetime import datetime, timedelta
from datetime import time as dt_time

# From this time on, a run is the day's last chance to send the report.
END_OF_DAY = dt_time(23, 50)


def local_day_bounds(now: datetime) -> tuple[int, int]:
    """Return the Unix timestamps of the start of ``now``'s local day and the next.

    Args:
        now (datetime): A naive local datetime.

    Returns:
        tuple[int, int]: ``(start, end)`` with ``start <= t < end`` for
            every timestamp ``t`` of that day.
    """
    start = datetime.combine(now.date(), dt_time.min)
    return int(start.timestamp()), int((start + timedelta(days=1)).timestamp())


def format_local_time(timestamp: int) -> str:
    """Format a Unix timestamp as local ``HH:MM``.

    Args:
        timestamp (int): Seconds since the epoch.

    Returns:
        str: The local time, e.g. ``"09:05"``.
    """
    return datetime.fromtimestamp(timestamp).strftime("%H:%M")


def is_end_of_day(now: datetime) -> bool:
    """Whether ``now`` is at or after ``END_OF_DAY``.

    Args:
        now (datetime): A naive local datetime.

    Returns:
        bool: True from 23:50 until midnight.
    """
    return now.time() >= END_OF_DAY
