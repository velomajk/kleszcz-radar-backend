#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
printf 'This permanently deletes the dedicated test PostgreSQL and Redis data. Continue? [y/N] '
read -r answer
[ "$answer" = y ] || [ "$answer" = Y ] || exit 0
docker compose --env-file .env.infrastructure -f compose.infrastructure.yml down --volumes
