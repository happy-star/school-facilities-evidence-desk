import { z } from "zod";

import { INDICATOR_IDS, MANAGEMENT_IDS } from "@/lib/catalog";
import { DATASET_ID, KNOWN_PAGES, OFFICIAL_SHA256, PARSER_VERSION, STATISTICAL_YEAR } from "@/lib/official-source";

export const issueSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string().min(1),
  tableId: z.string().optional(),
  physicalPage: z.number().int().positive().optional(),
  regionId: z.string().optional(),
  managementId: z.string().optional(),
  indicatorId: z.string().optional(),
});

export const countEvidenceSchema = z.object({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  numeratorColumn: z.number().int(),
  denominatorColumn: z.number().int(),
  numeratorRaw: z.string(),
  denominatorRaw: z.string(),
  countTableId: z.string(),
  countPhysicalPage: z.number().int(),
  countSourceFooter: z.string(),
});

export const corroborationSchema = z.object({
  tableId: z.string(),
  physicalPage: z.number().int(),
  sourceColumn: z.number().int(),
  raw: z.string(),
  matchesPrinted: z.boolean(),
});

export const cellSchema = z.object({
  indicatorId: z.enum(INDICATOR_IDS),
  regionId: z.string(),
  managementId: z.enum(MANAGEMENT_IDS),
  rawToken: z.string(),
  printed: z.string().nullable(),
  numeric: z.number().nullable(),
  interpretation: z.enum([
    "measured_percentage",
    "undefined_denominator_zero",
    "zero_denominator_not_available",
    "missing",
  ]),
  sourceColumn: z.number().int(),
  percentageTableId: z.string(),
  percentagePhysicalPage: z.number().int(),
  percentageSourceFooter: z.string(),
  counts: countEvidenceSchema.nullable(),
  corroboration: corroborationSchema.nullable(),
  roundedFromCounts: z.string().nullable(),
  warnings: z.array(issueSchema),
});

export const datasetSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["government-data", "synthetic-test"]),
  parserVersion: z.literal(PARSER_VERSION),
  datasetId: z.literal(DATASET_ID),
  statisticalYear: z.literal(STATISTICAL_YEAR),
  statement: z.string().min(1),
  syntheticBanner: z.string().nullable(),
  source: z.object({
    title: z.string(),
    url: z.string(),
    sha256: z.string(),
    physicalPdfPages: z.number().int().nullable(),
    pdfCreationDateRaw: z.string().nullable(),
    redistribution: z.literal("not-confirmed"),
    license: z.literal("unknown"),
  }),
  importedAt: z.string(),
  extractionLogDir: z.string().nullable(),
  regions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.enum(["aggregate", "state_ut"]),
      reportOrder: z.number().int(),
    }),
  ),
  tables: z.array(
    z.object({
      tableId: z.string(),
      physicalPage: z.number().int(),
      title: z.string(),
      sourceFooter: z.string(),
      role: z.enum(["percentage", "counts", "percentage-continuation"]),
    }),
  ),
  cells: z.array(cellSchema),
  warnings: z.array(issueSchema),
});

export type EvidenceDataset = z.infer<typeof datasetSchema>;
export type EvidenceCell = z.infer<typeof cellSchema>;
export type EvidenceIssue = z.infer<typeof issueSchema>;

export function parseDatasetJson(value: unknown): { ok: true; dataset: EvidenceDataset } | { ok: false; message: string } {
  const parsed = datasetSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((item) => `${item.path.join(".")}: ${item.message}`).join("; ") };
  }
  return { ok: true, dataset: parsed.data };
}

/** Government-data mode is allowed only for the hashed official booklet. */
export function acceptGovernmentDataset(value: unknown): { ok: true; dataset: EvidenceDataset } | { ok: false; message: string } {
  const parsed = parseDatasetJson(value);
  if (!parsed.ok) return parsed;
  if (parsed.dataset.mode !== "government-data") {
    return { ok: false, message: "This file is not government-data mode. Synthetic fixtures cannot drive the desk." };
  }
  if (parsed.dataset.syntheticBanner) {
    return { ok: false, message: "A synthetic banner was present on a file marked government-data." };
  }
  if (parsed.dataset.source.sha256 !== OFFICIAL_SHA256) {
    return { ok: false, message: "SHA-256 does not match the recorded official booklet. Official charts were not loaded." };
  }
  if (parsed.dataset.statisticalYear !== "2022-23") {
    return { ok: false, message: "Statistical year is not 2022-23." };
  }
  const integrity = governmentCellIntegrity(parsed.dataset);
  if (integrity) return { ok: false, message: integrity };
  return parsed;
}

const PERCENTAGE_PAGE: Record<string, number> = {
  "8.8": KNOWN_PAGES.girlsPercent,
  "8.9": KNOWN_PAGES.boysPercent,
  "8.10": KNOWN_PAGES.cwsnPercent,
};

/** Reject a stored file whose cells contradict the known tables or a zero denominator. */
export function governmentCellIntegrity(dataset: EvidenceDataset): string | null {
  for (const cell of dataset.cells) {
    if (cell.sourceColumn === 8) {
      return "A stored cell uses column 8. Tables 8.8, 8.9, and 8.10 have no such column.";
    }
    const expectedPage = PERCENTAGE_PAGE[cell.percentageTableId];
    if (expectedPage == null || cell.percentagePhysicalPage !== expectedPage) {
      return "A stored cell cites a table or page outside tables 8.8, 8.9, and 8.10.";
    }
    if (cell.percentageSourceFooter !== "Source: UDISE+ 2022-23") {
      return "A stored percentage cell does not cite the recorded 2022-23 source footer.";
    }
    if (cell.counts?.denominator === 0 && cell.interpretation === "measured_percentage") {
      return "A stored cell with denominator 0 is marked as a measured percentage.";
    }
    if (cell.interpretation === "undefined_denominator_zero" && cell.counts != null && cell.counts.denominator !== 0) {
      return "A stored undefined cell has a non-zero denominator.";
    }
    if (cell.interpretation === "missing" && cell.printed != null) {
      return "A stored missing cell still carries a printed percentage.";
    }
    if (
      cell.interpretation === "measured_percentage" &&
      (cell.printed == null || cell.numeric == null || cell.numeric < 0 || cell.numeric > 100)
    ) {
      return "A stored measured cell has no printed percentage in the range 0 to 100.";
    }
  }
  return null;
}
