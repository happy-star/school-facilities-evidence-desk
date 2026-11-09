import { managementById, regionById } from "@/lib/catalog";
import type { EvidenceCell, EvidenceDataset } from "@/lib/schema";

const COLUMNS = [
  "dataset_id",
  "mode",
  "statistical_year",
  "statement",
  "source_url",
  "source_sha256",
  "source_license",
  "redistribution",
  "indicator_id",
  "region_name",
  "region_role",
  "management_label",
  "source_column",
  "printed_value",
  "raw_token",
  "unit",
  "interpretation",
  "numerator_raw",
  "denominator_raw",
  "numerator_column",
  "denominator_column",
  "percentage_table",
  "percentage_physical_page",
  "percentage_source_footer",
  "count_table",
  "count_physical_page",
  "count_source_footer",
  "warnings",
  "exported_at",
  "synthetic_banner",
  "official_statistics",
] as const;

export function cellsToCsv(dataset: EvidenceDataset, cells: EvidenceCell[], exportedAt: string): string {
  const lines = [COLUMNS.join(",")];
  for (const cell of cells) {
    const region = dataset.regions.find((item) => item.id === cell.regionId) ?? regionById(cell.regionId);
    const management = managementById(cell.managementId);
    const row = [
      dataset.datasetId,
      dataset.mode,
      dataset.statisticalYear,
      dataset.statement,
      dataset.source.url,
      dataset.source.sha256,
      dataset.source.license,
      dataset.source.redistribution,
      cell.indicatorId,
      region?.name ?? cell.regionId,
      region?.role ?? "",
      management?.label ?? cell.managementId,
      cell.sourceColumn,
      cell.printed,
      cell.rawToken,
      "percentage of schools",
      cell.interpretation,
      cell.counts?.numeratorRaw ?? "",
      cell.counts?.denominatorRaw ?? "",
      cell.counts?.numeratorColumn ?? "",
      cell.counts?.denominatorColumn ?? "",
      cell.percentageTableId,
      cell.percentagePhysicalPage,
      cell.percentageSourceFooter,
      cell.counts?.countTableId ?? "",
      cell.counts?.countPhysicalPage ?? "",
      cell.counts?.countSourceFooter ?? "",
      cell.warnings.map((warning) => warning.code).join("|"),
      exportedAt,
      dataset.syntheticBanner ?? "",
      dataset.mode === "government-data" ? "yes" : "no",
    ];
    lines.push(row.map(csvEscape).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function cellsToJson(dataset: EvidenceDataset, cells: EvidenceCell[], exportedAt: string): string {
  return JSON.stringify(
    {
      provenance: {
        datasetId: dataset.datasetId,
        mode: dataset.mode,
        statisticalYear: dataset.statisticalYear,
        statement: dataset.statement,
        syntheticBanner: dataset.syntheticBanner,
        sampleNotice: dataset.syntheticBanner,
        officialStatistics: dataset.mode === "government-data",
        source: dataset.source,
        parserVersion: dataset.parserVersion,
        importedAt: dataset.importedAt,
        exportedAt,
        unit: "percentage of schools",
        note: "Printed values are the booklet text. Undefined cells keep a raw zero when the denominator is zero. This file is not a causal analysis.",
      },
      rows: cells.map((cell) => ({
        indicatorId: cell.indicatorId,
        regionId: cell.regionId,
        regionName: dataset.regions.find((region) => region.id === cell.regionId)?.name ?? null,
        managementId: cell.managementId,
        sourceColumn: cell.sourceColumn,
        printed: cell.printed,
        rawToken: cell.rawToken,
        interpretation: cell.interpretation,
        counts: cell.counts,
        percentageTableId: cell.percentageTableId,
        percentagePhysicalPage: cell.percentagePhysicalPage,
        percentageSourceFooter: cell.percentageSourceFooter,
        warnings: cell.warnings,
      })),
    },
    null,
    2,
  );
}

/** Spreadsheet formula triggers. A leading apostrophe keeps the cell as text. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function csvEscape(value: string | number | null): string {
  let text = value == null ? "" : String(value);
  const formula = FORMULA_PREFIX.test(text);
  if (formula) text = `'${text}`;
  if (formula || /[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
