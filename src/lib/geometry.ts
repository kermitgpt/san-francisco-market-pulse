import type { Feature, Geometry, MultiPolygon, Point, Polygon, Position } from "geojson";

export function pointInFeature(
  longitude: number,
  latitude: number,
  feature: Feature,
): boolean {
  return pointInGeometry(longitude, latitude, feature.geometry);
}

export function pointInGeometry(
  longitude: number,
  latitude: number,
  geometry: Geometry | null,
): boolean {
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return pointInPolygon([longitude, latitude], geometry);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((coordinates) =>
      pointInPolygon([longitude, latitude], {
        type: "Polygon",
        coordinates,
      }),
    );
  }

  return false;
}

function pointInPolygon(point: Position, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer || !pointInRing(point, outer)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

function pointInRing(point: Position, ring: Position[]): boolean {
  const x = point[0];
  const y = point[1];
  if (x === undefined || y === undefined) return false;

  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;

    const xi = currentPoint[0];
    const yi = currentPoint[1];
    const xj = previousPoint[0];
    const yj = previousPoint[1];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;

    if (pointOnSegment(x, y, xi, yi, xj, yj)) return true;

    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointOnSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-10) return false;

  return (
    x >= Math.min(x1, x2) - 1e-10 &&
    x <= Math.max(x1, x2) + 1e-10 &&
    y >= Math.min(y1, y2) - 1e-10 &&
    y <= Math.max(y1, y2) + 1e-10
  );
}

export function isPolygonGeometry(
  geometry: Geometry | null,
): geometry is Polygon | MultiPolygon {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

export function makePoint(longitude: number, latitude: number): Point {
  return { type: "Point", coordinates: [longitude, latitude] };
}
