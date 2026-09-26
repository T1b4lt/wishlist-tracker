"""Backend side of the shared contracts (see ``contracts/README.md``).

The frontend side lives in ``frontend/src/lib/contracts.test.js``.
"""

from typing import get_args

import pytest
from src.core.config import (
    CONFIG_DEFAULTS,
    DAILY_CHECK_REPORT_OPTIONS,
    DEFAULT_DAILY_CHECK_REPORT,
    DEFAULT_HIST_WINDOW,
    HIST_WINDOW_OPTIONS,
)
from src.schemas.config import ConfigUpdate
from src.schemas.daily_check import DailyCheckStatusResponse
from src.schemas.product import (
    ProductDashboardSummary,
    ProductDetailResponse,
    ProductHistResponse,
)
from tests.contract_utils import load_contract

HIST_WINDOW = load_contract("hist-window.json")


# --- hist-window.json ---


def test_hist_window_options_match_contract():
    assert list(HIST_WINDOW_OPTIONS) == HIST_WINDOW["options"]


def test_config_update_accepts_exactly_the_contract_options():
    annotation = ConfigUpdate.model_fields["hist_window_size"].annotation
    literal = next(arg for arg in get_args(annotation) if arg is not type(None))

    assert list(get_args(literal)) == HIST_WINDOW["options"]


def test_default_hist_window_matches_contract():
    assert DEFAULT_HIST_WINDOW == HIST_WINDOW["default"]
    assert CONFIG_DEFAULTS["hist_window_size"] == str(HIST_WINDOW["default"])


DAILY_CHECK_REPORT = load_contract("daily-check-report.json")


# --- daily-check-report.json ---


def test_daily_check_report_options_match_contract():
    assert list(DAILY_CHECK_REPORT_OPTIONS) == DAILY_CHECK_REPORT["options"]


def test_config_update_accepts_exactly_the_report_options():
    annotation = ConfigUpdate.model_fields["daily_check_report"].annotation
    literal = next(arg for arg in get_args(annotation) if arg is not type(None))

    assert list(get_args(literal)) == DAILY_CHECK_REPORT["options"]


def test_default_daily_check_report_matches_contract():
    assert DEFAULT_DAILY_CHECK_REPORT == DAILY_CHECK_REPORT["default"]
    assert CONFIG_DEFAULTS["daily_check_report"] == DAILY_CHECK_REPORT["default"]


API_FIELDS = load_contract("api-fields.json")


# --- api-fields.json ---


@pytest.mark.parametrize(
    "schema",
    [
        ProductDashboardSummary,
        ProductDetailResponse,
        ProductHistResponse,
        DailyCheckStatusResponse,
    ],
    ids=lambda schema: schema.__name__,
)
def test_schema_fields_match_contract(schema):
    assert set(schema.model_fields) == set(API_FIELDS[schema.__name__])
