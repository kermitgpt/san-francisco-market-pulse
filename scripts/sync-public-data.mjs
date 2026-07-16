import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const sourceDirectory = path.resolve("data/processed");
const publicDirectory = path.resolve("public/data");
const files = ["sf-market-pulse.json", "sf-neighborhoods.geojson"];

await mkdir(publicDirectory, { recursive: true });
await Promise.all(
  files.map((file) => copyFile(path.join(sourceDirectory, file), path.join(publicDirectory, file))),
);

console.log(`Synced ${files.length} public data files.`);
