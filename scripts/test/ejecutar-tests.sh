#!/bin/bash
echo "Ejecutando pruebas..."
docker compose -f docker-compose.test.yml up --abort-on-container-exit
RESULTADO=$?
docker compose -f docker-compose.test.yml down
exit $RESULTADO
