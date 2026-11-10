"""Límite simple en memoria de intentos de login fallidos (por usuario y ventana)."""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable

MAX_CLAVES = 10_000


class LimiteIntentos:
    def __init__(
        self,
        maximo: int = 10,
        ventana_s: float = 60.0,
        reloj: Callable[[], float] = time.monotonic,
    ) -> None:
        self.maximo = maximo
        self.ventana_s = ventana_s
        self._reloj = reloj
        self._fallos: dict[str, deque[float]] = {}

    def _limpiar(self, clave: str) -> deque[float]:
        ahora = self._reloj()
        cola = self._fallos.setdefault(clave, deque())
        while cola and ahora - cola[0] >= self.ventana_s:
            cola.popleft()
        return cola

    def espera_s(self, clave: str) -> float:
        """Segundos hasta poder reintentar (0 si no está bloqueado)."""
        cola = self._limpiar(clave)
        if len(cola) < self.maximo:
            if not cola:
                self._fallos.pop(clave, None)
            return 0.0
        return max(0.0, self.ventana_s - (self._reloj() - cola[0]))

    def registrar_fallo(self, clave: str) -> None:
        if len(self._fallos) >= MAX_CLAVES:
            for k in list(self._fallos)[: MAX_CLAVES // 2]:
                self._fallos.pop(k, None)
        self._limpiar(clave).append(self._reloj())
