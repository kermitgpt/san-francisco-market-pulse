import type { Feature, FeatureCollection, Geometry, Point } from "geojson";

export type QualityTier = "A" | "B" | "X";
export type ReviewStatus = "approved" | "needs_review";
export type MembershipMethod = "plat" | "centroid" | "reviewed_override";

export interface SourceManifestEntry {
  name: string;
  url: string;
  retrievedAt: string;
  sha256: string;
  bytes: number;
  rowCount: number | null;
}

export interface SourceManifest {
  schemaVersion: "1.1.0";
  configHash: string;
  generatedAt: string;
  dataThroughDate: string | null;
  sources: SourceManifestEntry[];
}

export interface SaleRow {
  parcelId: string;
  sequenceId: string;
  saleMonth: string | null;
  recordingDate: string;
  salePrice: number | null;
  propertyType: string;
  intendedUse: string;
  deed: string;
  financing: string;
  validationDescription: string;
  buyerSellerRelated: string;
  solar: string;
  personalProperty: string;
  partialInterest: string;
  parcelUse: string;
}

export interface SaleTransaction {
  sequenceId: string;
  saleMonth: string | null;
  saleDatePrecision: "month";
  recordingDate: string;
  salePrice: number | null;
  propertyType: string;
  intendedUse: string;
  residentialScope: boolean;
  deed: string;
  financing: string;
  validationDescription: string;
  qualityTier: QualityTier;
  qualityReasons: string[];
  parcelIds: string[];
}

export interface ParcelProperties {
  OBJECTID?: number | undefined;
  PARCEL: string;
  MP_OL: string | null;
  GISAREA: number | null;
  GISACRES: number | null;
  LON: number;
  LAT: number;
  ADDRESS_OL: string | null;
  LEGAL1: string | null;
  LOT_R: string | null;
  PARCEL_USE: string | null;
}

export type ParcelFeature = Feature<Geometry, ParcelProperties>;

export interface ImprovementSnapshot {
  parcelId: string;
  taxYear: number;
  sqft: number;
  sfrCondo: string;
}

export interface CommunityMembership {
  communityId: string;
  parcelId: string;
  platId: string | null;
  method: MembershipMethod;
  boundaryVersion: string;
  reviewStatus: ReviewStatus;
}

export interface RecordedSale {
  id: string;
  communityId: string;
  sequenceId: string;
  parcelId: string;
  recordingDate: string;
  saleMonth: string | null;
  saleDatePrecision: "month";
  salePrice: number | null;
  propertyType: string;
  intendedUse: string;
  residentialScope: boolean;
  assessorSqft: number | null;
  sqftTaxYear: number | null;
  lotSizeSqft: number | null;
  lotSizeAcres: number | null;
  pricePerSqft: number | null;
  daysToClose: null;
  address: string | null;
  longitude: number;
  latitude: number;
  qualityTier: QualityTier;
  qualityReasons: string[];
  boundaryVersion: string;
  membershipMethod: MembershipMethod;
  membershipReviewStatus: ReviewStatus;
}

export interface CommunitySummary {
  id: string;
  name: string;
  rule: string;
  boundaryVersion: string;
  parcelCount: number;
  boundaryReviewCount: number;
  fullPullMarketSaleCount: number;
  analysisWindowMonths: 12 | 18 | 24 | 30 | 36;
  analysisWindowStartDate: string;
  analysisWindowEndDate: string;
  analysisWindowLabel: string;
  saleCountInWindow: number;
  trailing12MonthSaleCount: number;
  currentStatsWindowMonths: 12;
  currentStatsSaleCount: number;
  currentStatsMethod: "trailing_12_months_only";
  mapSaleCount: number;
  trendSaleCount: number;
  trendLineEligible: boolean;
  medianSalePrice: number | null;
  medianPricePerSqft: number | null;
  lotSizeRangeAcres: {
    min: number;
    max: number;
  } | null;
}

export interface MarketPulseDataset {
  schemaVersion: "1.1.0";
  label: "recent recorded sales";
  generatedAt: string;
  dataThroughDate: string;
  windowStartDate: string;
  ingestionWindowMonths: 36;
  sources: SourceManifestEntry[];
  communities: CommunitySummary[];
  transactions: SaleTransaction[];
  sales: RecordedSale[];
}

export interface PipelineOutputs {
  dataset: MarketPulseDataset;
  salePoints: FeatureCollection<Point>;
  communityBoundaries: FeatureCollection;
  parcelBoundaries: FeatureCollection;
  manifest: SourceManifest;
  qualityReport: Record<string, unknown>;
  reviewMarkdown: string;
}
