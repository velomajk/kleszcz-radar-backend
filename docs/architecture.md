# Backend design

## 1. Recommended architecture

A standalone Fastify/TypeScript API is preferable to Next.js routes here: one long-running service gives predictable database pooling, Redis limits, background cleanup, structured logs, and portable deployment. PostgreSQL is authoritative storage; Redis holds disposable rate-limit counters; H3 resolution 7 is the ingestion grid. Resend and Turnstile are replaceable adapters.

The trust boundaries are:

1. Raw email, IP, coordinates, and challenge token exist only in request memory.
2. A pending verification row contains HMAC(email), HMAC(coarse IP prefix), H3 cell, structured draft, score, and expiry. It contains no plaintext contact data or exact coordinates.
3. A report contains the bite facts and H3 cell, but no email/IP pseudonym.
4. Symptoms join only to the report and contain boolean flags plus timestamps.
5. Public responses are computed after all filters, suppress cells below `k`, and bucket counts in groups of five.

## 2–3. Schema and tables

The executable Drizzle schema is in `src/db/schema.ts`; generated SQL is under `drizzle/`.

| Table | Purpose | Privacy notes |
|---|---|---|
| `verification_requests` | Expiring, one-time report draft | HMAC email/IP only; no exact coordinates |
| `reports` | Verified bite report | H3 cell, structured enums, score/moderation; no contact key |
| `symptom_access_tokens` | Private follow-up capability | SHA-256 token hash only; one per report |
| `symptoms` | Optional structured follow-up | Boolean flags and timestamps only; no free text/diagnosis |
| `abuse_events` | Abuse counters and reasons | A row never combines a report ID with email/IP pseudonyms |
| `settings` | Runtime privacy threshold | Admin-controlled, bounded to 5–100 |
| `admin_audit_log` | Accountability for moderation/settings | Admin subject and reason |
| `public_cells` | Optional future materialized cache | Aggregated payload only |

`duplicate_of_id` intentionally is not publicly exposed. In a larger deployment it can become a self-referencing foreign key after deletion policy is finalized.

## 4. Privacy model

- H3 resolution 7 is about a few square kilometres, depending on latitude. Validate this choice with a Polish re-identification threat model; use a coarser parent cell in sparse regions.
- Do not enable SQL query logging with bound parameters in production. Application log redaction covers email, tokens, challenge token, and authorization headers.
- HMAC secrets for email and IP must be unrelated and stored in a secret manager. HMAC is used rather than an unkeyed hash because email dictionaries are easy to enumerate.
- HMAC values are pseudonymous personal data, not anonymous data. Public aggregates may be treated as anonymous only after a documented re-identification assessment.
- Count suppression is applied after time/place/subject/area filters. Counts are bucketed to reduce differencing attacks. Also restrict query rate and available filter combinations.
- There is no endpoint returning a report, report ID, coordinate, symptom record, or individual pin to the public.

## 5–8. User flows

### Email verification and report creation

1. Client sends one report, email, and Turnstile token to `POST /v1/report-verifications`.
2. API validates strict enums/ranges, challenge, per-IP and per-email limits.
3. Coordinates are converted immediately to H3. Email is normalized and HMACed; IP is truncated then HMACed.
4. API persists an expiring draft and sends a random 256-bit token in a frontend magic link.
5. Frontend posts the token to `/confirm`. This avoids mail scanners consuming a link via GET.
6. A transaction atomically consumes the token, detects likely duplicates, creates/moderates the report, and creates a symptom token.
7. The raw symptom URL is returned once. Losing it is unrecoverable by design; no email is retained for recovery.

### Symptom follow-up

The frontend reads the token from its private URL and passes it in `X-Symptom-Token`; the token is never placed in an API path or query string. `GET /v1/symptoms/status` checks validity without returning health flags. `PUT /v1/symptoms` upserts the structured flags. Links expire after 45 days by default. No reminders or outbound follow-up exist.

The UI must show: “This is not a diagnosis. If symptoms are severe or concerning, contact a qualified clinician or emergency service.” The API response repeats the non-diagnosis statement but is not a medical triage system.

## 9. Heatmap aggregation

For each request, determine the start date (`7d`, `14d`, `30d`, or March 1 of the current tick season), apply optional place/subject/bounding-box filters, include only `visible` reports, group by H3 cell, then apply `HAVING count(*) >= k`. Return H3 IDs with `low/medium/high` intensity and five-report count buckets. A bounding box is polyfilled to H3 cells and capped at 50,000 cells.

For material traffic, refresh aggregate tables every 5–15 minutes and cache by a whitelist of filter combinations. Never cache or materialize sub-threshold groups. Consider complementary suppression or differential privacy before offering many overlapping filters to research partners.

## 10–11. API and payload examples

All endpoints use HTTPS and JSON except the admin CSV export.

`POST /v1/report-verifications`

```json
{
  "email": "person@example.org",
  "turnstileToken": "turnstile-response",
  "latitude": 52.2297,
  "longitude": 21.0122,
  "occurredOn": "2026-07-01",
  "placeType": "park",
  "subjectType": "adult",
  "tickRemoved": true,
  "removalMethod": "tweezers",
  "estimatedAttachmentHours": 8
}
```

Response `202`: `{"status":"verification_sent","expiresInSeconds":1200}`. The response is intentionally identical regardless of historical email use.

`POST /v1/report-verifications/confirm`

```json
{"token":"long-random-token-from-the-email-link"}
```

Response `201`:

```json
{
  "status": "report_created",
  "symptomUrl": "https://app.example/symptoms/private-random-token",
  "symptomLinkExpiresAt": "2026-08-16T12:00:00.000Z"
}
```

`PUT /v1/symptoms` with `X-Symptom-Token: …`:

```json
{
  "rash": true,
  "expandingRash": false,
  "fever": false,
  "headache": true,
  "muscleOrJointPain": false,
  "neckStiffness": false,
  "nauseaOrVomiting": false,
  "neurologicalSymptoms": false,
  "doctorContacted": true,
  "observedAt": "2026-07-05T10:30:00.000Z"
}
```

`GET /v1/heatmap?window=14d&placeType=park&subjectType=adult&north=54.8&south=49&east=24.2&west=14.1`

```json
{
  "generatedAt": "2026-07-02T12:00:00.000Z",
  "window": "14d",
  "resolution": 7,
  "minimumCellCount": 7,
  "cells": [{"cell":"871e20440ffffff","countBucket":10,"intensity":"low"}]
}
```

Errors have a stable form: `{"error":{"code":"validation_error","message":"Invalid request","details":[]}}`.

## 12. Rate limiting and abuse

- Edge/WAF: bot rules, request-size limit, Turnstile, country-independent throttling.
- API: 20 verification starts/minute/IP, 10 confirms/minute/IP, 60 heatmaps/minute/IP, 10 symptom writes/minute/IP.
- Redis business limits: 4 verification attempts/day/email HMAC and 10/day/coarse-IP HMAC. Add rolling 7-day limits when real traffic establishes baselines.
- Duplicate signal: same day, cell, subject and place within 24 hours adds 35 points and defaults to review. It must not automatically merge genuine bites.
- Signals: missing/implausible user agent, old reports, burst velocity, repeated cells, failed challenge, disposable-email intelligence (only if contractually/privacy approved). Store interpretable reasons, not opaque profiling.
- Fail closed for report creation if Redis or Turnstile is unavailable; heatmap reads can remain available. Alert on spikes and provider failures.
- Periodically rotate HMAC secrets by versioning the digest (`v2:...`) and accepting both versions during the retention window.

## 13. Admin API

Admin endpoints require a short-lived JWT with issuer, audience, role, subject, and expiry. Issue it through an external workforce IdP; the application still has no public user accounts.

| Endpoint | Function |
|---|---|
| `GET /v1/admin/stats` | 30-day aggregate reports/symptoms/abuse metrics |
| `GET /v1/admin/reports/suspicious` | Paginated moderation queue |
| `PATCH /v1/admin/reports/:id/moderation` | visible/excluded/review with mandatory reason |
| `PUT /v1/admin/settings/privacy-threshold` | Set `k` from 5–100 |
| `GET /v1/admin/exports/aggregates.csv?from=&to=` | Weekly, coarser-H3, thresholded partner export |

All mutations are audit logged. Separate `viewer`, `moderator`, and `exporter` roles before onboarding staff; the MVP currently accepts only `role=admin`. Exports are aggregated, not row-level “anonymized” dumps.

## 14. Retention

Recommended starting schedule, subject to the controller's documented purpose and legal basis:

| Data | Retention |
|---|---|
| Unconsumed verification requests | delete 24 hours after expiry |
| Consumed verification requests and email/IP HMAC | delete after 30 days |
| Redis rate counters | 1–7 days |
| Abuse events containing HMACs | 30 days; aggregate metrics 12 months |
| Symptom token hashes | delete/revoke 45 days after creation |
| Application security logs | 14–30 days; no request bodies |
| Verified reports and symptoms | review annually; retain only while the civic/statistical purpose remains valid |
| Public aggregate cache | minutes; research aggregate exports per partner agreement |
| Admin audit logs | 12–24 months |

Run `npm run db:cleanup` daily from the hosting scheduler. It removes expired verification/token records, clears aged abuse HMACs, and expires old abuse detail. At larger volume, change the deletes to indexed batches. Backups must inherit deletion limits and encryption; document the delayed erasure window for immutable backups.

## 15. Security

- TLS everywhere; EU regions; encryption at rest; private database/Redis networking; least-privilege database role.
- Managed secret storage and rotation; never share HMAC, JWT, database, or provider secrets.
- Verify proxy trust configuration on the chosen host so attackers cannot spoof the client IP.
- Short-lived admin JWTs, IdP MFA, explicit audience/issuer, role separation, audit alerts.
- Strict JSON schemas, 32 KiB bodies, parameterized ORM queries, no free text or uploads.
- Dependency/secret scanning, lockfile pinning, CI typecheck/tests/build, database migration review.
- Backups plus restore drills, provider DPAs, subprocessor inventory, incident response and breach workflow.
- Add CSRF protection if admin authentication ever moves from bearer headers to cookies. Use `Referrer-Policy: no-referrer` on frontend pages containing a symptom token and never load third-party analytics there.

## 16. GDPR/privacy considerations

This architecture reduces risk; it is not a legal compliance determination. Bite and symptom data may be health data, location can be identifying, and HMAC email/IP values remain pseudonymous data. Before launch the controller should:

1. Identify and document an Article 6 legal basis and, if the data are linked or linkable to a person, an Article 9 condition for health data. Do not assume “anonymous app” removes GDPR.
2. Complete a DPIA because location plus health-related reports, children, public visualization, and systematic aggregation may create high risk.
3. Publish an Article 13 notice: controller/DPO, purposes, bases, fields, recipients/processors, transfers, retention, rights, complaint to UODO, and whether provision is required.
4. Execute Article 28 processor agreements and assess international transfers for hosting, email, Turnstile, logging, and support access.
5. Maintain records of processing, legitimate-interest assessment if used, security measures, deletion evidence, rights-handling process, and breach response.
6. Define how a person can exercise rights without an account. A private symptom token can authorize symptom access/update, but report erasure is harder once unlinkability is intentionally created; explain this transparently and avoid collecting identity merely to enable rights.
7. Perform a re-identification/differencing test before calling public cells anonymous. Re-test when resolution, threshold, filters, exports, or external datasets change.

Primary references: [GDPR Articles 5, 6, 9, 25, 28, 32, 35 and 89](https://eur-lex.europa.eu/eli/reg/2016/679/oj) and [EDPB Guidelines 01/2025 on pseudonymisation](https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-012025-pseudonymisation_en).

## 17. MVP implementation plan

1. Foundation (done here): schema, API flows, H3, one-time links, filters, moderation, exports, configuration.
2. Pre-launch engineering: integration tests against PostgreSQL/Redis, transactional concurrency test, Turnstile/Resend sandbox tests, cleanup job, OpenAPI generation, CI, metrics/alerts.
3. Privacy/security launch gate: DPIA, legal basis and notices, processor/transfer review, H3/k-anonymity test using Polish density data, penetration test, incident/restore drill.
4. Pilot: one region, conservative threshold 7–10, coarse filters, manual review, weekly false-positive/privacy review.
5. Scale: materialized aggregate refresh, role-based admin, managed IdP, secret rotation versions, research export agreements and disclosure controls.

## 18. Folder structure

```text
src/
  auth/             admin JWT verification
  db/               Drizzle schema and database client
  integrations/     email and Turnstile adapters
  lib/              crypto, validation, rate limiting
  routes/           HTTP transport
  services/         report, symptom, heatmap, admin use cases
  app.ts             dependency wiring and error policy
  server.ts          process lifecycle
drizzle/             reviewed SQL migrations
tests/               unit tests
docs/                architecture and privacy decisions
```

## 19. Critical implementation patterns

Token storage:

```ts
const rawToken = randomBytes(32).toString("base64url");
await db.insert(tokens).values({ tokenHash: sha256(rawToken), expiresAt });
// Send/return rawToken once; compare only hashes later.
```

One-time confirmation is a single conditional update inside the report transaction:

```sql
UPDATE verification_requests
SET consumed_at = now()
WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at >= now()
RETURNING *;
```

No returned row means invalid, expired, or already consumed. Aggregation always filters first and suppresses second:

```sql
SELECT h3_cell, count(*)
FROM reports
WHERE moderation_status = 'visible' AND occurred_on >= $1 /* plus filters */
GROUP BY h3_cell
HAVING count(*) >= $k;
```
