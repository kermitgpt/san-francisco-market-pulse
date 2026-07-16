import assert from "node:assert/strict";
import test from "node:test";
import { FEATURED_NEIGHBORHOODS } from "./config/neighborhoods";
import { analyzeGrowth } from "./growth-analysis";
import { formatAssessorAddress, percentChange } from "./pipeline";
import { categorizePropertyType } from "./transfer-categories";
import { zillowAddressUrl } from "./zillow";

test("featured neighborhood ids, boundaries, and source names are unique", () => {
  for (const field of ["id", "boundaryName", "zillowRegionName"] as const) {
    const values = FEATURED_NEIGHBORHOODS.map((item) => item[field]);
    assert.equal(new Set(values).size, values.length, `${field} must be unique`);
  }
});

test("percentChange returns a two-decimal percentage", () => {
  assert.equal(percentChange(1_125_000, 1_000_000), 12.5);
  assert.equal(percentChange(925_000, 1_000_000), -7.5);
  assert.equal(percentChange(1_000_001, 1_000_000), 0);
});

test("percentChange rejects an unusable comparison value", () => {
  assert.throws(() => percentChange(100, 0));
});

test("assessor fixed-width locations become readable addresses", () => {
  assert.equal(formatAssessorAddress("0000 2366 28TH                AV0000"), "2366 28th Ave");
  assert.equal(formatAssessorAddress("W000 0611 WASHINGTON ST2202"), "611 Washington St #2202");
});

test("Zillow links use an exact San Francisco address search", () => {
  assert.equal(
    zillowAddressUrl("3042 Jackson St #4"),
    "https://www.zillow.com/homes/3042-Jackson-St-Apt-4-San-Francisco-CA_rb/",
  );
});

test("assessor property classes map to useful public-record filters", () => {
  assert.equal(categorizePropertyType("Dwelling"), "single-family");
  assert.equal(categorizePropertyType("Condominium"), "condo-coop");
  assert.equal(categorizePropertyType("Town House"), "townhome");
  assert.equal(categorizePropertyType("Flats & Duplex"), "small-multifamily");
  assert.equal(categorizePropertyType("Apartment 5 to 14 Units"), "apartment-building");
});

test("growth analysis ranks extremes and uses a robust outlier threshold", () => {
  const result = analyzeGrowth([
    { id: "a", name: "Alpha", change: 20 },
    { id: "b", name: "Bravo", change: 11 },
    { id: "c", name: "Charlie", change: 9 },
    { id: "d", name: "Delta", change: 8 },
    { id: "e", name: "Echo", change: -6 },
  ]);
  assert.ok(result);
  assert.equal(result.rankings[0]?.name, "Alpha");
  assert.equal(result.lowestGrowth[0]?.name, "Echo");
  assert.equal(result.rankings[0]?.standing, "High-growth outlier");
  assert.equal(result.lowestGrowth[0]?.standing, "Lower-growth outlier");
  assert.ok(result.outlierThreshold >= 4);
});
