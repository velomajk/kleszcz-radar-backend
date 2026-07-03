import { and, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { cellToParent, polygonToCells } from "h3-js";
import type { Config } from "../config.js";
import type { Database } from "../db/client.js";
import { reports, settings } from "../db/schema.js";
import type { z } from "zod";
import type { heatmapQuerySchema } from "../lib/validation.js";
import { PublicError } from "./reports.js";

type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;

/**
 * Coarsest H3 resolution the public API will aggregate to. Res 3 hexagons are
 * ~12,400 km² (several powiats), which is useful for a country-wide view while
 * still being geographically meaningful.
 */
const COARSEST_RESOLUTION = 3;

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
    // Effective aggregation resolution: never finer than what reports are
    // stored at, never coarser than COARSEST_RESOLUTION.
    const resolution = Math.min(
      this.config.H3_RESOLUTION,
      Math.max(COARSEST_RESOLUTION, query.resolution ?? this.config.H3_RESOLUTION),
    );
    const conditions: SQL[] = [eq(reports.moderationStatus, "visible"), gte(reports.occurredOn, startDate(query.window, this.config.SEASON_START_MONTH))];
    if (query.placeType) conditions.push(eq(reports.placeType, query.placeType));
    if (query.subjectType) conditions.push(eq(reports.subjectType, query.subjectType));
    if (query.north !== undefined && query.south !== undefined && query.east !== undefined && query.west !== undefined) {
      const polygon = [[query.south, query.west], [query.south, query.east], [query.north, query.east], [query.north, query.west], [query.south, query.west]];
      const cells = polygonToCells(polygon, this.config.H3_RESOLUTION);
      if (cells.length > 50_000) throw new PublicError(400, "area_too_large", "Geographic area is too large");
      if (cells.length === 0) return this.response(query, [], minimumCellCount, resolution);
      conditions.push(inArray(reports.h3Cell, cells));
    }

    // Group by the stored (finest) cell first. When a coarser resolution is
    // requested, roll the counts up to parent cells and only then apply the
    // privacy threshold — sub-threshold fine cells still contribute to their
    // parent, but are never exposed individually.
    const grouped = await this.db.select({ cell: reports.h3Cell, count: sql<number>`count(*)::int` })
      .from(reports).where(and(...conditions)).groupBy(reports.h3Cell);
    let counted: Array<{ cell: string; count: number }>;
    if (resolution === this.config.H3_RESOLUTION) {
      counted = grouped;
    } else {
      const parents = new Map<string, number>();
      for (const { cell, count } of grouped) {
        const parent = cellToParent(cell, resolution);
        parents.set(parent, (parents.get(parent) ?? 0) + count);
      }
      counted = [...parents.entries()].map(([cell, count]) => ({ cell, count }));
    }
    // Bucket counts reduce differencing value while retaining useful intensity bands.
    const cells = counted
      .filter(({ count }) => count >= minimumCellCount)
      .map(({ cell, count }) => ({ cell, countBucket: Math.max(minimumCellCount, Math.floor(count / 5) * 5), intensity: count < 15 ? "low" : count < 40 ? "medium" : "high" }));
    return this.response(query, cells, minimumCellCount, resolution);
  }

  private response(query: HeatmapQuery, cells: Array<{ cell: string; countBucket: number; intensity: string }>, minimumCellCount = this.config.PUBLIC_MIN_CELL_COUNT, resolution = this.config.H3_RESOLUTION) {
    return { generatedAt: new Date().toISOString(), window: query.window, resolution, minimumCellCount, cells };
  }
}
