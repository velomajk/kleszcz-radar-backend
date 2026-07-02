# Public deployment

The production target is Render, described entirely by `render.yaml`. A Blueprint provisions:

- a public HTTPS API in Frankfurt;
- managed PostgreSQL on a private connection;
- private Redis-compatible Key Value storage for rate limits;
- a pre-deploy database migration;
- generated HMAC and admin secrets;
- a daily retention cron job.

## Values that cannot be invented by infrastructure

Deployment still needs five product/provider values:

| Variable | Source |
|---|---|
| `PUBLIC_APP_URL` | Public frontend origin, such as `https://radar.example` |
| `API_BASE_URL` | API origin assigned by Render or custom API domain |
| `CORS_ORIGINS` | Allowed frontend origins, comma-separated |
| `EMAIL_FROM`, `RESEND_API_KEY` | Verified Resend sending domain and key |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile widget secret |

These are prompted once during Blueprint creation and stored by Render. They are never committed. PostgreSQL, Key Value connection strings, and cryptographic application secrets are created and wired automatically.

## Deployment workflow

1. Push this repository to GitHub or GitLab.
2. Connect that repository as a Render Blueprint.
3. Supply the five provider/product values above.
4. Render provisions the datastores, runs the migration, starts the API, and issues TLS.
5. Commits to the deployment branch trigger subsequent deployments; migrations run before traffic moves to the new release.

The API can initially use its Render subdomain. A custom domain can be attached later without changing the application architecture.

Do not set `TURNSTILE_BYPASS=true` on the public deployment. Do not use the console email adapter publicly because it places recipient addresses and verification URLs in service logs.
