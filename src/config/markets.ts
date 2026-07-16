export type MembershipRule = "plat_allowlist" | "geographic_gate";

export interface MarketDefinition {
  id: "pima-canyon" | "finisterra" | "ventana-canyon";
  name: string;
  rule: MembershipRule;
  ruleDescription: string;
  platIds: readonly string[];
  boundaryVersion: string;
  boundarySource: string;
  includedAccessAreas?: readonly string[];
  excludedAreas?: readonly string[];
  reviewedParcelOverrides?: readonly string[];
}

export const MARKET_DEFINITIONS: readonly MarketDefinition[] = [
  {
    id: "pima-canyon",
    name: "Pima Canyon",
    rule: "plat_allowlist",
    ruleDescription:
      "Every current county parcel assigned to an approved Pima Canyon Estates plat, including The Enclave at Pima Canyon.",
    platIds: ["48074", "48089", "50087", "53036", "55059", "57023"],
    boundaryVersion: "pima-canyon-plats-v1",
    boundarySource:
      "https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer/15",
  },
  {
    id: "finisterra",
    name: "Finisterra",
    rule: "plat_allowlist",
    ruleDescription:
      "Every current county parcel assigned to the recorded Finisterra I, II, or III plats.",
    platIds: ["33069", "34026", "43097"],
    boundaryVersion: "finisterra-plats-v1",
    boundarySource:
      "https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer/15",
  },
  {
    id: "ventana-canyon",
    name: "Ventana Canyon",
    rule: "geographic_gate",
    ruleDescription:
      "Every residential parcel geographically behind and reached through the main Kolb Road gate, regardless of VCCA membership.",
    platIds: [
      "37079",
      "38032",
      "38043",
      "38059",
      "39021",
      "40048",
      "41028",
      "41031",
      "41048",
      "43043",
      "43085",
      "43089",
      "46002",
      "46003",
      "50055",
      "56024",
    ],
    boundaryVersion: "ventana-main-kolb-gate-v1",
    boundarySource:
      "https://ventanacanyoncommunity.com/wp-content/uploads/vc-web-map.pdf",
    includedAccessAreas: [
      "Esperero Canyon Estates",
      "end of Stone Canyon",
      "end of Hole in the Wall Way",
      "Hototo Place",
    ],
    excludedAreas: [
      "The Ridge",
      "Ventana Entrada",
      "Ventana del Oeste",
      "Westgate",
    ],
    reviewedParcelOverrides: [
      "11402006X",
      "11402006Y",
      "11402006Z",
      "11403348C",
      "11404690A",
      "114046910",
      "11404697A",
    ],
  },
] as const;

export const ALL_PILOT_PLATS = [
  ...new Set(MARKET_DEFINITIONS.flatMap((market) => market.platIds)),
].sort();

export const ALL_REVIEWED_PARCEL_OVERRIDES = [
  ...new Set(
    MARKET_DEFINITIONS.flatMap((market) => market.reviewedParcelOverrides ?? []),
  ),
].sort();

export const MARKET_CONFIG_VERSION = "2026-07-15-v2";
