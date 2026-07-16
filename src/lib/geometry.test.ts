import assert from "node:assert/strict";
import test from "node:test";
import type { Polygon } from "geojson";
import { pointInGeometry } from "./geometry.js";

const polygon: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ],
};

test("point-in-polygon includes the exterior and boundary", () => {
  assert.equal(pointInGeometry(2, 2, polygon), true);
  assert.equal(pointInGeometry(0, 5, polygon), true);
});

test("point-in-polygon excludes holes and exterior points", () => {
  assert.equal(pointInGeometry(5, 5, polygon), false);
  assert.equal(pointInGeometry(12, 5, polygon), false);
});
