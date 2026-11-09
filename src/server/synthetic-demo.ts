import { readFileSync } from "node:fs";
import path from "node:path";

import { buildDataset } from "@/lib/build-dataset";
import { issue } from "@/lib/issues";
import { OFFICIAL_SHA256 } from "@/lib/official-source";
import { SYNTHETIC_DEMO_NOTICE } from "@/lib/synthetic-demo-notice";
import { datasetSchema, type EvidenceDataset } from "@/lib/schema";

/** Builds the checked-in girls-toilet fixture. Does not read or write the official import file. */
export function loadSyntheticDemoDataset(): EvidenceDataset {
  const root = path.join(process.cwd(), "fixtures", "synthetic");
  const read = (name: string) => readFileSync(path.join(root, name), "utf8");
  const built = buildDataset({
    mode: "synthetic-test",
    pages: {
      girlsPercent: read("girls-percentage.txt"),
      girlsCounts: read("girls-counts.txt"),
      girlsPercentContinuation: read("girls-continued.txt"),
    },
    sha256: null,
    importedAt: "synthetic-demo",
    pdfCreationDateRaw: null,
    physicalPdfPages: null,
    extractionLogDir: null,
  });
  if (!built.ok) {
    throw new Error(built.errors.map((item) => item.message).join(" "));
  }
  const dataset: EvidenceDataset = {
    ...built.dataset,
    statement: SYNTHETIC_DEMO_NOTICE,
    syntheticBanner: SYNTHETIC_DEMO_NOTICE,
    warnings: [
      issue({
        code: "synthetic_demo",
        severity: "warning",
        message: SYNTHETIC_DEMO_NOTICE,
      }),
      ...built.dataset.warnings,
    ],
  };
  const parsed = datasetSchema.safeParse(dataset);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((item) => item.message).join(" "));
  }
  if (parsed.data.mode !== "synthetic-test" || parsed.data.source.sha256 === OFFICIAL_SHA256) {
    throw new Error("The synthetic sample was refused.");
  }
  return parsed.data;
}
