#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
ENV_FILE=.env.infrastructure

if [ ! -f "$ENV_FILE" ]; then
  umask 077
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  REDIS_PASSWORD="$(openssl rand -hex 24)"
  EMAIL_HMAC_SECRET="$(openssl rand -hex 32)"
  IP_HMAC_SECRET="$(openssl rand -hex 32)"
  ADMIN_JWT_SECRET="$(openssl rand -hex 32)"
  {
    printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
    printf 'REDIS_PASSWORD=%s\n' "$REDIS_PASSWORD"
    printf 'EMAIL_HMAC_SECRET=%s\n' "$EMAIL_HMAC_SECRET"
    printf 'IP_HMAC_SECRET=%s\n' "$IP_HMAC_SECRET"
    printf 'ADMIN_JWT_SECRET=%s\n' "$ADMIN_JWT_SECRET"
    printf 'API_PORT=3000\n'
    printf 'PUBLIC_APP_URL=http://localhost:3001\n'
    printf 'API_BASE_URL=http://localhost:3000\n'
    printf 'CORS_ORIGINS=http://localhost:3001\n'
  } > "$ENV_FILE"
  printf 'Generated private infrastructure configuration in %s\n' "$ENV_FILE"
fi

docker compose --env-file "$ENV_FILE" -f compose.infrastructure.yml up --build -d
docker compose --env-file "$ENV_FILE" -f compose.infrastructure.yml ps
printf '\nAPI: http://localhost:3000\n'
printf 'Health: http://localhost:3000/health/ready\n'
printf 'Verification links: ./infra/logs.sh\n'
