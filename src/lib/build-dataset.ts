import {
  BROAD_COUNT_FIELDS,
  CONTINUED_FUNCTIONAL_FIELDS,
  INDICATORS,
  PERCENTAGE_COLUMNS,
  REGIONS,
  type IndicatorDef,
  type KnownPageKey,
} from "@/lib/catalog";
import { issue, type Issue } from "@/lib/issues";
import {
  parseContinuedPercentagePage,
  parseCountPage,
  parseManagementPercentagePage,
  type ParsedPage,
  type ParsedToken,
} from "@/lib/parse-layout";
import { decimalPlaces, roundPercentageFromCounts } from "@/lib/rounding";
import { datasetSchema, type EvidenceCell, type EvidenceDataset } from "@/lib/schema";
import {
  DATASET_ID,
  HISTORICAL_STATEMENT,
  OFFICIAL_PDF_PAGE_COUNT,
  OFFICIAL_SHA256,
  OFFICIAL_SOURCE_URL,
  PARSER_VERSION,
  STATISTICAL_YEAR,
} from "@/lib/official-source";

export type PageBundle = Partial<Record<KnownPageKey, string>>;

export type BuildInput = {
  mode: "government-data" | "synthetic-test";
  pages: PageBundle;
  sha256: string | null;
  importedAt: string;
  pdfCreationDateRaw: string | null;
  physicalPdfPages: number | null;
  extractionLogDir: string | null;
};

export type BuildResult =
  | { ok: true; dataset: EvidenceDataset }
  | { ok: false; errors: Issue[] };

const METHODOLOGY_NOTES: Issue[] = [
  issue({
    code: "historical_year",
    severity: "info",
    message: HISTORICAL_STATEMENT,
  }),
  issue({
    code: "india_is_aggregate",
    severity: "info",
    message: "India is the national aggregate row. It is not a state or UT and is not ranked among them.",
  }),
  issue({
    code: "column_8_absent",
    severity: "info",
    message:
      "Tables 8.8, 8.9, and 8.10 have no printed column (8). Government aided stays column (9), private unaided recognized stays (10), and Others stays (11).",
  }),
  issue({
    code: "government_total_not_additive",
    severity: "info",
    message:
      "Government total is the parent aggregate. It is not added to KVS, NVS, other central government, or state government, and those components are not used to replace the printed total.",
  }),
  issue({
    code: "different_denominators",
    severity: "info",
    message:
      "Girls, boys, and CWSN-friendly percentages use different school populations. This desk does not subtract them or treat the gap as a count of missing facilities.",
  }),
  issue({
    code: "printed_precision",
    severity: "info",
    message:
      "Printed integers stay integers. A neighbouring cell with a decimal is not a reason to invent extra precision.",
  }),
  issue({
    code: "zero_reading",
    severity: "info",
    message:
      "A printed 0 is undefined when the detailed count table shows denominator 0. The raw 0 is kept. A printed 0 with no count breakout is not relabelled as a measured zero or as missing.",
  }),
  issue({
    code: "no_causal_claim",
    severity: "info",
    message:
      "Comparisons hold management, definition, and year fixed. They are descriptive. They are not a school-level diagnosis, a causal impact, or a 2026 condition.",
  }),
  issue({
    code: "kvs_nvs_unexpanded",
    severity: "info",
    message: "KVS and NVS are shown as printed. Their abbreviations are not expanded, because the booklet definitions were not verified in this desk.",
  }),
  issue({
    code: "redistribution_unknown",
    severity: "info",
    message:
      "No reuse licence was established for the UDISE+ booklet. Code in this project is MIT. That licence does not cover the booklet or an extract of it. This file is an internal validation extract.",
  }),
];

function fail(errors: Issue[]): BuildResult {
  return { ok: false, errors };
}

export function buildDataset(input: BuildInput): BuildResult {
  const errors: Issue[] = [];
  if (input.mode === "government-data") {
    if (input.sha256 !== OFFICIAL_SHA256) {
      errors.push(
        issue({
          code: "hash_mismatch",
          severity: "error",
          message:
            "The file SHA-256 does not match the recorded official UDISE+ 2022-23 booklet. Import stopped so a chart cannot be labelled official.",
        }),
      );
    }
    if (input.physicalPdfPages != null && input.physicalPdfPages !== OFFICIAL_PDF_PAGE_COUNT) {
      errors.push(
        issue({
          code: "unexpected_page_count",
          severity: "error",
          message: `pdfinfo reported ${input.physicalPdfPages} pages. The recorded booklet has ${OFFICIAL_PDF_PAGE_COUNT}.`,
        }),
      );
    }
    for (const indicator of INDICATORS) {
      for (const key of [indicator.percentagePageKey, indicator.countPageKey, indicator.continuationPageKey] as const) {
        if (!input.pages[key]) {
          errors.push(
            issue({
              code: "page_missing",
              severity: "error",
              message: `The known layout requires PDF text for ${key}.`,
            }),
          );
        }
      }
    }
  } else if (input.sha256 === OFFICIAL_SHA256) {
    errors.push(
      issue({
        code: "synthetic_used_official_hash",
        severity: "error",
        message: "Synthetic mode refused the official file hash so test fixtures cannot be stored as government data.",
      }),
    );
  }
  if (errors.length > 0 && input.mode === "government-data") {
    return fail(errors);
  }
  if (errors.some((item) => item.code === "synthetic_used_official_hash")) {
    return fail(errors);
  }

  const warnings: Issue[] = [...METHODOLOGY_NOTES];
  if (input.mode === "synthetic-test") {
    warnings.unshift(
      issue({
        code: "synthetic_fixture",
        severity: "warning",
        message:
          "SYNTHETIC TEST DATA. These cells are invented for parser tests. They are not UDISE+ figures and must not be read as government statistics.",
      }),
    );
  }
  if (input.pdfCreationDateRaw) {
    warnings.push(
      issue({
        code: "pdf_metadata_not_statistical_year",
        severity: "info",
        message: `PDF CreationDate is "${input.pdfCreationDateRaw}". That timestamp is file metadata, not the statistical year 2022-23.`,
      }),
    );
  }

  const cells: EvidenceCell[] = [];
  const tables: EvidenceDataset["tables"] = [];
  const regionIds = new Set<string>();

  for (const indicator of INDICATORS) {
    const percentageText = input.pages[indicator.percentagePageKey];
    if (!percentageText) continue;
    const percentage = parseManagementPercentagePage(percentageText, {
      tableId: indicator.tableId,
      physicalPage: indicator.physicalPage,
      topic: indicator.topic,
    });
    const countsText = input.pages[indicator.countPageKey];
    const counts = countsText
      ? parseCountPage(countsText, {
          tableId: indicator.countTableId,
          physicalPage: indicator.countPhysicalPage,
          topic: indicator.topic,
        })
      : null;
    const continuationText = input.pages[indicator.continuationPageKey];
    const continuation = continuationText
      ? parseContinuedPercentagePage(continuationText, {
          tableId: indicator.countTableId,
          physicalPage: indicator.countContinuationPage,
          topic: indicator.topic,
        })
      : null;

    errors.push(...percentage.errors);
    if (counts) errors.push(...counts.errors);
    if (continuation) errors.push(...continuation.errors);
    warnings.push(...percentage.warnings, ...(counts?.warnings ?? []), ...(continuation?.warnings ?? []));

    if (input.mode === "government-data" && (!counts || !continuation)) {
      errors.push(
        issue({
          code: "denominator_page_missing",
          severity: "error",
          indicatorId: indicator.id,
          message: `${indicator.label} needs count table ${indicator.countTableId} and its percentage continuation before any official cell is released.`,
        }),
      );
    }

    tables.push({
      tableId: percentage.tableId,
      physicalPage: indicator.physicalPage,
      title: percentage.title,
      sourceFooter: percentage.sourceFooter,
      role: "percentage",
    });
    if (counts) {
      tables.push({
        tableId: counts.tableId,
        physicalPage: indicator.countPhysicalPage,
        title: counts.title,
        sourceFooter: counts.sourceFooter,
        role: "counts",
      });
    }
    if (continuation) {
      tables.push({
        tableId: continuation.tableId,
        physicalPage: indicator.countContinuationPage,
        title: continuation.title,
        sourceFooter: continuation.sourceFooter,
        role: "percentage-continuation",
      });
    }

    if (percentage.errors.length > 0) continue;

    const built = cellsFromIndicator(indicator, percentage, counts, continuation);
    errors.push(...built.errors);
    for (const cell of built.cells) {
      regionIds.add(cell.regionId);
      cells.push(cell);
    }
  }

  if (input.mode === "government-data") {
    for (const region of REGIONS) {
      if (!regionIds.has(region.id)) {
        errors.push(
          issue({
            code: "missing_region",
            severity: "error",
            regionId: region.id,
            message: `${region.name} was not found in every required table. The missing row was not imputed.`,
          }),
        );
      }
    }
    const expectedCells = REGIONS.length * PERCENTAGE_COLUMNS.length * INDICATORS.length;
    if (cells.length !== expectedCells) {
      errors.push(
        issue({
          code: "cell_count",
          severity: "error",
          message: `Expected ${expectedCells} official cells and built ${cells.length}. Incomplete extracts are not saved.`,
        }),
      );
    }
  }

  if (cells.length === 0) {
    errors.push(
      issue({
        code: "no_cells",
        severity: "error",
        message: "No table cells were read. Nothing was invented to fill the gap.",
      }),
    );
  }

  const blocking = errors.filter((item) => item.severity === "error");
  if (blocking.length > 0) return fail(blocking);

  const regions = REGIONS.filter((region) => regionIds.has(region.id)).map((region) => ({
    id: region.id,
    name: region.name,
    role: region.role,
    reportOrder: region.reportOrder,
  }));

  const dataset: EvidenceDataset = {
    schemaVersion: 1,
    mode: input.mode,
    parserVersion: PARSER_VERSION,
    datasetId: DATASET_ID,
    statisticalYear: STATISTICAL_YEAR,
    statement:
      input.mode === "government-data"
        ? HISTORICAL_STATEMENT
        : "SYNTHETIC TEST DATA. Not a UDISE+ extract and not for the evidence desk's government-data mode.",
    syntheticBanner:
      input.mode === "synthetic-test"
        ? "SYNTHETIC TEST DATA — not UDISE+ and not a government statistic."
        : null,
    source: {
      title:
        input.mode === "government-data"
          ? "UDISE+ 2022-23 booklet, tables 8.8, 8.9, and 8.10, with denominator counts from tables 7.3, 7.4, and 7.12"
          : "Synthetic layout fixture imitating the known UDISE+ 2022-23 table geometry",
      url: input.mode === "government-data" ? OFFICIAL_SOURCE_URL : "synthetic://not-a-source",
      sha256: input.mode === "government-data" ? OFFICIAL_SHA256 : "synthetic-not-official",
      physicalPdfPages: input.physicalPdfPages,
      pdfCreationDateRaw: input.pdfCreationDateRaw,
      redistribution: "not-confirmed",
      license: "unknown",
    },
    importedAt: input.importedAt,
    extractionLogDir: input.extractionLogDir,
    regions,
    tables,
    cells,
    warnings,
  };

  const validated = datasetSchema.safeParse(dataset);
  if (!validated.success) {
    return fail([
      issue({
        code: "schema_invalid",
        severity: "error",
        message: validated.error.issues.map((item) => `${item.path.join(".")}: ${item.message}`).join("; "),
      }),
    ]);
  }
  return { ok: true, dataset: validated.data };
}

function cellsFromIndicator(
  indicator: IndicatorDef,
  percentage: ParsedPage,
  counts: ParsedPage | null,
  continuation: ParsedPage | null,
): { cells: EvidenceCell[]; errors: Issue[] } {
  const errors: Issue[] = [];
  const cells: EvidenceCell[] = [];
  const countByRegion = new Map((counts?.rows ?? []).map((row) => [row.regionId, row]));
  const continuedByRegion = new Map((continuation?.rows ?? []).map((row) => [row.regionId, row]));

  if (counts && counts.errors.length === 0) {
    for (const row of percentage.rows) {
      if (!countByRegion.has(row.regionId)) {
        errors.push(
          issue({
            code: "count_row_missing",
            severity: "error",
            tableId: counts.tableId,
            regionId: row.regionId,
            indicatorId: indicator.id,
            message: `${row.regionName} is in table ${percentage.tableId} and missing from count table ${counts.tableId}. Denominators were not guessed.`,
          }),
        );
      }
    }
  }

  for (const row of percentage.rows) {
    if (row.tokens.length !== PERCENTAGE_COLUMNS.length) {
      errors.push(
        issue({
          code: "column_alignment",
          severity: "error",
          tableId: percentage.tableId,
          regionId: row.regionId,
          message: `${row.regionName} did not have ${PERCENTAGE_COLUMNS.length} percentage values.`,
        }),
      );
      continue;
    }
    const countRow = countByRegion.get(row.regionId);
    const continuedRow = continuedByRegion.get(row.regionId);
    PERCENTAGE_COLUMNS.forEach((column, index) => {
      const token = row.tokens[index];
      const cellWarnings: Issue[] = [];
      const countField = BROAD_COUNT_FIELDS.find((field) => field.managementId === column.managementId);
      let countEvidence: EvidenceCell["counts"] = null;
      if (column.broad && countRow && countField && counts && counts.errors.length === 0) {
        const denominatorToken = countRow.tokens[countField.denominatorIndex];
        const numeratorToken = countRow.tokens[countField.numeratorIndex];
        if (!denominatorToken || !numeratorToken || denominatorToken.numeric == null || numeratorToken.numeric == null) {
          errors.push(
            issue({
              code: "count_token_missing",
              severity: "error",
              regionId: row.regionId,
              managementId: column.managementId,
              message: `Count tokens for ${row.regionName} / ${column.managementId} were not usable.`,
            }),
          );
        } else {
          countEvidence = {
            numerator: numeratorToken.numeric,
            denominator: denominatorToken.numeric,
            numeratorColumn: countField.numeratorColumn,
            denominatorColumn: countField.denominatorColumn,
            numeratorRaw: numeratorToken.raw,
            denominatorRaw: denominatorToken.raw,
            countTableId: counts.tableId,
            countPhysicalPage: indicator.countPhysicalPage,
            countSourceFooter: counts.sourceFooter,
          };
        }
      }

      const interpretation = interpretToken(token, column.broad, countEvidence);
      if (interpretation === "undefined_denominator_zero" && token.numeric !== 0 && !token.missing) {
        cellWarnings.push(
          issue({
            code: "nonzero_printed_with_zero_denominator",
            severity: "warning",
            regionId: row.regionId,
            managementId: column.managementId,
            indicatorId: indicator.id,
            tableId: percentage.tableId,
            message: `${row.regionName} prints ${token.raw} where the count table denominator is 0. The percentage is undefined and the printed token is unchanged.`,
          }),
        );
      }
      if (interpretation === "undefined_denominator_zero") {
        cellWarnings.push(
          issue({
            code: "undefined_denominator_zero",
            severity: "warning",
            regionId: row.regionId,
            managementId: column.managementId,
            indicatorId: indicator.id,
            tableId: indicator.countTableId,
            physicalPage: indicator.countPhysicalPage,
            message: `${row.regionName}, ${column.managementId}: printed ${token.raw}, denominator 0. Undefined. Raw 0 is preserved and is not charted as 0%.`,
          }),
        );
      }
      if (interpretation === "zero_denominator_not_available") {
        cellWarnings.push(
          issue({
            code: "zero_denominator_not_available",
            severity: "info",
            regionId: row.regionId,
            managementId: column.managementId,
            indicatorId: indicator.id,
            message: `${row.regionName} prints 0 for a management the detailed count table does not break out. It is not confirmed as a measured 0% and it is not treated as missing.`,
          }),
        );
      }
      if (interpretation === "missing") {
        cellWarnings.push(
          issue({
            code: "missing_not_imputed",
            severity: "warning",
            regionId: row.regionId,
            managementId: column.managementId,
            indicatorId: indicator.id,
            message: `${row.regionName} has no printed percentage in this cell (${token.raw}). It stays missing.`,
          }),
        );
      }

      let roundedFromCounts: string | null = null;
      if (
        interpretation === "measured_percentage" &&
        countEvidence &&
        countEvidence.denominator > 0 &&
        !token.missing &&
        token.numeric != null
      ) {
        const places = decimalPlaces(token.raw.replace(/,/g, ""));
        if (places != null) {
          roundedFromCounts = roundPercentageFromCounts(countEvidence.numerator, countEvidence.denominator, places);
          if (roundedFromCounts && roundedFromCounts !== token.raw.replace(/,/g, "")) {
            cellWarnings.push(
              issue({
                code: "printed_differs_from_rounded_count",
                severity: "warning",
                regionId: row.regionId,
                managementId: column.managementId,
                indicatorId: indicator.id,
                message: `Printed ${token.raw} differs from ${roundedFromCounts}, the half-up rounding of the published counts at the printed precision. The printed value is kept.`,
              }),
            );
          }
        }
      }

      let corroboration: EvidenceCell["corroboration"] = null;
      const continuedField = CONTINUED_FUNCTIONAL_FIELDS.find((field) => field.managementId === column.managementId);
      if (column.broad && continuedRow && continuedField && continuation && continuation.errors.length === 0) {
        const continuedToken = continuedRow.tokens[continuedField.valueIndex];
        if (continuedToken) {
          const matchesPrinted = !token.missing && continuedToken.raw === token.raw;
          corroboration = {
            tableId: continuation.tableId,
            physicalPage: indicator.countContinuationPage,
            sourceColumn: continuedField.sourceColumn,
            raw: continuedToken.raw,
            matchesPrinted,
          };
          if (token.missing) {
            cellWarnings.push(
              issue({
                code: "corroboration_not_used_to_fill_missing",
                severity: "warning",
                regionId: row.regionId,
                managementId: column.managementId,
                indicatorId: indicator.id,
                message: `The continuation page prints ${continuedToken.raw}, but the main table cell is missing. The missing cell was not filled.`,
              }),
            );
          } else if (!matchesPrinted) {
            cellWarnings.push(
              issue({
                code: "corroboration_mismatch",
                severity: "warning",
                regionId: row.regionId,
                managementId: column.managementId,
                indicatorId: indicator.id,
                message: `Table ${percentage.tableId} prints ${token.raw}; the continuation of table ${continuation.tableId} prints ${continuedToken.raw}. The main-table value is kept.`,
              }),
            );
          }
        }
      }

      cells.push({
        indicatorId: indicator.id,
        regionId: row.regionId,
        managementId: column.managementId,
        rawToken: token.raw,
        printed: token.missing ? null : token.raw,
        numeric: token.missing ? null : token.numeric,
        interpretation,
        sourceColumn: column.sourceColumn,
        percentageTableId: percentage.tableId,
        percentagePhysicalPage: indicator.physicalPage,
        percentageSourceFooter: percentage.sourceFooter,
        counts: countEvidence,
        corroboration,
        roundedFromCounts,
        warnings: cellWarnings,
      });
    });
  }

  return { cells, errors };
}

function interpretToken(
  token: ParsedToken,
  broad: boolean,
  counts: EvidenceCell["counts"],
): EvidenceCell["interpretation"] {
  if (token.missing) return "missing";
  if (broad && counts && counts.denominator === 0) return "undefined_denominator_zero";
  if (token.numeric === 0 && (!broad || !counts)) return "zero_denominator_not_available";
  return "measured_percentage";
}
