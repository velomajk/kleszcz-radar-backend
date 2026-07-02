import { and, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { polygonToCells } from "h3-js";
import type { Config } from "../config.js";
import type { Database } from "../db/client.js";
import { reports, settings } from "../db/schema.js";
import type { z } from "zod";
import type { heatmapQuerySchema } from "../lib/validation.js";
import { PublicError } from "./reports.js";

type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;

const startDate = (window: HeatmapQuery["window"], seasonMonth: number): string => {
  const now = new Date();
  if (window === "season") {
    const year = now.getUTCMonth() + 1 < seasonMonth ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    return `${year}-${String(seasonMonth).padStart(2, "0")}-01`;
  }
  const days = Number.parseInt(window, 10);
  return new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
};

export class HeatmapService {
  constructor(private readonly db: Database, private readonly config: Config) {}

  async get(query: HeatmapQuery) {
    const [setting] = await this.db.select({ value: settings.value }).from(settings).where(eq(settings.key, "public_min_cell_count")).limit(1);
    const configured = typeof setting?.value === "number" ? setting.value : this.config.PUBLIC_MIN_CELL_COUNT;
    const minimumCellCount = Math.max(5, Math.min(100, Math.trunc(configured)));
    const conditions: SQL[] = [eq(reports.moderationStatus, "visible"), gte(reports.occurredOn, startDate(query.window, this.config.SEASON_START_MONTH))];
    if (query.placeType) conditions.push(eq(reports.placeType, query.placeType));
    if (query.subjectType) conditions.push(eq(reports.subjectType, query.subjectType));
    if (query.north !== undefined && query.south !== undefined && query.east !== undefined && query.west !== undefined) {
      const polygon = [[query.south, query.west], [query.south, query.east], [query.north, query.east], [query.north, query.west], [query.south, query.west]];
      const cells = polygonToCells(polygon, this.config.H3_RESOLUTION);
      if (cells.length > 50_000) throw new PublicError(400, "area_too_large", "Geographic area is too large");
      if (cells.length === 0) return this.response(query, [], minimumCellCount);
      conditions.push(inArray(reports.h3Cell, cells));
    }

    const rows = await this.db.select({ cell: reports.h3Cell, count: sql<number>`count(*)::int` })
      .from(reports).where(and(...conditions)).groupBy(reports.h3Cell).having(sql`count(*) >= ${minimumCellCount}`);
    // Bucket counts reduce differencing value while retaining useful intensity bands.
    const cells = rows.map(({ cell, count }) => ({ cell, countBucket: Math.max(minimumCellCount, Math.floor(count / 5) * 5), intensity: count < 15 ? "low" : count < 40 ? "medium" : "high" }));
    return this.response(query, cells, minimumCellCount);
  }

  private response(query: HeatmapQuery, cells: Array<{ cell: string; countBucket: number; intensity: string }>, minimumCellCount = this.config.PUBLIC_MIN_CELL_COUNT) {
    return { generatedAt: new Date().toISOString(), window: query.window, resolution: this.config.H3_RESOLUTION, minimumCellCount, cells };
  }
}
