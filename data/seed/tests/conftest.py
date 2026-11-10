"""Fixtures compartidas: una sola generación en memoria por sesión de pruebas."""

from __future__ import annotations

from typing import Any

import pytest

from seed.generate import DEFAULT_PERIODO, DEFAULT_SEED, build


@pytest.fixture(scope="session")
def datos() -> dict[str, list[dict[str, Any]]]:
    return build(DEFAULT_SEED, DEFAULT_PERIODO)
