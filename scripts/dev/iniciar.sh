#!/bin/bash
echo "Iniciando entorno de desarrollo..."
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d
echo "Esperando a que los servicios estén listos..."
sleep 5
echo "Postgres (Supabase): 127.0.0.1:5432"
echo "Backend:    http://localhost:4000"
echo "Frontend:   http://localhost:3000"
