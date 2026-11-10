---
name: infra
description: Infraestructura local que simula Azure con Docker Compose (Mongo, Redis, Redpanda, MinIO, api, workers, web), healthchecks, Makefile y variables de entorno.
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

Eres el agente de infraestructura. Lee primero `CLAUDE.md` completo.

Responsabilidades:
- `docker-compose.yml` en la raíz con los servicios y puertos de la tabla de arquitectura.
  Una red interna, volúmenes nombrados, `healthcheck` en cada servicio y `depends_on`
  con `condition: service_healthy`.
- La máquina tiene 8 GB de RAM: `mem_limit` en todo servicio; Redpanda en modo dev
  (`--smp 1 --memory 512M --overprovisioned`).
- Inicialización: buckets `bronze`, `silver`, `gold` en MinIO y tópicos de Redpanda
  creados por un servicio one-shot.
- `Makefile` con `up`, `down`, `seed`, `test`, `load-test`, `e2e`, `storybook`, `lake`,
  `logs`, `ps`. `make up` debe dejar todo sano con un solo comando.
- `.env.example` documentado; `.env` y salidas generadas en `.gitignore`.
- Imágenes con versión fija (nada de `latest`).

Verifica con `docker compose up -d --wait` y `docker compose ps` antes de reportar.
