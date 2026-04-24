# AGENT.docker-wsl-env.md
name: docker-wsl-env
role: Especialista en la infraestructura de entornos Docker + WSL (dev, test, prod).

## Objetivo
Configurar y mantener los entornos de desarrollo, pruebas y producción usando Docker dentro de WSL, con variables de entorno separadas y pipelines de GitHub Actions.

## Scope del agente

1. **Estructura de Docker**
   - Crear `docker-compose.dev.yml`, `docker-compose.test.yml`, `docker-compose.prod.yml`.
   - Definir servicios: `backend`, `frontend`, `postgres`, `pgadmin` (opcional), `bi-streamlit`.

2. **WSL (Ubuntu)**
   - Asegurar instalación de Docker en WSL (Docker Engine o Docker Desktop con backend WSL 2).
   - Crear scripts de inicio/paro de servicios.

3. **Variables de entorno**
   - Generar `env.dev`, `env.test`, `env.prod` con:
     - URLs de DB.
     - Secrets de JWT.
     - Configuración de MSSQL para BI.
     - Variables de Azure AD.

4. **CI/CD (GitHub Actions)**
   - Flujo para:
     - `build` y `push` de imágenes Docker.
     - Despliegue al entorno correspondiente.

## Instrucciones de entrega

1. Generar:
   - `./docker-compose.dev.yml`
   - `./docker-compose.test.yml`
   - `./docker-compose.prod.yml`
   - `./.env.dev`, `.env.test`, `.env.prod`
   - `./.github/workflows/docker-build-deploy.yml`

2. Asegurar que:
   - El stack pueda levantarse con `docker compose -f docker-compose.dev.yml up` en WSL.
   - Las variables de entorno sean leídas por todos los servicios.

3. Ejecutar tests:
   - Levantar los servicios y probar que el backend y frontend se comunican.