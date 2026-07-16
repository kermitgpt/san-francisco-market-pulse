import assert from "node:assert/strict";
import test from "node:test";
import type { SaleRow } from "../types.js";
import {
  classifySale,
  isResidentialPropertyType,
  parsePositiveNumber,
  parseSaleMonth,
} from "./quality.js";

const goodSale: SaleRow = {
  parcelId: "114000000",
  sequenceId: "20260000001",
  saleMonth: "2026-06",
  recordingDate: "2026-06-15",
  salePrice: 2_500_000,
  propertyType: "Single Family",
  intendedUse: "PrimaryRes",
  deed: "Warranty Deed",
  financing: "Cash",
  validationDescription: "Good Sale",
  buyerSellerRelated: "No",
  solar: "No",
  personalProperty: "No",
  partialInterest: "No",
  parcelUse: "0133",
};

test("county good sales are trend eligible", () => {
  assert.deepEqual(classifySale([goodSale]), {
    tier: "A",
    reasons: ["county_good_sale"],
  });
});

test("numeric sales with a neutral review flag remain map-review eligible", () => {
  const result = classifySale([
    { ...goodSale, validationDescription: "Buyer/Seller has an Out-Of-State Address" },
  ]);
  assert.equal(result.tier, "B");
});

test("duress, related-party, and partial-interest sales are excluded", () => {
  const result = classifySale([
    {
      ...goodSale,
      validationDescription: "Sale under duress/Non-arm's length transaction",
      buyerSellerRelated: "Yes",
      partialInterest: "Yes",
    },
  ]);
  assert.equal(result.tier, "X");
  assert.ok(result.reasons.includes("related_parties"));
  assert.ok(result.reasons.includes("partial_interest"));
});

test("intermediary or straw-man transfers are excluded", () => {
  const result = classifySale([
    {
      ...goodSale,
      validationDescription: 'Sale to or from an intermediary or "straw man"',
    },
  ]);
  assert.equal(result.tier, "X");
  assert.ok(result.reasons.includes("validation:intermediary"));
});

test("quitclaims and nominal-value recordings are excluded", () => {
  const quitclaim = classifySale([
    { ...goodSale, deed: "Quit Claim Deed", validationDescription: "Good Sale" },
  ]);
  assert.equal(quitclaim.tier, "X");
  assert.ok(quitclaim.reasons.includes("deed:quit_claim"));

  const nominal = classifySale([{ ...goodSale, salePrice: 10 }]);
  assert.equal(nominal.tier, "X");
  assert.ok(nominal.reasons.includes("nominal_price_below_50000"));
});

test("source scalar parsing never invents dates or zero prices", () => {
  assert.equal(parseSaleMonth("202607"), "2026-07");
  assert.equal(parseSaleMonth("202600"), null);
  assert.equal(parsePositiveNumber("2,750,000"), 2_750_000);
  assert.equal(parsePositiveNumber("Unknown"), null);
  assert.equal(parsePositiveNumber("0"), null);
});

test("public map scope is limited to residential property types", () => {
  assert.equal(isResidentialPropertyType("Single Family"), true);
  assert.equal(isResidentialPropertyType("Condo/Townhouse"), true);
  assert.equal(isResidentialPropertyType("Vacant Land"), false);
  assert.equal(isResidentialPropertyType("Commercial"), false);
});
