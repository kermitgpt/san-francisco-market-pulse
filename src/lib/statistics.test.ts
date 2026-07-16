import assert from "node:assert/strict";
import test from "node:test";
import {
  median,
  selectAdaptiveWindow,
  subtractMonths,
  subtractOneYear,
} from "./statistics.js";

test("median handles odd, even, and empty value sets", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test("the rolling window preserves the calendar day", () => {
  assert.equal(subtractOneYear("2026-07-15"), "2025-07-15");
  assert.equal(subtractMonths("2024-02-29", 12), "2023-02-28");
});

test("adaptive windows extend in deterministic six-month increments", () => {
  const dates = [
    ...Array.from({ length: 6 }, (_, index) => `2026-0${index + 1}-15`),
    ...Array.from({ length: 6 }, (_, index) => `2025-0${index + 1}-15`),
  ];
  assert.deepEqual(selectAdaptiveWindow("2026-07-01", dates), {
    months: 18,
    startDate: "2025-01-01",
    saleCount: 12,
    trailing12MonthSaleCount: 6,
  });
});

test("adaptive windows stop at 36 months even below the target", () => {
  assert.deepEqual(selectAdaptiveWindow("2026-07-01", ["2024-01-15"]), {
    months: 36,
    startDate: "2023-07-01",
    saleCount: 1,
    trailing12MonthSaleCount: 0,
  });
});
