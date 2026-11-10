# Contexto de build: la raíz del repo (necesita services/lua). Ver docker-compose.yml.
FROM python:3.12-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv
RUN pip install --no-cache-dir uv==0.12.7
WORKDIR /src
COPY services/api/pyproject.toml services/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 LUA_DIR=/app/lua
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY services/api/app ./app
COPY services/lua ./lua
USER app
EXPOSE 8000
CMD ["uvicorn", "--factory", "app.main:crear_app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
