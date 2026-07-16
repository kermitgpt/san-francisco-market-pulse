import { createReadStream, createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import path from "node:path";
import { parse } from "csv-parse";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import { FEATURED_NEIGHBORHOODS } from "./config/neighborhoods";
import type {
  MarketPulseDataset,
  NeighborhoodBoundaries,
  NeighborhoodBoundaryProperties,
  NeighborhoodPulse,
  ResidentialTransfers,
  TransferPointProperties,
} from "./types";

const ZILLOW_DOWNLOAD_URL =
  "https://files.zillowstatic.com/research/public_csvs/zhvi/Neighborhood_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv";
const ZILLOW_METHODOLOGY_URL = "https://www.zillow.com/research/data/";
const DATASF_GEOJSON_URL =
  "https://data.sfgov.org/resource/j2bu-swwd.geojson?$limit=5000";
const DATASF_DATASET_URL =
  "https://data.sfgov.org/Geographic-Locations-and-Boundaries/Analysis-Neighborhoods/j2bu-swwd";
const DATASF_ASSESSOR_API = "https://data.sfgov.org/resource/wv5m-vpq2";
const DATASF_ASSESSOR_URL =
  "https://data.sfgov.org/Housing-and-Buildings/Assessor-Historical-Secured-Property-Tax-Rolls/wv5m-vpq2";
const DISPLAY_MONTHS = 36;
const SUPPORT_MONTHS = 48;

interface ZillowRow extends Record<string, string> {
  RegionID: string;
  RegionName: string;
  RegionType: string;
  State: string;
  City: string;
}

interface AssessorTransferProperties {
  closed_roll_year?: string;
  parcel_number?: string;
  property_location?: string;
  current_sales_date?: string;
  property_area?: string;
  lot_area?: string;
  number_of_bedrooms?: string;
  number_of_bathrooms?: string;
  use_definition?: string;
  property_class_code_definition?: string;
  analysis_neighborhood?: string;
}

export interface PipelineOptions {
  refresh?: boolean;
  zillowPath?: string;
  boundariesPath?: string;
  transfersPath?: string;
}

export async function runPipeline(options: PipelineOptions = {}): Promise<MarketPulseDataset> {
  const rawDirectory = path.resolve("data/raw");
  const processedDirectory = path.resolve("data/processed");
  const zillowPath = path.resolve(
    options.zillowPath ?? path.join(rawDirectory, "zillow-neighborhood-zhvi.csv"),
  );
  const boundariesPath = path.resolve(
    options.boundariesPath ?? path.join(rawDirectory, "datasf-analysis-neighborhoods.geojson"),
  );
  const transfersPath = path.resolve(
    options.transfersPath ?? path.join(rawDirectory, "datasf-residential-transfers.geojson"),
  );

  await mkdir(rawDirectory, { recursive: true });
  await mkdir(processedDirectory, { recursive: true });

  if (options.zillowPath) {
    await assertReadable(zillowPath);
  } else if (options.refresh || !(await exists(zillowPath))) {
    await downloadFile(ZILLOW_DOWNLOAD_URL, zillowPath);
  }

  if (options.boundariesPath) {
    await assertReadable(boundariesPath);
  } else if (options.refresh || !(await exists(boundariesPath))) {
    await downloadFile(DATASF_GEOJSON_URL, boundariesPath);
  }

  const zillowRows = await readFeaturedZillowRows(zillowPath);
  const neighborhoods = buildNeighborhoodPulse(zillowRows);
  const latestDate = commonLatestDate(neighborhoods);
  const displayStartDate = neighborhoods[0]?.history.at(-DISPLAY_MONTHS)?.date;
  if (!displayStartDate) throw new Error("Could not determine the 36-month display window.");

  if (options.transfersPath) {
    await assertReadable(transfersPath);
  } else if (options.refresh || !(await exists(transfersPath))) {
    await downloadLatestAssessorTransfers(transfersPath, firstDayOfMonth(displayStartDate));
  }

  const transferResult = await buildResidentialTransfers(transfersPath, displayStartDate);

  const dataset: MarketPulseDataset = {
    generatedAt: new Date().toISOString(),
    displayMonths: DISPLAY_MONTHS,
    displayStartDate,
    latestDate,
    source: {
      metricName: "Zillow Home Value Index for all homes, middle tier, seasonally adjusted",
      metricShortName: "Zillow Home Value Index",
      methodologyUrl: ZILLOW_METHODOLOGY_URL,
      downloadUrl: ZILLOW_DOWNLOAD_URL,
      geographyName: "San Francisco Analysis Neighborhoods",
      geographyUrl: DATASF_DATASET_URL,
      disclosure:
        "Typical home values are modeled estimates, not recorded sale prices, listing prices, or an MLS feed.",
      transferDatasetName: "DataSF Assessor Historical Secured Property Tax Rolls",
      transferDatasetUrl: DATASF_ASSESSOR_URL,
      transferDisclosure:
        "Dots are residential parcels with a public current-sales recording date. The public bulk data does not include sale price or deed type, so some dots may be non-market transfers.",
    },
    transfers: transferResult.summary,
    neighborhoods,
  };

  const boundaries = await buildBoundaries(boundariesPath);
  await Promise.all([
    writeJson(path.join(processedDirectory, "sf-market-pulse.json"), dataset),
    writeCompactJson(path.join(processedDirectory, "sf-neighborhoods.geojson"), boundaries),
    writeCompactJson(
      path.join(processedDirectory, "sf-residential-transfers.geojson"),
      transferResult.collection,
    ),
    writeJson(path.join(processedDirectory, "source-manifest.json"), {
      generatedAt: dataset.generatedAt,
      latestDate,
      displayStartDate,
      featuredNeighborhoodCount: neighborhoods.length,
      analysisNeighborhoodCount: boundaries.features.length,
      residentialTransferCount: transferResult.summary.count,
      residentialTransferStartDate: transferResult.summary.dataStartDate,
      residentialTransferEndDate: transferResult.summary.dataEndDate,
      assessorSourceRollYear: transferResult.summary.sourceRollYear,
      sources: [
        { name: dataset.source.metricShortName, url: ZILLOW_METHODOLOGY_URL },
        { name: dataset.source.geographyName, url: DATASF_DATASET_URL },
        { name: dataset.source.transferDatasetName, url: DATASF_ASSESSOR_URL },
      ],
      disclosure: [dataset.source.disclosure, dataset.source.transferDisclosure],
    }),
  ]);

  return dataset;
}

async function buildResidentialTransfers(
  filePath: string,
  displayStartDate: string,
): Promise<{
  collection: ResidentialTransfers;
  summary: MarketPulseDataset["transfers"];
}> {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as FeatureCollection<
    Point,
    AssessorTransferProperties
  >;
  const featuredByBoundary = new Map(
    FEATURED_NEIGHBORHOODS.map((item) => [item.boundaryName, item]),
  );
  const features: Array<Feature<Point, TransferPointProperties>> = [];

  for (const feature of raw.features) {
    const properties = feature.properties;
    const definition = properties.analysis_neighborhood
      ? featuredByBoundary.get(properties.analysis_neighborhood)
      : undefined;
    const recordedDate = properties.current_sales_date?.slice(0, 10);
    const parcelNumber = properties.parcel_number?.trim();
    const sourceRollYear = Number(properties.closed_roll_year);
    if (
      !definition ||
      !recordedDate ||
      recordedDate < firstDayOfMonth(displayStartDate) ||
      !parcelNumber ||
      !Number.isInteger(sourceRollYear) ||
      feature.geometry.type !== "Point"
    ) {
      continue;
    }

    features.push({
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        transferId: `${parcelNumber}-${recordedDate}`,
        neighborhoodId: definition.id,
        neighborhoodName: definition.displayName,
        parcelNumber,
        address: formatAssessorAddress(properties.property_location ?? ""),
        recordedDate,
        propertyAreaSqft: nullableNumber(properties.property_area),
        lotAreaSqft: nullableNumber(properties.lot_area),
        bedrooms: nullablePositiveNumber(properties.number_of_bedrooms),
        bathrooms: nullablePositiveNumber(properties.number_of_bathrooms),
        propertyType:
          properties.property_class_code_definition?.trim() ||
          properties.use_definition?.trim() ||
          "Residential property",
        sourceRollYear,
      },
    });
  }

  features.sort((left, right) =>
    `${left.properties.recordedDate}:${left.properties.parcelNumber}`.localeCompare(
      `${right.properties.recordedDate}:${right.properties.parcelNumber}`,
    ),
  );
  if (features.length === 0) throw new Error("No featured residential transfer points were found.");
  const represented = new Set(features.map((feature) => feature.properties.neighborhoodId));
  const missing = FEATURED_NEIGHBORHOODS.filter((item) => !represented.has(item.id));
  if (missing.length > 0) {
    throw new Error(`No transfer points found for: ${missing.map((item) => item.displayName).join(", ")}`);
  }
  const dates = features.map((feature) => feature.properties.recordedDate);
  const rollYears = new Set(features.map((feature) => feature.properties.sourceRollYear));
  if (rollYears.size !== 1) throw new Error("Transfer points span more than one assessor roll year.");

  return {
    collection: { type: "FeatureCollection", features },
    summary: {
      count: features.length,
      dataStartDate: dates[0] as string,
      dataEndDate: dates.at(-1) as string,
      sourceRollYear: [...rollYears][0] as number,
    },
  };
}

async function downloadLatestAssessorTransfers(
  destination: string,
  startDate: string,
): Promise<void> {
  const rollResponse = await fetch(
    `${DATASF_ASSESSOR_API}.json?${new URLSearchParams({
      "$select": "max(closed_roll_year) as latest",
    }).toString()}`,
    { headers: { "user-agent": "san-francisco-market-pulse/0.1" } },
  );
  if (!rollResponse.ok) {
    throw new Error(`Could not determine the latest assessor roll (${rollResponse.status}).`);
  }
  const rollRows = (await rollResponse.json()) as Array<{ latest?: string }>;
  const latestRollYear = Number(rollRows[0]?.latest);
  if (!Number.isInteger(latestRollYear)) throw new Error("Latest assessor roll year was invalid.");

  const neighborhoodNames = FEATURED_NEIGHBORHOODS.map(
    (item) => `'${item.boundaryName.replaceAll("'", "''")}'`,
  ).join(",");
  const parameters = new URLSearchParams({
    "$select": [
      "closed_roll_year",
      "parcel_number",
      "property_location",
      "current_sales_date",
      "property_area",
      "lot_area",
      "number_of_bedrooms",
      "number_of_bathrooms",
      "use_definition",
      "property_class_code_definition",
      "analysis_neighborhood",
      "the_geom",
    ].join(","),
    "$where": [
      `closed_roll_year = ${latestRollYear}`,
      `current_sales_date >= '${startDate}T00:00:00.000'`,
      "use_code in ('SRES','MRES')",
      `analysis_neighborhood in (${neighborhoodNames})`,
      "the_geom is not null",
    ].join(" AND "),
    "$limit": "50000",
  });
  await downloadFile(`${DATASF_ASSESSOR_API}.geojson?${parameters.toString()}`, destination);
}

async function readFeaturedZillowRows(filePath: string): Promise<Map<string, ZillowRow>> {
  const required = new Set(FEATURED_NEIGHBORHOODS.map((item) => item.zillowRegionName));
  const rows = new Map<string, ZillowRow>();
  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, bom: true, relax_column_count: true, skip_empty_lines: true }),
  );

  for await (const candidate of parser) {
    const row = candidate as ZillowRow;
    if (
      row.RegionType === "neighborhood" &&
      row.State === "CA" &&
      row.City === "San Francisco" &&
      required.has(row.RegionName)
    ) {
      rows.set(row.RegionName, row);
    }
  }

  const missing = [...required].filter((name) => !rows.has(name));
  if (missing.length > 0) {
    throw new Error(`Zillow rows missing for: ${missing.join(", ")}`);
  }
  return rows;
}

function buildNeighborhoodPulse(rows: Map<string, ZillowRow>): NeighborhoodPulse[] {
  const sample = rows.values().next().value as ZillowRow | undefined;
  if (!sample) throw new Error("No San Francisco neighborhood rows were found.");
  const monthColumns = Object.keys(sample)
    .filter((column) => /^\d{4}-\d{2}-\d{2}$/.test(column))
    .sort();
  const latestDate = [...monthColumns]
    .reverse()
    .find((date) => [...rows.values()].every((row) => Number.isFinite(Number(row[date]))));
  if (!latestDate) throw new Error("No common latest month was available across the featured rows.");
  const latestIndex = monthColumns.indexOf(latestDate);
  const historyDates = monthColumns.slice(Math.max(0, latestIndex - SUPPORT_MONTHS + 1), latestIndex + 1);
  if (historyDates.length < SUPPORT_MONTHS) {
    throw new Error(`Expected ${SUPPORT_MONTHS} months of support data; found ${historyDates.length}.`);
  }

  return FEATURED_NEIGHBORHOODS.map((definition) => {
    const row = rows.get(definition.zillowRegionName);
    if (!row) throw new Error(`Missing source row for ${definition.zillowRegionName}.`);
    const history = historyDates.map((date) => ({ date, value: Math.round(Number(row[date])) }));
    if (history.some((point) => !Number.isFinite(point.value))) {
      throw new Error(`Incomplete value history for ${definition.displayName}.`);
    }
    const latest = history.at(-1);
    const prior12 = history.at(-13);
    const prior36 = history.at(-37);
    if (!latest || !prior12 || !prior36) {
      throw new Error(`Insufficient comparison history for ${definition.displayName}.`);
    }
    return {
      id: definition.id,
      name: definition.displayName,
      sourceRegionName: definition.zillowRegionName,
      sourceRegionId: Number(row.RegionID),
      featuredOrder: definition.order,
      history,
      latestValue: latest.value,
      latest12MonthChangePct: percentChange(latest.value, prior12.value),
      latest36MonthChangePct: percentChange(latest.value, prior36.value),
    } satisfies NeighborhoodPulse;
  });
}

async function buildBoundaries(filePath: string): Promise<NeighborhoodBoundaries> {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as FeatureCollection<
    Geometry,
    { nhood?: string }
  >;
  const featuredByBoundary = new Map(
    FEATURED_NEIGHBORHOODS.map((item) => [item.boundaryName, item]),
  );
  const names = new Set<string>();
  const features: Array<Feature<Geometry, NeighborhoodBoundaryProperties>> = raw.features.map(
    (feature) => {
      const name = feature.properties.nhood?.trim();
      if (!name) throw new Error("A DataSF boundary is missing its neighborhood name.");
      names.add(name);
      const featured = featuredByBoundary.get(name);
      return {
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          id: slugify(name),
          name,
          featured: Boolean(featured),
          dataId: featured?.id ?? null,
        },
      };
    },
  );

  const missingBoundaries = [...featuredByBoundary.keys()].filter((name) => !names.has(name));
  if (missingBoundaries.length > 0) {
    throw new Error(`DataSF boundaries missing for: ${missingBoundaries.join(", ")}`);
  }
  return { type: "FeatureCollection", features };
}

export function percentChange(current: number, prior: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) {
    throw new Error("Percent change requires finite values and a non-zero prior value.");
  }
  return Math.round(((current / prior - 1) * 100) * 100) / 100;
}

function commonLatestDate(neighborhoods: NeighborhoodPulse[]): string {
  const dates = new Set(neighborhoods.map((item) => item.history.at(-1)?.date));
  if (dates.size !== 1 || dates.has(undefined)) {
    throw new Error("Featured neighborhoods do not share a common latest date.");
  }
  return [...dates][0] as string;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function formatAssessorAddress(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^([A-Z]\d{3}|\d{4})\s+(\d{4})\s+(.+?)\s+([A-Z]{2})(\d{4})$/);
  if (!match) return normalized || "Address unavailable";
  const [, , rawNumber, streetName, rawSuffix, rawUnit] = match;
  const number = String(Number(rawNumber));
  const suffixes: Record<string, string> = {
    AL: "Aly",
    AV: "Ave",
    BL: "Blvd",
    CR: "Cir",
    CT: "Ct",
    DR: "Dr",
    HW: "Hwy",
    LN: "Ln",
    PL: "Pl",
    RD: "Rd",
    ST: "St",
    TR: "Ter",
    WY: "Way",
  };
  const suffix = suffixes[rawSuffix ?? ""] ?? rawSuffix;
  const unit = rawUnit && rawUnit !== "0000" ? ` #${String(Number(rawUnit))}` : "";
  return `${number} ${titleCase(streetName ?? "")} ${suffix}${unit}`.trim();
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_match, prefix: string, letter: string) =>
      `${prefix}${letter.toUpperCase()}`,
    );
}

function nullableNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function nullablePositiveNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstDayOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const temporary = `${destination}.download`;
  await mkdir(path.dirname(destination), { recursive: true });
  await rm(temporary, { force: true });
  const response = await fetch(url, { headers: { "user-agent": "san-francisco-market-pulse/0.1" } });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const webStream = response.body as unknown as Parameters<typeof Readable.fromWeb>[0];
  await streamPipeline(Readable.fromWeb(webStream), createWriteStream(temporary));
  await rename(temporary, destination);
}

async function writeJson(destination: string, value: unknown): Promise<void> {
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCompactJson(destination: string, value: unknown): Promise<void> {
  await writeFile(destination, `${JSON.stringify(value)}\n`, "utf8");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertReadable(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Input file is not readable: ${filePath}`);
  }
}

export async function seedRawInputs(zillowPath: string, boundariesPath: string): Promise<void> {
  const rawDirectory = path.resolve("data/raw");
  await mkdir(rawDirectory, { recursive: true });
  await Promise.all([
    copyFile(path.resolve(zillowPath), path.join(rawDirectory, "zillow-neighborhood-zhvi.csv")),
    copyFile(
      path.resolve(boundariesPath),
      path.join(rawDirectory, "datasf-analysis-neighborhoods.geojson"),
    ),
  ]);
}
