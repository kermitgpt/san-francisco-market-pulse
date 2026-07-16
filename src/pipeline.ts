import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, Point } from "geojson";
import { z } from "zod";
import {
  ALL_PILOT_PLATS,
  ALL_REVIEWED_PARCEL_OVERRIDES,
  MARKET_CONFIG_VERSION,
  MARKET_DEFINITIONS,
  type MarketDefinition,
} from "./config/markets.js";
import { fetchLayerByWhere, sqlIn, type ArcGisDataset } from "./lib/arcgis.js";
import { downloadFirstAvailable, downloadSource, type DownloadedSource } from "./lib/download.js";
import { pointInFeature, makePoint } from "./lib/geometry.js";
import { sha256, stableJson } from "./lib/hash.js";
import {
  classifySale,
  isResidentialPropertyType,
  parsePositiveNumber,
  parseSaleMonth,
} from "./lib/quality.js";
import { median, subtractOneYear } from "./lib/statistics.js";
import { readCsvFromZip } from "./lib/zip-csv.js";
import type {
  CommunityMembership,
  CommunitySummary,
  ImprovementSnapshot,
  MarketPulseDataset,
  ParcelFeature,
  ParcelProperties,
  PipelineOutputs,
  RecordedSale,
  SaleRow,
  SaleTransaction,
  SourceManifest,
  SourceManifestEntry,
} from "./types.js";

const PARCEL_LAYER_ID = 12;
const SUBDIVISION_LAYER_ID = 15;
const OUTPUT_SCHEMA_VERSION = "1.0.0" as const;

const saleCsvSchema = z
  .object({
    Parcel: z.string(),
    SequenceNum: z.string(),
    SaleDate: z.string(),
    SalePrice: z.string(),
    PropertyType: z.string(),
    IntendedUse: z.string(),
    Deed: z.string(),
    Financing: z.string(),
    ValidationDescription: z.string(),
    BuyerSellerRelated: z.string(),
    Solar: z.string(),
    PersonalProperty: z.string(),
    PartialInterest: z.string(),
    RecordingDate: z.string(),
    ParcelUse: z.string(),
  })
  .passthrough();

const improvementCsvSchema = z
  .object({
    TAXYEAR: z.string(),
    PARCEL: z.string(),
    SFRCONDO: z.string(),
    SQFT: z.string(),
  })
  .passthrough();

const parcelPropertiesSchema = z.object({
  OBJECTID: z.number().optional(),
  PARCEL: z.string(),
  MP_OL: z.string().nullable().optional().transform((value) => value ?? null),
  GISAREA: z.number().nullable().optional().transform((value) => value ?? null),
  GISACRES: z.number().nullable().optional().transform((value) => value ?? null),
  LON: z.number(),
  LAT: z.number(),
  ADDRESS_OL: z.string().nullable().optional().transform((value) => value ?? null),
  LEGAL1: z.string().nullable().optional().transform((value) => value ?? null),
  LOT_R: z.string().nullable().optional().transform((value) => value ?? null),
  PARCEL_USE: z.string().nullable().optional().transform((value) => value ?? null),
});

type SubdivisionProperties = {
  OBJECTID?: number;
  SUB_NAME?: string;
  BOOK_PAGE?: string;
  SEQ_NUM?: string;
  REC_DATE?: number;
  LOT_COUNT?: number;
};

interface RuntimeSource {
  source: DownloadedSource;
  manifest: SourceManifestEntry;
}

export interface PipelineOptions {
  asOfDate?: Date;
  outputDirectory?: string;
  force?: boolean;
}

export interface PipelineResult {
  status: "updated" | "noop";
  outputDirectory: string;
  dataset?: MarketPulseDataset;
}

export async function runPipeline(options: PipelineOptions = {}): Promise<PipelineResult> {
  const asOfDate = options.asOfDate ?? parseAsOfDate(process.env.FMP_AS_OF_DATE) ?? new Date();
  const outputDirectory = path.resolve(options.outputDirectory ?? "data/processed");
  const force = options.force ?? process.env.FMP_FORCE === "1";
  const currentYear = asOfDate.getUTCFullYear();
  const asOfCalendarDate = formatArizonaDate(asOfDate);
  const retrievedAt = new Date().toISOString();

  const salesYears = [currentYear - 1, currentYear];
  const salesDownloads = salesYears.map((year) =>
    downloadSource(
      `assessor-sales-${year}`,
      `https://www.asr.pima.gov/Downloads/Data/sales/${year}/SALE${year}.ZIP`,
    ),
  );
  const realPropertyDownload = downloadFirstAvailable([
    realPropertyCandidate(currentYear + 1),
    realPropertyCandidate(currentYear),
  ]);

  const platWhere = sqlIn("MP_OL", ALL_PILOT_PLATS);
  const parcelWhere =
    ALL_REVIEWED_PARCEL_OVERRIDES.length > 0
      ? `(${platWhere} OR ${sqlIn("PARCEL", ALL_REVIEWED_PARCEL_OVERRIDES)})`
      : platWhere;
  const subdivisionWhere = sqlIn("BOOK_PAGE", ALL_PILOT_PLATS);
  const parcelRequest = fetchLayerByWhere<ParcelProperties>({
    name: "pima-gis-pilot-parcels",
    layerId: PARCEL_LAYER_ID,
    where: parcelWhere,
    outFields: [
      "PARCEL",
      "MP_OL",
      "GISAREA",
      "GISACRES",
      "LON",
      "LAT",
      "ADDRESS_OL",
      "LEGAL1",
      "LOT_R",
      "PARCEL_USE",
    ],
    sortKey: (feature) => String(feature.properties?.PARCEL ?? ""),
  });
  const subdivisionRequest = fetchLayerByWhere<SubdivisionProperties>({
    name: "pima-gis-pilot-subdivisions",
    layerId: SUBDIVISION_LAYER_ID,
    where: subdivisionWhere,
    outFields: ["SUB_NAME", "BOOK_PAGE", "SEQ_NUM", "REC_DATE", "LOT_COUNT"],
    sortKey: (feature) =>
      `${String(feature.properties?.BOOK_PAGE ?? "")}:${String(feature.properties?.OBJECTID ?? "")}`,
  });

  const [salesSources, improvementSource, parcelDataset, subdivisionDataset] = await Promise.all([
    Promise.all(salesDownloads),
    realPropertyDownload,
    parcelRequest,
    subdivisionRequest,
  ]);

  const runtimeSources = salesSources.map(toRuntimeSource);
  runtimeSources.push(toRuntimeSource(improvementSource));
  const gisManifests = [toGisManifest(parcelDataset), toGisManifest(subdivisionDataset)];
  const configHash = sha256(stableJson({ MARKET_CONFIG_VERSION, MARKET_DEFINITIONS }));
  const initialManifestEntries = [
    ...runtimeSources.map((entry) => entry.manifest),
    ...gisManifests,
  ].sort((left, right) => left.name.localeCompare(right.name));

  const existingManifest = await readExistingManifest(outputDirectory);
  if (
    !force &&
    existingManifest &&
    existingManifest.configHash === configHash &&
    sameSourceFingerprints(existingManifest.sources, initialManifestEntries)
  ) {
    return { status: "noop", outputDirectory };
  }

  const parcelValidation = validateAndDedupeParcels(parcelDataset.features);
  const parcels = parcelValidation.parcels;
  const parcelById = new Map(parcels.map((feature) => [feature.properties.PARCEL, feature]));
  const targetParcelIds = new Set(parcelById.keys());

  const salesBySequence = new Map<string, SaleRow[]>();
  let dataThroughDate: string | null = null;
  const csvQuality: Record<string, unknown> = {};

  for (const runtime of runtimeSources.filter((entry) => entry.source.name.startsWith("assessor-sales-"))) {
    const readResult = await readCsvFromZip(runtime.source.buffer, saleCsvSchema, (raw) => {
      const row = normalizeSaleRow(raw);
      if (!row) return;
      if (!dataThroughDate || row.recordingDate > dataThroughDate) dataThroughDate = row.recordingDate;
      const rows = salesBySequence.get(row.sequenceId) ?? [];
      rows.push(row);
      salesBySequence.set(row.sequenceId, rows);
    });
    runtime.manifest.rowCount = readResult.rowCount;
    csvQuality[runtime.source.name] = readResult;
  }

  if (!dataThroughDate) throw new Error("No valid recording dates were found in the sales sources");
  const windowStartDate = subtractOneYear(dataThroughDate);
  const improvements = new Map<string, ImprovementSnapshot>();
  const improvementRuntime = runtimeSources.find((entry) => entry.source.name.startsWith("assessor-real-property-"));
  if (!improvementRuntime) throw new Error("Real-property source was not loaded");

  let layoutRowsSkipped = 0;
  const improvementReadResult = await readCsvFromZip(
    improvementRuntime.source.buffer,
    improvementCsvSchema,
    (raw) => {
      const parcelId = raw.PARCEL.trim();
      if (/^-+$/.test(parcelId)) {
        layoutRowsSkipped += 1;
        return;
      }
      if (!targetParcelIds.has(parcelId)) return;
      const sqft = parsePositiveNumber(raw.SQFT);
      const taxYear = Number.parseInt(raw.TAXYEAR.trim(), 10);
      if (!sqft || !Number.isInteger(taxYear)) return;

      const existing = improvements.get(parcelId);
      if (!existing || taxYear >= existing.taxYear) {
        improvements.set(parcelId, {
          parcelId,
          taxYear,
          sqft,
          sfrCondo: raw.SFRCONDO.trim(),
        });
      }
    },
  );
  improvementRuntime.manifest.rowCount = improvementReadResult.rowCount;
  csvQuality[improvementRuntime.source.name] = {
    ...improvementReadResult,
    layoutRowsSkipped,
  };

  const transactions = buildTransactions(
    salesBySequence,
    targetParcelIds,
    windowStartDate,
    dataThroughDate,
  );
  const memberships = buildMemberships(parcels, subdivisionDataset.features);
  const membershipByParcel = new Map(memberships.map((membership) => [membership.parcelId, membership]));
  const recordedSales = buildRecordedSales(
    transactions,
    membershipByParcel,
    parcelById,
    improvements,
  );
  const communities = buildCommunitySummaries(memberships, recordedSales);
  const sourceEntries = [
    ...runtimeSources.map((entry) => entry.manifest),
    ...gisManifests,
  ].sort((left, right) => left.name.localeCompare(right.name));

  const dataset: MarketPulseDataset = {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    label: "recent recorded sales",
    generatedAt: retrievedAt,
    dataThroughDate,
    windowStartDate,
    sources: sourceEntries,
    communities,
    transactions,
    sales: recordedSales,
  };

  const outputs = buildOutputs({
    dataset,
    sourceEntries,
    configHash,
    retrievedAt,
    subdivisionDataset,
    memberships,
    recordedSales,
    parcelById,
    improvements,
    parcelValidation,
    csvQuality,
    asOfCalendarDate,
  });
  await writeOutputs(outputDirectory, outputs);

  return { status: "updated", outputDirectory, dataset };
}

function realPropertyCandidate(taxYear: number): { name: string; url: string } {
  const suffix = String(taxYear).slice(-2);
  return {
    name: `assessor-real-property-${taxYear}`,
    url: `https://www.asr.pima.gov/Downloads/Data/realprop/${taxYear}/noticeval/Mas${suffix}.ZIP`,
  };
}

function toRuntimeSource(source: DownloadedSource): RuntimeSource {
  return {
    source,
    manifest: {
      name: source.name,
      url: source.url,
      retrievedAt: source.retrievedAt,
      sha256: source.sha256,
      bytes: source.bytes,
      rowCount: null,
    },
  };
}

function toGisManifest(dataset: ArcGisDataset<GeoJsonProperties>): SourceManifestEntry {
  return {
    name: dataset.name,
    url: dataset.url,
    retrievedAt: dataset.retrievedAt,
    sha256: dataset.sha256,
    bytes: dataset.bytes,
    rowCount: dataset.features.length,
  };
}

function validateAndDedupeParcels(features: Feature<Geometry, ParcelProperties>[]): {
  parcels: ParcelFeature[];
  invalidFeatureCount: number;
  duplicateParcelCount: number;
} {
  const parcels = new Map<string, ParcelFeature>();
  let invalidFeatureCount = 0;
  let duplicateParcelCount = 0;

  for (const feature of features) {
    const parsed = parcelPropertiesSchema.safeParse(feature.properties);
    if (!parsed.success) {
      invalidFeatureCount += 1;
      continue;
    }
    if (parcels.has(parsed.data.PARCEL)) duplicateParcelCount += 1;
    parcels.set(parsed.data.PARCEL, {
      type: "Feature",
      geometry: feature.geometry,
      properties: parsed.data,
    });
  }

  return {
    parcels: [...parcels.values()].sort((left, right) =>
      left.properties.PARCEL.localeCompare(right.properties.PARCEL),
    ),
    invalidFeatureCount,
    duplicateParcelCount,
  };
}

function normalizeSaleRow(raw: z.infer<typeof saleCsvSchema>): SaleRow | null {
  const parcelId = raw.Parcel.trim();
  const sequenceId = raw.SequenceNum.trim();
  const recordingDate = raw.RecordingDate.trim();
  if (!parcelId || !sequenceId || !/^\d{4}-\d{2}-\d{2}$/.test(recordingDate)) return null;

  return {
    parcelId,
    sequenceId,
    saleMonth: parseSaleMonth(raw.SaleDate),
    recordingDate,
    salePrice: parsePositiveNumber(raw.SalePrice),
    propertyType: raw.PropertyType.trim(),
    intendedUse: raw.IntendedUse.trim(),
    deed: raw.Deed.trim(),
    financing: raw.Financing.trim(),
    validationDescription: raw.ValidationDescription.trim(),
    buyerSellerRelated: raw.BuyerSellerRelated.trim(),
    solar: raw.Solar.trim(),
    personalProperty: raw.PersonalProperty.trim(),
    partialInterest: raw.PartialInterest.trim(),
    parcelUse: raw.ParcelUse.trim(),
  };
}

function buildTransactions(
  salesBySequence: ReadonlyMap<string, SaleRow[]>,
  targetParcelIds: ReadonlySet<string>,
  windowStartDate: string,
  dataThroughDate: string,
): SaleTransaction[] {
  const transactions: SaleTransaction[] = [];

  for (const [sequenceId, unsortedRows] of salesBySequence) {
    if (!unsortedRows.some((row) => targetParcelIds.has(row.parcelId))) continue;
    const rows = [...unsortedRows].sort((left, right) =>
      `${left.recordingDate}:${left.parcelId}`.localeCompare(`${right.recordingDate}:${right.parcelId}`),
    );
    const first = rows[0];
    if (!first || first.recordingDate < windowStartDate || first.recordingDate > dataThroughDate) continue;

    const prices = [...new Set(rows.map((row) => row.salePrice).filter((price): price is number => price !== null))];
    const months = [...new Set(rows.map((row) => row.saleMonth).filter((month): month is string => month !== null))];
    const quality = classifySale(rows);
    transactions.push({
      sequenceId,
      saleMonth: months[0] ?? null,
      saleDatePrecision: "month",
      recordingDate: first.recordingDate,
      salePrice: prices[0] ?? null,
      propertyType: first.propertyType,
      intendedUse: first.intendedUse,
      residentialScope: isResidentialPropertyType(first.propertyType),
      deed: first.deed,
      financing: first.financing,
      validationDescription: first.validationDescription,
      qualityTier: quality.tier,
      qualityReasons: quality.reasons,
      parcelIds: [...new Set(rows.map((row) => row.parcelId))].sort(),
    });
  }

  return transactions.sort((left, right) =>
    `${left.recordingDate}:${left.sequenceId}`.localeCompare(`${right.recordingDate}:${right.sequenceId}`),
  );
}

function buildMemberships(
  parcels: readonly ParcelFeature[],
  subdivisionFeatures: readonly Feature<Geometry, SubdivisionProperties>[],
): CommunityMembership[] {
  const platMarket = new Map<string, MarketDefinition>();
  const overrideMarket = new Map<string, MarketDefinition>();
  for (const market of MARKET_DEFINITIONS) {
    for (const plat of market.platIds) platMarket.set(plat, market);
    for (const parcelId of market.reviewedParcelOverrides ?? []) {
      overrideMarket.set(parcelId, market);
    }
  }

  const boundaryFeaturesByMarket = new Map<string, Feature<Geometry, SubdivisionProperties>[]>();
  for (const market of MARKET_DEFINITIONS) {
    const plats = new Set(market.platIds);
    boundaryFeaturesByMarket.set(
      market.id,
      subdivisionFeatures.filter((feature) => plats.has(String(feature.properties?.BOOK_PAGE ?? ""))),
    );
  }

  const memberships: CommunityMembership[] = [];
  for (const parcel of parcels) {
    const platId = parcel.properties.MP_OL;
    const market =
      overrideMarket.get(parcel.properties.PARCEL) ?? (platId ? platMarket.get(platId) : undefined);
    if (!market) continue;

    if (market.rule === "plat_allowlist") {
      memberships.push({
        communityId: market.id,
        parcelId: parcel.properties.PARCEL,
        platId,
        method: "plat",
        boundaryVersion: market.boundaryVersion,
        reviewStatus: "approved",
      });
      continue;
    }

    const override = new Set(market.reviewedParcelOverrides ?? []);
    if (override.has(parcel.properties.PARCEL)) {
      memberships.push({
        communityId: market.id,
        parcelId: parcel.properties.PARCEL,
        platId,
        method: "reviewed_override",
        boundaryVersion: market.boundaryVersion,
        reviewStatus: "approved",
      });
      continue;
    }

    const withinBoundary = (boundaryFeaturesByMarket.get(market.id) ?? []).some((feature) =>
      pointInFeature(parcel.properties.LON, parcel.properties.LAT, feature),
    );
    memberships.push({
      communityId: market.id,
      parcelId: parcel.properties.PARCEL,
      platId,
      method: withinBoundary ? "centroid" : "plat",
      boundaryVersion: market.boundaryVersion,
      reviewStatus: withinBoundary ? "approved" : "needs_review",
    });
  }

  return memberships.sort((left, right) =>
    `${left.communityId}:${left.parcelId}`.localeCompare(`${right.communityId}:${right.parcelId}`),
  );
}

function buildRecordedSales(
  transactions: readonly SaleTransaction[],
  membershipByParcel: ReadonlyMap<string, CommunityMembership>,
  parcelById: ReadonlyMap<string, ParcelFeature>,
  improvements: ReadonlyMap<string, ImprovementSnapshot>,
): RecordedSale[] {
  const recordedSales: RecordedSale[] = [];

  for (const transaction of transactions) {
    for (const parcelId of transaction.parcelIds) {
      const membership = membershipByParcel.get(parcelId);
      const parcel = parcelById.get(parcelId);
      if (!membership || !parcel) continue;
      const improvement = improvements.get(parcelId);
      const pricePerSqft =
        transaction.parcelIds.length === 1 && transaction.salePrice && improvement?.sqft
          ? Math.round((transaction.salePrice / improvement.sqft) * 100) / 100
          : null;

      recordedSales.push({
        id: `${transaction.sequenceId}:${parcelId}`,
        communityId: membership.communityId,
        sequenceId: transaction.sequenceId,
        parcelId,
        recordingDate: transaction.recordingDate,
        saleMonth: transaction.saleMonth,
        saleDatePrecision: "month",
        salePrice: transaction.salePrice,
        propertyType: transaction.propertyType,
        intendedUse: transaction.intendedUse,
        residentialScope: transaction.residentialScope,
        assessorSqft: improvement?.sqft ?? null,
        sqftTaxYear: improvement?.taxYear ?? null,
        lotSizeSqft: parcel.properties.GISAREA,
        lotSizeAcres: parcel.properties.GISACRES,
        pricePerSqft,
        daysToClose: null,
        address: parcel.properties.ADDRESS_OL,
        longitude: parcel.properties.LON,
        latitude: parcel.properties.LAT,
        qualityTier: transaction.qualityTier,
        qualityReasons: transaction.qualityReasons,
        boundaryVersion: membership.boundaryVersion,
        membershipMethod: membership.method,
        membershipReviewStatus: membership.reviewStatus,
      });
    }
  }

  return recordedSales.sort((left, right) =>
    `${left.recordingDate}:${left.id}`.localeCompare(`${right.recordingDate}:${right.id}`),
  );
}

function buildCommunitySummaries(
  memberships: readonly CommunityMembership[],
  sales: readonly RecordedSale[],
): CommunitySummary[] {
  return MARKET_DEFINITIONS.map((market) => {
    const marketMemberships = memberships.filter((membership) => membership.communityId === market.id);
    const marketSales = sales.filter((sale) => sale.communityId === market.id);
    const mapEligible = marketSales.filter(
      (sale) => sale.residentialScope && sale.salePrice !== null && sale.qualityTier !== "X",
    );
    const trendEligible = marketSales.filter(
      (sale) => sale.residentialScope && sale.salePrice !== null && sale.qualityTier === "A",
    );
    const mapTransactions = new Set(mapEligible.map((sale) => sale.sequenceId));
    const trendTransactions = new Set(trendEligible.map((sale) => sale.sequenceId));
    const transactionPrices = uniqueTransactionValues(mapEligible, (sale) => sale.salePrice);
    const transactionPpsf = uniqueTransactionValues(mapEligible, (sale) => sale.pricePerSqft);

    return {
      id: market.id,
      name: market.name,
      rule: market.ruleDescription,
      boundaryVersion: market.boundaryVersion,
      parcelCount: marketMemberships.length,
      boundaryReviewCount: marketMemberships.filter((membership) => membership.reviewStatus === "needs_review").length,
      mapSaleCount: mapTransactions.size,
      trendSaleCount: trendTransactions.size,
      medianSalePrice: median(transactionPrices),
      medianPricePerSqft: median(transactionPpsf),
    };
  });
}

function uniqueTransactionValues(
  sales: readonly RecordedSale[],
  selector: (sale: RecordedSale) => number | null,
): number[] {
  const values = new Map<string, number>();
  for (const sale of sales) {
    const value = selector(sale);
    if (value !== null && !values.has(sale.sequenceId)) values.set(sale.sequenceId, value);
  }
  return [...values.values()];
}

function buildOutputs(args: {
  dataset: MarketPulseDataset;
  sourceEntries: SourceManifestEntry[];
  configHash: string;
  retrievedAt: string;
  subdivisionDataset: ArcGisDataset<SubdivisionProperties>;
  memberships: CommunityMembership[];
  recordedSales: RecordedSale[];
  parcelById: ReadonlyMap<string, ParcelFeature>;
  improvements: ReadonlyMap<string, ImprovementSnapshot>;
  parcelValidation: ReturnType<typeof validateAndDedupeParcels>;
  csvQuality: Record<string, unknown>;
  asOfCalendarDate: string;
}): PipelineOutputs {
  const salePoints: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: args.recordedSales
      .filter(
        (sale) => sale.residentialScope && sale.salePrice !== null && sale.qualityTier !== "X",
      )
      .map((sale) => ({
        type: "Feature",
        id: sale.id,
        geometry: makePoint(sale.longitude, sale.latitude),
        properties: {
          id: sale.id,
          communityId: sale.communityId,
          sequenceId: sale.sequenceId,
          parcelId: sale.parcelId,
          recordingDate: sale.recordingDate,
          salePrice: sale.salePrice,
          propertyType: sale.propertyType,
          pricePerSqft: sale.pricePerSqft,
          lotSizeSqft: sale.lotSizeSqft,
          qualityTier: sale.qualityTier,
        },
      })),
  };

  const marketByPlat = new Map<string, MarketDefinition>();
  for (const market of MARKET_DEFINITIONS) {
    for (const plat of market.platIds) marketByPlat.set(plat, market);
  }
  const boundaryFeatures: Feature[] = args.subdivisionDataset.features.flatMap((feature) => {
    const platId = String(feature.properties?.BOOK_PAGE ?? "");
    const market = marketByPlat.get(platId);
    if (!market) return [];
    return [
      {
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          communityId: market.id,
          boundaryVersion: market.boundaryVersion,
          platId,
          subdivisionName: feature.properties?.SUB_NAME ?? null,
        },
      },
    ];
  });

  const manifest: SourceManifest = {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    configHash: args.configHash,
    generatedAt: args.retrievedAt,
    dataThroughDate: args.dataset.dataThroughDate,
    sources: args.sourceEntries,
  };
  const qualityReport = {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    generatedAt: args.retrievedAt,
    parcelValidation: {
      sourceFeatureCount: args.parcelValidation.parcels.length + args.parcelValidation.invalidFeatureCount,
      distinctParcelCount: args.parcelValidation.parcels.length,
      invalidFeatureCount: args.parcelValidation.invalidFeatureCount,
      duplicateParcelCount: args.parcelValidation.duplicateParcelCount,
    },
    membership: Object.fromEntries(
      MARKET_DEFINITIONS.map((market) => {
        const rows = args.memberships.filter((membership) => membership.communityId === market.id);
        const lotAreaCount = rows.filter((row) => {
          const lotArea = args.parcelById.get(row.parcelId)?.properties.GISAREA;
          return typeof lotArea === "number" && lotArea > 0;
        }).length;
        const sqftCount = rows.filter((row) => args.improvements.has(row.parcelId)).length;
        return [
          market.id,
          {
            parcelCount: rows.length,
            lotAreaCount,
            lotAreaCoveragePct: percentage(lotAreaCount, rows.length),
            assessorSqftCount: sqftCount,
            assessorSqftCoveragePct: percentage(sqftCount, rows.length),
            approvedCount: rows.filter((row) => row.reviewStatus === "approved").length,
            needsReviewCount: rows.filter((row) => row.reviewStatus === "needs_review").length,
            needsReview: rows
              .filter((row) => row.reviewStatus === "needs_review")
              .map((row) => ({
                parcelId: row.parcelId,
                platId: row.platId,
                method: row.method,
                boundaryVersion: row.boundaryVersion,
              })),
          },
        ];
      }),
    ),
    sales: {
      transactionCount: args.dataset.transactions.length,
      recordedSaleParcelCount: args.recordedSales.length,
      mapEligibleTransactionCount: new Set(
        args.recordedSales
          .filter(
            (sale) =>
              sale.residentialScope && sale.salePrice !== null && sale.qualityTier !== "X",
          )
          .map((sale) => sale.sequenceId),
      ).size,
      trendEligibleTransactionCount: new Set(
        args.recordedSales
          .filter((sale) => sale.residentialScope && sale.qualityTier === "A")
          .map((sale) => sale.sequenceId),
      ).size,
      excludedTransactionCount: args.dataset.transactions.filter((transaction) => transaction.qualityTier === "X").length,
      outOfResidentialScopeTransactionCount: args.dataset.transactions.filter(
        (transaction) => !transaction.residentialScope,
      ).length,
      missingSqftSaleCount: args.recordedSales.filter((sale) => sale.assessorSqft === null).length,
      multiParcelTransactionCount: args.dataset.transactions.filter((transaction) => transaction.parcelIds.length > 1).length,
    },
    csv: args.csvQuality,
    sourceFreshness: {
      asOfDate: args.asOfCalendarDate,
      dataThroughDate: args.dataset.dataThroughDate,
      lagDays: dateDifferenceDays(args.dataset.dataThroughDate, args.asOfCalendarDate),
      alertThresholdDays: 21,
      exceedsAlertThreshold:
        dateDifferenceDays(args.dataset.dataThroughDate, args.asOfCalendarDate) > 21,
    },
    privacy: {
      ownerNamesStored: false,
      ownerMailingAddressesStored: false,
      parcelFieldsRequested: [
        "PARCEL",
        "MP_OL",
        "GISAREA",
        "GISACRES",
        "LON",
        "LAT",
        "ADDRESS_OL",
        "LEGAL1",
        "LOT_R",
        "PARCEL_USE",
      ],
    },
  };

  return {
    dataset: args.dataset,
    salePoints,
    communityBoundaries: { type: "FeatureCollection", features: boundaryFeatures },
    manifest,
    qualityReport,
  };
}

async function writeOutputs(outputDirectory: string, outputs: PipelineOutputs): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeJson(path.join(outputDirectory, "market-pulse.json"), outputs.dataset),
    writeJson(path.join(outputDirectory, "recorded-sales.geojson"), outputs.salePoints),
    writeJson(path.join(outputDirectory, "community-boundaries.geojson"), outputs.communityBoundaries),
    writeJson(path.join(outputDirectory, "source-manifest.json"), outputs.manifest),
    writeJson(path.join(outputDirectory, "quality-report.json"), outputs.qualityReport),
  ]);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readExistingManifest(outputDirectory: string): Promise<SourceManifest | null> {
  try {
    const raw = await readFile(path.join(outputDirectory, "source-manifest.json"), "utf8");
    return JSON.parse(raw) as SourceManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sameSourceFingerprints(
  previous: readonly SourceManifestEntry[],
  current: readonly SourceManifestEntry[],
): boolean {
  if (previous.length !== current.length) return false;
  const previousByName = new Map(previous.map((entry) => [entry.name, entry]));
  return current.every((entry) => {
    const match = previousByName.get(entry.name);
    return (
      match?.url === entry.url &&
      match.sha256 === entry.sha256 &&
      match.bytes === entry.bytes
    );
  });
}

function parseAsOfDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`Invalid FMP_AS_OF_DATE: ${value}`);
  return parsed;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

function dateDifferenceDays(earlier: string, later: string): number {
  const milliseconds = Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`);
  return Math.max(0, Math.round(milliseconds / 86_400_000));
}

function formatArizonaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
