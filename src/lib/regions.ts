import { readFileSync } from "node:fs";

/**
 * Voivodeship (województwo) lookup for report aggregation.
 *
 * Boundaries come from `src/data/wojewodztwa-min.geojson` (source:
 * https://github.com/ppatrzyk/polska-geojson, simplified). The build script
 * copies the data directory into dist/, so the relative URL below resolves in
 * both dev (tsx, src/) and production (node, dist/).
 *
 * Point-in-polygon is a plain even-odd ray cast — no dependencies. Slightly
 * simplified borders may misassign a report within ~1 km of a boundary, which
 * is irrelevant at aggregation scale.
 */

type Ring = [number, number][]; // [lng, lat]
type PolygonCoords = Ring[]; // outer ring + holes
interface RegionFeature {
  properties: { nazwa: string };
  geometry:
    | { type: "Polygon"; coordinates: PolygonCoords }
    | { type: "MultiPolygon"; coordinates: PolygonCoords[] };
}

interface Region {
  name: string;
  polygons: PolygonCoords[];
  bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
}

const loadRegions = (): Region[] => {
  const raw = readFileSync(new URL("../data/wojewodztwa-min.geojson", import.meta.url), "utf8");
  const collection = JSON.parse(raw) as { features: RegionFeature[] };
  const regions = collection.features.map((f) => {
    const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const poly of polygons) for (const [lng, lat] of poly[0] ?? []) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    return { name: f.properties.nazwa.toLowerCase(), polygons, bbox: [minLng, minLat, maxLng, maxLat] as Region["bbox"] };
  });
  if (regions.length !== 16) {
    throw new Error(`wojewodztwa-min.geojson: expected 16 voivodeships, found ${regions.length} — is the file complete?`);
  }
  return regions;
};

let cache: Region[] | null = null;
const regions = (): Region[] => (cache ??= loadRegions());

const inRing = (lng: number, lat: number, ring: Ring): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    if (!pi || !pj) continue;
    const [xi, yi] = pi;
    const [xj, yj] = pj;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const inPolygon = (lng: number, lat: number, polygon: PolygonCoords): boolean => {
  const outer = polygon[0];
  if (!outer || !inRing(lng, lat, outer)) return false;
  for (let h = 1; h < polygon.length; h++) {
    const hole = polygon[h];
    if (hole && inRing(lng, lat, hole)) return false;
  }
  return true;
};

/** Returns the voivodeship name (lowercase, e.g. "mazowieckie") or null. */
export const pointToRegion = (lat: number, lng: number): string | null => {
  for (const region of regions()) {
    const [minLng, minLat, maxLng, maxLat] = region.bbox;
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
    for (const polygon of region.polygons) if (inPolygon(lng, lat, polygon)) return region.name;
  }
  return null;
};
