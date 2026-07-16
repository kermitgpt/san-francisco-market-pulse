import assert from "node:assert/strict";
import test from "node:test";
import { median, subtractOneYear } from "./statistics.js";

test("median handles odd, even, and empty value sets", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test("the rolling window preserves the calendar day", () => {
  assert.equal(subtractOneYear("2026-07-15"), "2025-07-15");
});
