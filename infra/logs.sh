#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose --env-file .env.infrastructure -f compose.infrastructure.yml logs -f api
