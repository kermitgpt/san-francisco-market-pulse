import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const sourceDirectory = path.resolve("data/processed");
const publicDirectory = path.resolve("public/data");
const files = [
  "market-pulse.json",
  "recorded-sales.geojson",
  "community-boundaries.geojson",
  "pilot-parcels.geojson",
];

await mkdir(publicDirectory, { recursive: true });
await Promise.all(
  files.map((file) =>
    copyFile(path.join(sourceDirectory, file), path.join(publicDirectory, file)),
  ),
);

console.log(`Synced ${files.length} public data files.`);
