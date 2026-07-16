import type { FeatureCollection, Geometry, Point } from "geojson";

export interface MonthlyValue {
  date: string;
  value: number;
}

export interface NeighborhoodPulse {
  id: string;
  name: string;
  sourceRegionName: string;
  sourceRegionId: number;
  featuredOrder: number;
  history: MonthlyValue[];
  latestValue: number;
  latest12MonthChangePct: number;
  latest36MonthChangePct: number;
}

export interface MarketPulseDataset {
  generatedAt: string;
  displayMonths: number;
  displayStartDate: string;
  latestDate: string;
  source: {
    metricName: string;
    metricShortName: string;
    methodologyUrl: string;
    downloadUrl: string;
    geographyName: string;
    geographyUrl: string;
    disclosure: string;
    transferDatasetName: string;
    transferDatasetUrl: string;
    transferDisclosure: string;
  };
  transfers: {
    count: number;
    dataStartDate: string;
    dataEndDate: string;
    sourceRollYear: number;
  };
  neighborhoods: NeighborhoodPulse[];
}

export interface TransferPointProperties {
  transferId: string;
  neighborhoodId: string;
  neighborhoodName: string;
  parcelNumber: string;
  address: string;
  recordedDate: string;
  propertyAreaSqft: number | null;
  lotAreaSqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string;
  propertyCategory: TransferPropertyCategory;
  sourceRollYear: number;
}

export type TransferPropertyCategory =
  | "single-family"
  | "condo-coop"
  | "townhome"
  | "small-multifamily"
  | "apartment-building"
  | "other";

export type ResidentialTransfers = FeatureCollection<Point, TransferPointProperties>;

export interface NeighborhoodBoundaryProperties {
  id: string;
  name: string;
  featured: boolean;
  dataId: string | null;
}

export type NeighborhoodBoundaries = FeatureCollection<
  Geometry,
  NeighborhoodBoundaryProperties
>;
