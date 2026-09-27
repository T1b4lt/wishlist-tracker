"""Helpers to read the table-driven test cases in ``tests/cases/``."""

import json
from pathlib import Path

CASES_DIR = Path(__file__).resolve().parent / "cases"


def load_cases(name: str) -> dict:
    """Load one cases JSON file.

    Args:
        name (str): File name inside ``tests/cases/``
            (e.g. ``"best-offer-cases.json"``).

    Returns:
        dict: The parsed JSON document.
    """
    with (CASES_DIR / name).open(encoding="utf-8") as file:
        return json.load(file)
