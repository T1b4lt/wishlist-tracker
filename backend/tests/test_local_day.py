"""Tests for the local-day helpers shared by the cronjob and the API."""

from datetime import datetime, timedelta

import pytest
from src.core.local_day import format_local_time, is_end_of_day, local_day_bounds


def test_local_day_bounds_cover_the_whole_local_day():
    now = datetime(2026, 9, 26, 15, 30)
    start, end = local_day_bounds(now)

    assert start == int(datetime(2026, 9, 26).timestamp())
    assert end == int(datetime(2026, 9, 27).timestamp())


def test_local_day_bounds_are_the_same_for_every_moment_of_the_day():
    assert local_day_bounds(datetime(2026, 9, 26, 0, 0)) == local_day_bounds(
        datetime(2026, 9, 26, 23, 59, 59)
    )


def test_format_local_time_uses_hours_and_minutes():
    assert format_local_time(int(datetime(2026, 9, 26, 9, 5).timestamp())) == "09:05"


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (datetime(2026, 9, 26, 23, 49), False),
        (datetime(2026, 9, 26, 23, 50), True),
        (datetime(2026, 9, 26, 23, 59), True),
        (datetime(2026, 9, 26, 12, 0), False),
    ],
)
def test_is_end_of_day_from_23_50(moment, expected):
    assert is_end_of_day(moment) is expected


def test_next_day_starts_where_the_previous_ends():
    today = datetime(2026, 9, 26, 12)
    assert local_day_bounds(today)[1] == local_day_bounds(today + timedelta(days=1))[0]
