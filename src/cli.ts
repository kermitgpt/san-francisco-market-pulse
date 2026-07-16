import { runPipeline } from "./pipeline.js";

try {
  const result = await runPipeline();
  if (result.status === "noop") {
    console.log(`No source or configuration changes; outputs are current in ${result.outputDirectory}`);
  } else {
    const communities = result.dataset?.communities ?? [];
    console.log(`Updated ${result.outputDirectory}`);
    for (const community of communities) {
      console.log(
        `${community.name}: ${community.parcelCount} parcels, ${community.saleCountInWindow} market sales across ${community.analysisWindowMonths} months, ${community.boundaryReviewCount} boundary reviews`,
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
