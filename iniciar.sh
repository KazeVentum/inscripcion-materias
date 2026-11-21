#!/bin/sh
# Levanta toda la simulación con datos y analítica (macOS, Linux, WSL o Git Bash en Windows).
# Uso:  ./iniciar.sh        (o:  sh iniciar.sh)
# Solo necesita Docker. Equivale a:  docker compose up -d --build --wait
set -e
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "No se encontró Docker. Instala Docker Desktop: https://docs.docker.com/get-docker/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker está instalado pero no está corriendo. Abre Docker Desktop y vuelve a intentar."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Falta Docker Compose v2 (el comando 'docker compose'). Actualiza Docker Desktop."
  exit 1
fi

# .env es opcional (compose trae los mismos valores por defecto); se crea para las herramientas
# de desarrollo que corren en el host (make test, make lake...).
[ -f .env ] || cp .env.example .env

echo "Levantando la simulación (la primera vez tarda varios minutos mientras construye)..."
if ! docker compose up -d --build --wait --remove-orphans; then
  echo
  echo "Algo falló al levantar. Revisa los logs con:  docker compose logs --tail=50"
  exit 1
fi

cat <<'FIN'

Listo. La aplicación está corriendo:

  Aplicación web   http://localhost:3000
  API (OpenAPI)    http://localhost:8000/docs
  Consola MinIO    http://localhost:9001   (minio-dev / minio-dev-secret)

  Usuarios: est-000001 ... est-000006 (estudiantes) y coord-0001 (coordinador)
  Contraseña: uniminuto2027

  La analítica del coordinador se completa sola en menos de un minuto.
  Para detener todo:  docker compose down
FIN
