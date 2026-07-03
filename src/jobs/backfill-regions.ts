/**
 * One-off backfill: derives country_code and region for reports that predate
 * those columns. Run locally against the production DB (IP must be on the
 * database allowlist):
 *
 *   DATABASE_URL="postgres://…" npx tsx src/jobs/backfill-regions.ts
 */
import postgres from "postgres";
import { cellToLatLng } from "h3-js";
import { iso1A2Code } from "@rapideditor/country-coder";
import { pointToRegion } from "../lib/regions.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL");
const sql = postgres(url, { ssl: url.includes("localhost") ? false : "require", max: 1 });

const rows = await sql<{ id: string; h3_cell: string }[]>`
  SELECT id, h3_cell FROM reports WHERE country_code IS NULL OR (country_code = 'PL' AND region IS NULL)`;
let updated = 0;
for (const row of rows) {
  const [lat, lng] = cellToLatLng(row.h3_cell);
  const countryCode = iso1A2Code([lng, lat]) ?? null;
  const region = countryCode === "PL" ? pointToRegion(lat, lng) : null;
  await sql`UPDATE reports SET country_code = ${countryCode}, region = ${region} WHERE id = ${row.id}`;
  updated++;
}
console.log(`backfilled ${updated} of ${rows.length} candidate rows`);
await sql.end();
