"""Aplicación FastAPI: API de inscripción de asignaturas."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import AsyncMongoClient
from redis.asyncio import Redis

from . import claves, scripts
from .analitica import LectorOro
from .catalogo import Catalogo
from .config import Settings
from .contexto import Contexto
from .coordinacion import router as router_coordinacion
from .errores import registrar_manejadores
from .eventos import Productor
from .recomendaciones import RecomendadorHeuristico
from .rutas import router
from .stream import Difusor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("api")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = Settings()
    mongo: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(settings.mongo_url)
    db = mongo.get_default_database()
    redis: Redis = Redis.from_url(settings.redis_url, decode_responses=True)
    catalogo = Catalogo(settings.periodo)
    await catalogo.cargar(db)
    productor = Productor(settings.kafka_brokers)
    await productor.iniciar()
    difusor = Difusor(redis, claves.canal_cupos(settings.periodo), settings.max_sse_por_estudiante)
    difusor.iniciar()
    app.state.lector_oro = LectorOro(settings)
    app.state.ctx = Contexto(
        settings=settings,
        db=db,
        redis=redis,
        catalogo=catalogo,
        productor=productor,
        difusor=difusor,
        lua_reservar=scripts.cargar(redis, "reservar"),
        lua_devolver=scripts.cargar(redis, "devolver"),
        recomendador=RecomendadorHeuristico(),
    )
    log.info("api lista: %d NRC, %d materias", len(catalogo.nrc_info), len(catalogo.materias))
    try:
        yield
    finally:
        await difusor.detener()
        await productor.detener()
        await redis.aclose()
        await mongo.close()
        await asyncio.sleep(0)


def crear_app() -> FastAPI:
    """Fábrica de la app (uvicorn --factory). Falla si faltan JWT_SECRET o DEMO_PASSWORD."""
    settings = Settings()
    app = FastAPI(
        title="API de inscripción de asignaturas",
        version="0.1.0",
        description="Simulación local UNIMINUTO: oferta filtrada, reserva atómica y cupos en vivo.",
        docs_url="/docs",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    registrar_manejadores(app)
    app.include_router(router, prefix="/api/v1")
    app.include_router(router_coordinacion, prefix="/api/v1")
    return app
