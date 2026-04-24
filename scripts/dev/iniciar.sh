#!/bin/bash
echo "Iniciando entorno de desarrollo..."
docker compose -f docker-compose.dev.yml up -d
echo "Esperando a que los servicios estén listos..."
sleep 5
echo "PostgreSQL: http://localhost:5432"
echo "Backend:    http://localhost:4000"
echo "Frontend:   http://localhost:3000"
echo "pgAdmin:    http://localhost:5050"
