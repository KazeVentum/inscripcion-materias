# Siembra automática (servicio `seed` de docker compose). Contexto de build: la raíz del repo,
# porque el generador lee data/reference/. Genera en memoria y carga Mongo + Redis.
FROM python:3.12-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv
RUN pip install --no-cache-dir uv==0.12.7
WORKDIR /src
COPY data/seed/pyproject.toml data/seed/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=build /opt/venv /opt/venv
# Misma disposición que el repo: seed/rules.py resuelve data/reference como ../../reference
COPY data/reference /app/data/reference
COPY data/seed/seed /app/data/seed/seed
WORKDIR /app/data/seed
USER app
CMD ["python", "-m", "seed.auto"]
