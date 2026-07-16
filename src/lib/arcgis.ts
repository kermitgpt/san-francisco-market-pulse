import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { z } from "zod";
import { sha256, stableJson } from "./hash.js";

const LAND_RECORDS_URL =
  "https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer";

const idsResponseSchema = z.object({
  objectIdFieldName: z.string(),
  objectIds: z.array(z.number()).optional().default([]),
});

export interface ArcGisDataset<P extends GeoJsonProperties> {
  name: string;
  url: string;
  retrievedAt: string;
  sha256: string;
  bytes: number;
  features: Feature<Geometry, P>[];
}

export async function fetchLayerByWhere<P extends GeoJsonProperties>(options: {
  name: string;
  layerId: number;
  where: string;
  outFields: readonly string[];
  sortKey: (feature: Feature<Geometry, P>) => string;
}): Promise<ArcGisDataset<P>> {
  const layerUrl = `${LAND_RECORDS_URL}/${options.layerId}/query`;
  const idParams = new URLSearchParams({
    where: options.where,
    returnIdsOnly: "true",
    f: "json",
  });
  const idsUrl = `${layerUrl}?${idParams.toString()}`;
  const idsResponse = await fetch(idsUrl);
  if (!idsResponse.ok) {
    throw new Error(`ArcGIS ID query failed: ${idsResponse.status} ${idsResponse.statusText}`);
  }

  const parsedIds = idsResponseSchema.parse(await idsResponse.json());
  const objectIds = parsedIds.objectIds.sort((left, right) => left - right);
  const features: Feature<Geometry, P>[] = [];

  for (let offset = 0; offset < objectIds.length; offset += 500) {
    const chunk = objectIds.slice(offset, offset + 500);
    const featureParams = new URLSearchParams({
      objectIds: chunk.join(","),
      outFields: [...new Set([parsedIds.objectIdFieldName, ...options.outFields])].join(","),
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
    });
    const featureUrl = `${layerUrl}?${featureParams.toString()}`;
    const response = await fetch(featureUrl);
    if (!response.ok) {
      throw new Error(`ArcGIS feature query failed: ${response.status} ${response.statusText}`);
    }

    const featureCollection = assertFeatureCollection<P>(await response.json());
    features.push(...featureCollection.features);
  }

  features.sort((left, right) => options.sortKey(left).localeCompare(options.sortKey(right)));
  const serialized = stableJson({ type: "FeatureCollection", features });

  return {
    name: options.name,
    url: idsUrl,
    retrievedAt: new Date().toISOString(),
    sha256: sha256(serialized),
    bytes: Buffer.byteLength(serialized),
    features,
  };
}

function assertFeatureCollection<P extends GeoJsonProperties>(
  value: unknown,
): FeatureCollection<Geometry, P> {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { type?: unknown }).type !== "FeatureCollection" ||
    !Array.isArray((value as { features?: unknown }).features)
  ) {
    throw new Error("ArcGIS response was not a GeoJSON FeatureCollection");
  }

  return value as FeatureCollection<Geometry, P>;
}

export function sqlIn(field: string, values: readonly string[]): string {
  const escaped = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",");
  return `${field} IN (${escaped})`;
}
