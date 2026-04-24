#!/bin/bash
echo "Deteniendo entorno de desarrollo..."
docker compose -f docker-compose.dev.yml down
echo "Entorno detenido."
