export interface GrowthInput {
  id: string;
  name: string;
  change: number;
}

export type GrowthStandingLabel =
  | "High-growth outlier"
  | "Above peer median"
  | "Near peer median"
  | "Below peer median"
  | "Lower-growth outlier";

export interface GrowthStanding extends GrowthInput {
  deltaFromMedian: number;
  rank: number;
  standing: GrowthStandingLabel;
  isOutlier: boolean;
}

export interface GrowthAnalysis {
  medianChange: number;
  outlierThreshold: number;
  rankings: GrowthStanding[];
  highestGrowth: GrowthStanding[];
  lowestGrowth: GrowthStanding[];
}

export function analyzeGrowth(items: GrowthInput[]): GrowthAnalysis | null {
  if (items.length === 0) return null;
  const medianChange = median(items.map((item) => item.change));
  const medianAbsoluteDeviation = median(
    items.map((item) => Math.abs(item.change - medianChange)),
  );
  const outlierThreshold = roundOne(Math.max(4, medianAbsoluteDeviation * 2));
  const sorted = [...items].sort(
    (left, right) => right.change - left.change || left.name.localeCompare(right.name),
  );
  const rankings = sorted.map((item, index) => {
    const deltaFromMedian = roundOne(item.change - medianChange);
    const isHighOutlier = deltaFromMedian >= outlierThreshold;
    const isLowOutlier = deltaFromMedian <= -outlierThreshold;
    let standing: GrowthStandingLabel = "Near peer median";
    if (isHighOutlier) standing = "High-growth outlier";
    else if (isLowOutlier) standing = "Lower-growth outlier";
    else if (deltaFromMedian >= 1) standing = "Above peer median";
    else if (deltaFromMedian <= -1) standing = "Below peer median";

    return {
      ...item,
      deltaFromMedian,
      rank: index + 1,
      standing,
      isOutlier: isHighOutlier || isLowOutlier,
    };
  });

  return {
    medianChange: roundOne(medianChange),
    outlierThreshold,
    rankings,
    highestGrowth: rankings.slice(0, 2),
    lowestGrowth: rankings.slice(-2).reverse(),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
