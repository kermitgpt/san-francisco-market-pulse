import type { FeatureCollection, Geometry } from "geojson";

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
  };
  neighborhoods: NeighborhoodPulse[];
}

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
