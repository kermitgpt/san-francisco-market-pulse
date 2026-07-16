import type { QualityTier, SaleRow } from "../types.js";

export interface QualityResult {
  tier: QualityTier;
  reasons: string[];
}

const EXCLUDED_VALIDATION_TERMS = [
  "duress",
  "non-arm",
  "related",
  "government",
  "nominal",
  "court",
  "partial interest",
  "personal property",
  "intermediary",
  "straw man",
  "inconsistent",
  "unusable",
  "lot split",
  "parcel split",
];

const EXCLUDED_DEED_TERMS = ["quit claim", "quitclaim"];
export const MINIMUM_MARKET_SALE_PRICE = 50_000;

export function classifySale(rows: readonly SaleRow[]): QualityResult {
  const reasons = new Set<string>();
  const prices = new Set(rows.map((row) => row.salePrice).filter((price) => price !== null));

  if (prices.size === 0 || [...prices].some((price) => price === null || price <= 0)) {
    reasons.add("missing_or_nonpositive_price");
  }
  if (prices.size > 1) reasons.add("inconsistent_multirow_price");
  if ([...prices].some((price) => price < MINIMUM_MARKET_SALE_PRICE)) {
    reasons.add("nominal_price_below_50000");
  }
  if (rows.some((row) => yes(row.buyerSellerRelated))) reasons.add("related_parties");
  if (rows.some((row) => yes(row.personalProperty))) reasons.add("personal_property");
  if (rows.some((row) => yes(row.partialInterest))) reasons.add("partial_interest");

  for (const row of rows) {
    const description = row.validationDescription.toLowerCase();
    for (const term of EXCLUDED_VALIDATION_TERMS) {
      if (description.includes(term)) reasons.add(`validation:${term.replaceAll(" ", "_")}`);
    }
    const deed = row.deed.toLowerCase();
    for (const term of EXCLUDED_DEED_TERMS) {
      if (deed.includes(term)) reasons.add(`deed:${term.replaceAll(" ", "_")}`);
    }
  }

  if (reasons.size > 0) {
    return { tier: "X", reasons: [...reasons].sort() };
  }

  const allGoodSale = rows.every((row) => row.validationDescription.trim().toLowerCase() === "good sale");
  if (allGoodSale) return { tier: "A", reasons: ["county_good_sale"] };

  return { tier: "B", reasons: ["numeric_sale_requires_review"] };
}

export function parsePositiveNumber(value: string): number | null {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseSaleMonth(value: string): string | null {
  const normalized = value.trim();
  const match = /^(\d{4})(0[1-9]|1[0-2])$/.exec(normalized);
  return match ? `${match[1]}-${match[2]}` : null;
}

export function isResidentialPropertyType(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "single family" || normalized === "condo/townhouse";
}

function yes(value: string): boolean {
  return value.trim().toLowerCase() === "yes";
}
