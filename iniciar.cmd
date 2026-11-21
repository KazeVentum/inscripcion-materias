@echo off
rem Levanta toda la simulacion con datos y analitica (Windows: CMD, PowerShell o doble clic).
rem Uso:  iniciar.cmd      (en PowerShell:  .\iniciar.cmd)
rem Solo necesita Docker. Equivale a:  docker compose up -d --build --wait
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo No se encontró Docker. Instala Docker Desktop: https://docs.docker.com/get-docker/
  goto :error
)
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker está instalado pero no está corriendo. Abre Docker Desktop y vuelve a intentar.
  goto :error
)
docker compose version >nul 2>&1
if errorlevel 1 (
  echo Falta Docker Compose v2 ^(el comando "docker compose"^). Actualiza Docker Desktop.
  goto :error
)

rem .env es opcional (compose trae los mismos valores por defecto)
if not exist .env copy .env.example .env >nul

echo Levantando la simulación (la primera vez tarda varios minutos mientras construye)...
docker compose up -d --build --wait --remove-orphans
if errorlevel 1 (
  echo.
  echo Algo falló al levantar. Revisa los logs con:  docker compose logs --tail=50
  goto :error
)

echo.
echo Listo. La aplicación está corriendo:
echo.
echo   Aplicación web   http://localhost:3000
echo   API (OpenAPI)    http://localhost:8000/docs
echo   Consola MinIO    http://localhost:9001   (minio-dev / minio-dev-secret)
echo.
echo   Usuarios: est-000001 ... est-000006 (estudiantes) y coord-0001 (coordinador)
echo   Contraseña: uniminuto2027
echo.
echo   La analítica del coordinador se completa sola en menos de un minuto.
echo   Para detener todo:  docker compose down
echo.
pause
exit /b 0

:error
echo.
pause
exit /b 1
