# Contexto de build: la raiz del repo (como api y enroll-worker). Ver docker-compose.yml.
FROM python:3.12-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv
RUN pip install --no-cache-dir uv==0.12.7
WORKDIR /src
COPY services/lake/pyproject.toml services/lake/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
# httpfs se descarga al construir: en ejecucion el sistema de archivos es de solo lectura
RUN /opt/venv/bin/python -c "import duckdb; c = duckdb.connect(); c.execute(\"SET extension_directory='/opt/duckdb_ext'\"); c.execute('INSTALL httpfs')"

FROM python:3.12-slim
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    DUCKDB_EXTENSION_DIR=/opt/duckdb_ext
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=build /opt/venv /opt/venv
COPY --from=build /opt/duckdb_ext /opt/duckdb_ext
WORKDIR /app
COPY services/lake/lake ./lake
USER app
CMD ["python", "-m", "lake.main"]
