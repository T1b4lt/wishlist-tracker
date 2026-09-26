"""Backend side of the shared contracts (see ``contracts/README.md``).

The frontend side lives in ``frontend/src/lib/contracts.test.js``.
"""

from typing import get_args

from src.core.config import (
    CONFIG_DEFAULTS,
    DEFAULT_HIST_WINDOW,
    HIST_WINDOW_OPTIONS,
)
from src.schemas.config import ConfigUpdate
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
