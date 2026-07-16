export interface FeaturedNeighborhood {
  id: string;
  boundaryName: string;
  displayName: string;
  zillowRegionName: string;
  order: number;
}

export const FEATURED_NEIGHBORHOODS: readonly FeaturedNeighborhood[] = [
  { id: "pacific-heights", boundaryName: "Pacific Heights", displayName: "Pacific Heights", zillowRegionName: "Pacific Heights", order: 1 },
  { id: "marina", boundaryName: "Marina", displayName: "Marina", zillowRegionName: "Marina District", order: 2 },
  { id: "noe-valley", boundaryName: "Noe Valley", displayName: "Noe Valley", zillowRegionName: "Noe Valley", order: 3 },
  { id: "mission", boundaryName: "Mission", displayName: "Mission", zillowRegionName: "Mission", order: 4 },
  { id: "russian-hill", boundaryName: "Russian Hill", displayName: "Russian Hill", zillowRegionName: "Russian Hill", order: 5 },
  { id: "nob-hill", boundaryName: "Nob Hill", displayName: "Nob Hill", zillowRegionName: "Nob Hill", order: 6 },
  { id: "hayes-valley", boundaryName: "Hayes Valley", displayName: "Hayes Valley", zillowRegionName: "Hayes Valley", order: 7 },
  { id: "haight-ashbury", boundaryName: "Haight Ashbury", displayName: "Haight-Ashbury", zillowRegionName: "Haight", order: 8 },
  { id: "castro", boundaryName: "Castro/Upper Market", displayName: "Castro", zillowRegionName: "Castro", order: 9 },
  { id: "north-beach", boundaryName: "North Beach", displayName: "North Beach", zillowRegionName: "North Beach", order: 10 },
  { id: "potrero-hill", boundaryName: "Potrero Hill", displayName: "Potrero Hill", zillowRegionName: "Potrero Hill", order: 11 },
  { id: "bernal-heights", boundaryName: "Bernal Heights", displayName: "Bernal Heights", zillowRegionName: "Bernal Heights", order: 12 },
  { id: "inner-sunset", boundaryName: "Inner Sunset", displayName: "Inner Sunset", zillowRegionName: "Inner Sunset", order: 13 },
  { id: "inner-richmond", boundaryName: "Inner Richmond", displayName: "Inner Richmond", zillowRegionName: "Inner Richmond", order: 14 },
  { id: "south-of-market", boundaryName: "South of Market", displayName: "SoMa", zillowRegionName: "South of Market", order: 15 },
  { id: "presidio-heights", boundaryName: "Presidio Heights", displayName: "Presidio Heights", zillowRegionName: "Presidio Heights", order: 16 },
  { id: "seacliff", boundaryName: "Seacliff", displayName: "Sea Cliff", zillowRegionName: "Seacliff", order: 17 },
  { id: "mission-bay", boundaryName: "Mission Bay", displayName: "Mission Bay", zillowRegionName: "Mission Bay", order: 18 },
] as const;
