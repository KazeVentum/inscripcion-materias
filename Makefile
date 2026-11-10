.PHONY: up down ps logs clean seed test lint load-test e2e storybook lake env

# Exporta las variables de .env a los comandos que lo necesiten
LOAD_ENV = set -a; . ./.env; set +a;

env:
	@test -f .env || (cp .env.example .env && echo ".env creado desde .env.example")

up: env
	# Levanta todos los servicios de larga vida; los init (profile "init") son one-shot
	docker compose up -d --build --wait --remove-orphans
	docker compose --profile init run --rm --no-deps minio-init
	docker compose --profile init run --rm --no-deps redpanda-init
	@docker compose ps

down:
	docker compose down

ps:
	docker compose ps

logs:
	docker compose logs -f --tail=100

clean:
	docker compose down -v

seed: env
	$(LOAD_ENV) cd data/seed && uv run python -m seed.generate && uv run python -m seed.verify && uv run python -m seed.load

test: env
	$(LOAD_ENV) cd data/seed && uv run pytest -q
	$(LOAD_ENV) cd services/api && uv run pytest -q
	$(LOAD_ENV) cd services/enroll-worker && uv run pytest -q
	cd web && npm test
	cd web && npm run test:stories

lint:
	cd data/seed && uv run ruff check . && uv run mypy
	cd services/api && uv run ruff check . && uv run mypy
	cd services/enroll-worker && uv run ruff check . && uv run mypy
	cd web && npm run typecheck
	cd web && npm run lint

load-test:
	@echo "load-test: disponible en fase 7"

e2e:
	@echo "e2e: disponible en fase 7"

storybook:
	cd web && npm run storybook

lake:
	@echo "lake: disponible en fase 6"
