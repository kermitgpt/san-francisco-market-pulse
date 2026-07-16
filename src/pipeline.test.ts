import assert from "node:assert/strict";
import test from "node:test";
import { FEATURED_NEIGHBORHOODS } from "./config/neighborhoods";
import { percentChange } from "./pipeline";

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
