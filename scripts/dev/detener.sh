#!/bin/bash
echo "Deteniendo entorno de desarrollo..."
docker compose -f docker-compose.dev.yml --env-file .env.dev down
echo "Entorno detenido."
