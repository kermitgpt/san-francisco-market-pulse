import { runPipeline } from "./pipeline";

const args = process.argv.slice(2);
const zillowPath = valueAfter("--zillow");
const boundariesPath = valueAfter("--boundaries");
const transfersPath = valueAfter("--transfers");
const dataset = await runPipeline({
  refresh: args.includes("--refresh"),
  ...(zillowPath ? { zillowPath } : {}),
  ...(boundariesPath ? { boundariesPath } : {}),
  ...(transfersPath ? { transfersPath } : {}),
});

console.log(
  `Built ${dataset.neighborhoods.length} featured neighborhoods and ${dataset.transfers.count} residential transfer points through ${dataset.latestDate}.`,
);

function valueAfter(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a file path.`);
  return value;
}
