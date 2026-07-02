# Radar Kleszczy backend

Privacy-first API for anonymous tick-bite reports and thresholded public heatmaps. It deliberately has no accounts, profiles, photos, free-text health notes, diagnosis, individual public pins, or reminder system.

## Architecture

```text
Web/mobile client
  ├─ Turnstile ── report + exact coordinates (request memory only)
  └─ HTTPS API (Fastify)
       ├─ H3 conversion ── PostgreSQL (cell only)
       ├─ verification mail ── Resend
       ├─ coarse abuse counters ── Redis
       └─ thresholded H3 aggregates ── public map
```

The email is normalized in memory and transformed into a keyed HMAC. Only the HMAC is persisted, in `verification_requests`; reports have no email key. The raw symptom token and magic token are returned/sent once and only SHA-256 hashes are stored. Exact coordinates are converted to an H3 resolution-7 cell before the database insert.

Recommended low-cost deployment: one Railway or Fly service, Neon PostgreSQL in an EU region, Upstash Redis in an EU region, Resend, and Cloudflare Turnstile. Run the API as at least two instances only after traffic justifies it. PostGIS is intentionally unnecessary for the MVP because H3 supplies the public spatial primitive.

## Run locally

Requirements: Node 22+, Docker.

```sh
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev
```

## Run the complete dedicated test infrastructure

Only Docker and OpenSSL are required. Secrets, PostgreSQL credentials, Redis credentials, migrations, networking, and health checks are handled automatically:

```sh
chmod +x infra/*.sh
./infra/up.sh
```

Then open `http://localhost:3000/health/ready`. Test verification emails are printed only to the private API logs:

```sh
./infra/logs.sh
```

Stop without deleting data with `./infra/down.sh`. Use `./infra/reset.sh` only when you deliberately want to delete all test database and Redis data. Customize ports or domains in the generated `.env.infrastructure`; it is mode `0600` and ignored by Git.

Set `TURNSTILE_BYPASS=true` only in local development. `EMAIL_PROVIDER=console` writes the development verification link to server output; never use either setting in production.

Validation:

```sh
npm run typecheck
npm test
npm run build
```

See [docs/architecture.md](docs/architecture.md) for flows, payloads, privacy, abuse controls, retention, security, GDPR decisions, admin operations, and the implementation roadmap.

For an internet-accessible managed deployment, see [render.yaml](render.yaml) and [docs/public-deployment.md](docs/public-deployment.md). This provisions the API, PostgreSQL, private rate-limit storage, migrations, TLS, generated secrets, and retention scheduling from source control.
