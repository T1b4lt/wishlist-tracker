"""Helpers to read the shared frontend/backend contracts in ``/contracts``.

See ``contracts/README.md`` at the repository root.
"""

import json
from pathlib import Path

CONTRACTS_DIR = Path(__file__).resolve().parents[2] / "contracts"


def load_contract(name: str) -> dict:
    """Load one contract JSON file.

    Args:
        name (str): File name inside ``contracts/`` (e.g. ``"hist-window.json"``).

    Returns:
        dict: The parsed JSON document.
    """
    with (CONTRACTS_DIR / name).open(encoding="utf-8") as file:
        return json.load(file)
