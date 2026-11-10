# Contexto de build: la raíz del repo (necesita services/lua). Ver docker-compose.yml.
FROM python:3.12-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv
RUN pip install --no-cache-dir uv==0.12.7
WORKDIR /src
COPY services/enroll-worker/pyproject.toml services/enroll-worker/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 LUA_DIR=/app/lua
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY services/enroll-worker/worker ./worker
COPY services/lua ./lua
USER app
CMD ["python", "-m", "worker.main"]
