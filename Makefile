.PHONY: analitica seed-local lake-limpiar screenshots up down ps logs clean seed test lint load-test e2e storybook lake simular env

# Exporta las variables de .env a los comandos que lo necesiten
LOAD_ENV = set -a; . ./.env; set +a;

env:
	@test -f .env || (cp .env.example .env && echo ".env creado desde .env.example")

up: env
	# Un solo paso: compose corre primero los one-shot (buckets, topics y datos sinteticos si la
	# base esta vacia) y solo despues arranca api, workers y web. Ver docker-compose.yml.
	docker compose up -d --build --wait --remove-orphans
	@docker compose ps

down:
	docker compose down

ps:
	docker compose ps

logs:
	docker compose logs -f --tail=100

clean:
	docker compose down -v

# Regenera y recarga los datos sinteticos dentro de Docker (borra inscripciones de la demo)
seed: env
	docker compose run --rm --build -e SEED_FORZAR=1 seed

# Misma siembra pero con uv en el host (desarrollo del generador; escribe data/seed/out/)
seed-local: env
	$(LOAD_ENV) cd data/seed && uv run python -m seed.generate && uv run python -m seed.verify && uv run python -m seed.load

test: env
	$(LOAD_ENV) cd data/seed && uv run pytest -q
	$(LOAD_ENV) cd services/api && uv run pytest -q
	$(LOAD_ENV) cd services/enroll-worker && uv run pytest -q
	$(LOAD_ENV) cd services/lake && uv run pytest -q
	cd web && npm test
	cd web && npm run test:stories

lint:
	cd data/seed && uv run ruff check . && uv run mypy
	cd services/api && uv run ruff check . && uv run mypy
	cd services/enroll-worker && uv run ruff check . && uv run mypy
	cd services/lake && uv run ruff check . && uv run mypy
	cd web && npm run typecheck
	cd web && npm run lint

load-test:
	@echo "load-test: disponible en fase 7"

# Playwright contra la app levantada (make up && make seed). WEB_URL cambia el destino.
e2e: env
	$(LOAD_ENV) cd web && npx playwright test

# Capturas de la fase 5 (web/tests/screenshots/fase5) contra la app levantada
screenshots: env
	$(LOAD_ENV) cd web && npm run screenshots:fase5

storybook:
	cd web && npm run storybook

# Bronce -> plata -> oro a demanda (stack levantado). Imprime los conteos de validacion.
lake: env
	$(LOAD_ENV) cd services/lake && uv run python -m lake.cli

# Vacia bronce, plata y oro (empezar una demo sin eventos viejos)
lake-limpiar: env
	$(LOAD_ENV) cd services/lake && uv run python -m lake.cli --limpiar

# Vuelve a simular trafico y recalcula plata -> oro dentro de Docker (servicio analitica-demo)
analitica: env
	docker compose --profile demo run --rm --build analitica-demo

# Trafico real contra la API (estudiantes sinteticos, no los demos). Para partir de cero:
# make seed && make simular && make lake. Opciones: make simular ARGS="--estudiantes 500"
simular: env
	$(LOAD_ENV) cd services/lake && uv run python -m lake.simulador $(ARGS)
