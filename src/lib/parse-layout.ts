import {
  CONTINUED_INDEX_SEQUENCE,
  COUNT_INDEX_SEQUENCE,
  matchRegionName,
  PERCENTAGE_COLUMNS,
  PERCENTAGE_INDEX_SEQUENCE,
  type ManagementId,
} from "@/lib/catalog";
import { issue, type Issue } from "@/lib/issues";

export type ParsedToken = {
  raw: string;
  numeric: number | null;
  missing: boolean;
};

export type ParsedRow = {
  regionId: string;
  regionName: string;
  tokens: ParsedToken[];
};

export type ParsedPage = {
  tableId: string;
  continued: boolean;
  title: string;
  sourceFooter: string;
  printedPage: number | null;
  rows: ParsedRow[];
  errors: Issue[];
  warnings: Issue[];
};

const VALUE_PATTERN = "(?:NA|N\\/A|—|–|-?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)";

export function extractTokens(line: string): { name: string; rawValues: string[] } {
  const expression = new RegExp(VALUE_PATTERN, "g");
  const rawValues: string[] = [];
  let firstIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(line)) !== null) {
    if (firstIndex < 0) firstIndex = match.index;
    rawValues.push(match[0]);
  }
  const name = (firstIndex < 0 ? line : line.slice(0, firstIndex)).replace(/\s+/g, " ").trim();
  return { name, rawValues };
}

export function parseToken(raw: string, kind: "percentage" | "count"): ParsedToken | Issue {
  if (raw === "NA" || raw === "N/A" || raw === "—" || raw === "–") {
    if (kind === "count") {
      return issue({
        code: "count_missing_token",
        severity: "error",
        message: `Count tables in this layout are expected to print integers. Found missing token "${raw}".`,
      });
    }
    return { raw, numeric: null, missing: true };
  }
  const normalized = raw.replace(/,/g, "");
  if (kind === "count" && !/^\d+$/.test(normalized)) {
    return issue({
      code: "count_not_integer",
      severity: "error",
      message: `Count token "${raw}" is not an integer. The known count tables do not print decimals here.`,
    });
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return issue({
      code: "unreadable_token",
      severity: "error",
      message: `Could not read "${raw}" as a printed number or an explicit missing token.`,
    });
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return issue({
      code: "unreadable_token",
      severity: "error",
      message: `Could not read "${raw}" as a finite number.`,
    });
  }
  return { raw, numeric, missing: false };
}

function parenthesizedNumbers(line: string): number[] {
  return [...line.matchAll(/\(\s*(\d+)\s*\)/g)].map((match) => Number(match[1]));
}

function sequencesEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

type PageKind = "percentage" | "count" | "continued";

function splitKnownPage(text: string, kind: PageKind, tableId: string, physicalPage: number): {
  title: string;
  continued: boolean;
  sourceFooter: string | null;
  printedPage: number | null;
  bodyLines: string[];
  headerText: string;
  errors: Issue[];
} {
  const lines = text.split(/\r?\n/);
  const errors: Issue[] = [];
  const titleIndex = lines.findIndex((line) => /^\s*Table\s+[0-9]/.test(line));
  if (titleIndex < 0) {
    errors.push(
      issue({
        code: "title_missing",
        severity: "error",
        tableId,
        physicalPage,
        message: `No table title was found. This importer only reads the known copyable UDISE+ 2022-23 layout; it does not OCR scanned pages.`,
      }),
    );
    return {
      title: "",
      continued: false,
      sourceFooter: null,
      printedPage: null,
      bodyLines: [],
      headerText: "",
      errors,
    };
  }
  const title = lines[titleIndex].replace(/\s+/g, " ").trim();
  const continued = /\(continued\)/i.test(title);
  if (!/2022-23/.test(title)) {
    errors.push(
      issue({
        code: "title_year",
        severity: "error",
        tableId,
        physicalPage,
        message: `Table title does not say 2022-23: "${title}". Figures from another year are out of scope.`,
      }),
    );
  }
  const sourceIndex = lines.findIndex((line, index) => index > titleIndex && /^\s*Source\s*:/.test(line));
  if (sourceIndex < 0) {
    errors.push(
      issue({
        code: "missing_source_footer",
        severity: "error",
        tableId,
        physicalPage,
        message: "No source footer was found between the title and the end of the page.",
      }),
    );
  }
  const sourceFooter =
    sourceIndex >= 0 ? lines[sourceIndex].replace(/\s+/g, " ").trim().replace(/^Source\s*:\s*/i, "Source: ") : null;
  const searchEnd = sourceIndex >= 0 ? sourceIndex : lines.length;
  const indexLineIndex = lines.findIndex((line, index) => {
    if (index <= titleIndex || index >= searchEnd) return false;
    const numbers = parenthesizedNumbers(line);
    return numbers.includes(1) || numbers.includes(17);
  });
  if (indexLineIndex < 0) {
    errors.push(
      issue({
        code: "column_index_missing",
        severity: "error",
        tableId,
        physicalPage,
        message: "The printed column-index line, such as (1) (2) (3), was not found.",
      }),
    );
  } else {
    const numbers = parenthesizedNumbers(lines[indexLineIndex]);
    const expected =
      kind === "percentage"
        ? PERCENTAGE_INDEX_SEQUENCE
        : kind === "count"
          ? COUNT_INDEX_SEQUENCE
          : CONTINUED_INDEX_SEQUENCE;
    if (!sequencesEqual(numbers, expected)) {
      const code = kind === "percentage" && numbers.includes(8) ? "unexpected_column_8" : "column_index_sequence";
      errors.push(
        issue({
          code,
          severity: "error",
          tableId,
          physicalPage,
          message:
            code === "unexpected_column_8"
              ? `Table ${tableId} printed a column (8). The known 8.8/8.9/8.10 layout has no column (8); later columns must not be shifted.`
              : `Column index line was (${numbers.join(") (")}). Expected (${expected.join(") (")}).`,
        }),
      );
    }
  }
  let printedPage: number | null = null;
  if (sourceIndex >= 0) {
    const pageLine = lines.slice(sourceIndex + 1).map((line) => line.trim()).find((line) => line.length > 0);
    if (pageLine && /^\d+$/.test(pageLine)) {
      printedPage = Number(pageLine);
    }
    if (printedPage !== physicalPage) {
      errors.push(
        issue({
          code: "printed_page_mismatch",
          severity: "error",
          tableId,
          physicalPage,
          message: `Physical PDF page ${physicalPage} printed page number "${pageLine ?? ""}". The known layout keeps those numbers equal.`,
        }),
      );
    }
  }
  const bodyLines =
    indexLineIndex >= 0 && sourceIndex > indexLineIndex ? lines.slice(indexLineIndex + 1, sourceIndex) : [];
  const headerText =
    indexLineIndex > titleIndex
      ? lines.slice(titleIndex, indexLineIndex + 1).join(" ").replace(/\s+/g, " ")
      : title;
  return { title, continued, sourceFooter, printedPage, bodyLines, headerText, errors };
}

function parseBodyRows(
  bodyLines: string[],
  valueCount: number,
  kind: "percentage" | "count",
  tableId: string,
  physicalPage: number,
): { rows: ParsedRow[]; errors: Issue[] } {
  const errors: Issue[] = [];
  const rows: ParsedRow[] = [];
  let pendingName: string[] = [];
  const carry: { row: { name: string; tokens: ParsedToken[] } | null } = { row: null };

  const commit = (name: string, tokens: ParsedToken[]) => {
    const region = matchRegionName(name);
    if (!region) {
      carry.row = { name, tokens };
      return;
    }
    rows.push({ regionId: region.id, regionName: region.name, tokens });
    carry.row = null;
  };

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed || /^\d{1,3}$/.test(trimmed)) continue;
    const { name, rawValues } = extractTokens(line);
    if (rawValues.length === 0) {
      const pending = carry.row;
      if (pending && !matchRegionName(pending.name)) {
        pending.name = `${pending.name} ${trimmed}`.replace(/\s+/g, " ").trim();
        const region = matchRegionName(pending.name);
        if (region) {
          rows.push({ regionId: region.id, regionName: region.name, tokens: pending.tokens });
          carry.row = null;
        }
      } else {
        pendingName.push(trimmed);
      }
      continue;
    }
    const unresolved = carry.row;
    if (unresolved && !matchRegionName(unresolved.name)) {
      errors.push(
        issue({
          code: "wrapped_name",
          severity: "error",
          tableId,
          physicalPage,
          message: `Wrapped region name "${unresolved.name}" did not resolve to a printed geography.`,
        }),
      );
      carry.row = null;
    }
    if (rawValues.length !== valueCount) {
      errors.push(
        issue({
          code: "column_alignment",
          severity: "error",
          tableId,
          physicalPage,
          message: `Expected ${valueCount} values and found ${rawValues.length}. No missing column was invented. Line: "${trimmed.slice(0, 140)}".`,
        }),
      );
      pendingName = [];
      continue;
    }
    const tokens: ParsedToken[] = [];
    let tokenFailed = false;
    for (const raw of rawValues) {
      const parsed = parseToken(raw, kind === "count" ? "count" : "percentage");
      if ("code" in parsed) {
        errors.push({ ...parsed, tableId, physicalPage });
        tokenFailed = true;
        break;
      }
      if (kind !== "count" && parsed.numeric != null && (parsed.numeric < 0 || parsed.numeric > 100)) {
        errors.push(
          issue({
            code: "percentage_out_of_range",
            severity: "error",
            tableId,
            physicalPage,
            message: `Printed percentage "${raw}" is outside 0 to 100. It was not clipped.`,
          }),
        );
        tokenFailed = true;
        break;
      }
      if (kind === "count" && parsed.numeric != null && parsed.numeric < 0) {
        errors.push(
          issue({
            code: "negative_count",
            severity: "error",
            tableId,
            physicalPage,
            message: `Printed count "${raw}" is negative.`,
          }),
        );
        tokenFailed = true;
        break;
      }
      tokens.push(parsed);
    }
    if (tokenFailed) {
      pendingName = [];
      continue;
    }
    const combined = [...pendingName, name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    pendingName = [];
    commit(combined, tokens);
  }

  const trailing = carry.row;
  if (trailing && !matchRegionName(trailing.name)) {
    errors.push(
      issue({
        code: "wrapped_name",
        severity: "error",
        tableId,
        physicalPage,
        message: `Wrapped region name "${trailing.name}" was left unresolved at the end of the table.`,
      }),
    );
  } else if (trailing && matchRegionName(trailing.name)) {
    const region = matchRegionName(trailing.name);
    if (region) {
      rows.push({ regionId: region.id, regionName: region.name, tokens: trailing.tokens });
    }
  }
  if (pendingName.length > 0) {
    errors.push(
      issue({
        code: "wrapped_name",
        severity: "error",
        tableId,
        physicalPage,
        message: `Trailing text was not attached to a data row: "${pendingName.join(" ")}".`,
      }),
    );
  }

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.regionId)) {
      errors.push(
        issue({
          code: "duplicate_region",
          severity: "error",
          tableId,
          physicalPage,
          regionId: row.regionId,
          message: `${row.regionName} appears more than once. The duplicate was not merged.`,
        }),
      );
    }
    seen.add(row.regionId);
  }
  return { rows, errors };
}

function footerWarnings(tableId: string, physicalPage: number, sourceFooter: string): Issue[] {
  const warnings: Issue[] = [];
  const normalized = sourceFooter.replace(/\s+/g, " ").trim();
  if (tableId === "7.4" && physicalPage === 126 && normalized === "Source: UDISE+ 2020-2") {
    warnings.push(
      issue({
        code: "source_label_inconsistency",
        severity: "warning",
        tableId,
        physicalPage,
        indicatorId: "functional_girls_toilet_pct",
        message:
          "Table 7.4 on physical page 126 prints the footer \"Source: UDISE+ 2020-2\" while its title says 2022-23 and table 8.8 prints \"Source: UDISE+ 2022-23\". The footer was not rewritten.",
      }),
    );
  } else if (!/^Source: UDISE\+ 2022-23$/.test(normalized)) {
    warnings.push(
      issue({
        code: "source_footer_unexpected",
        severity: "warning",
        tableId,
        physicalPage,
        message: `Source footer was preserved as "${normalized}" rather than normalized to "Source: UDISE+ 2022-23".`,
      }),
    );
  }
  return warnings;
}

function assertTopic(headerText: string, topic: "girls" | "boys" | "cwsn", tableId: string, physicalPage: number): Issue[] {
  const errors: Issue[] = [];
  const haystack = headerText.toLowerCase();
  const ok =
    topic === "girls"
      ? /girl/.test(haystack)
      : topic === "boys"
        ? /boy/.test(haystack)
        : /cwsn/.test(haystack);
  if (!ok) {
    errors.push(
      issue({
        code: "topic_mismatch",
        severity: "error",
        tableId,
        physicalPage,
        message: `The page title does not match the expected ${topic} table.`,
      }),
    );
  }
  if (tableId.startsWith("8.") && !/\bKVS\b/.test(headerText)) {
    errors.push(
      issue({
        code: "management_header_missing",
        severity: "error",
        tableId,
        physicalPage,
        message: "The known percentage-table header prints KVS. It was not found, so column alignment was not assumed.",
      }),
    );
  }
  if (tableId.startsWith("8.") && !/\bNVS\b/.test(headerText)) {
    errors.push(
      issue({
        code: "management_header_missing",
        severity: "error",
        tableId,
        physicalPage,
        message: "The known percentage-table header prints NVS. It was not found, so column alignment was not assumed.",
      }),
    );
  }
  return errors;
}

export function parseManagementPercentagePage(
  text: string,
  spec: { tableId: "8.8" | "8.9" | "8.10"; physicalPage: number; topic: "girls" | "boys" | "cwsn" },
): ParsedPage {
  const split = splitKnownPage(text, "percentage", spec.tableId, spec.physicalPage);
  const errors = [...split.errors];
  if (split.continued) {
    errors.push(
      issue({
        code: "unexpected_continuation",
        severity: "error",
        tableId: spec.tableId,
        physicalPage: spec.physicalPage,
        message: "Tables 8.8, 8.9, and 8.10 are not continuation pages.",
      }),
    );
  }
  if (!new RegExp(`Table\\s+${spec.tableId.replace(".", "\\.")}`).test(split.title)) {
    errors.push(
      issue({
        code: "table_id_mismatch",
        severity: "error",
        tableId: spec.tableId,
        physicalPage: spec.physicalPage,
        message: `Expected title to name table ${spec.tableId}. Found "${split.title}".`,
      }),
    );
  }
  errors.push(...assertTopic(split.headerText, spec.topic, spec.tableId, spec.physicalPage));
  const body = parseBodyRows(split.bodyLines, PERCENTAGE_COLUMNS.length, "percentage", spec.tableId, spec.physicalPage);
  errors.push(...body.errors);
  const warnings = split.sourceFooter ? footerWarnings(spec.tableId, spec.physicalPage, split.sourceFooter) : [];
  return {
    tableId: spec.tableId,
    continued: false,
    title: split.title,
    sourceFooter: split.sourceFooter ?? "",
    printedPage: split.printedPage,
    rows: errors.some((item) => item.code === "column_index_sequence" || item.code === "unexpected_column_8")
      ? []
      : body.rows,
    errors,
    warnings,
  };
}

export function parseCountPage(
  text: string,
  spec: { tableId: "7.3" | "7.4" | "7.12"; physicalPage: number; topic: "girls" | "boys" | "cwsn" },
): ParsedPage {
  const split = splitKnownPage(text, "count", spec.tableId, spec.physicalPage);
  const errors = [...split.errors];
  if (split.continued) {
    errors.push(
      issue({
        code: "unexpected_continuation",
        severity: "error",
        tableId: spec.tableId,
        physicalPage: spec.physicalPage,
        message: `Expected the count table ${spec.tableId}, not its percentage continuation.`,
      }),
    );
  }
  if (!new RegExp(`Table\\s+${spec.tableId.replace(".", "\\.")}`).test(split.title)) {
    errors.push(
      issue({
        code: "table_id_mismatch",
        severity: "error",
        tableId: spec.tableId,
        physicalPage: spec.physicalPage,
        message: `Expected title to name table ${spec.tableId}. Found "${split.title}".`,
      }),
    );
  }
  errors.push(...assertTopic(split.headerText, spec.topic, spec.tableId, spec.physicalPage));
  const body = parseBodyRows(split.bodyLines, 15, "count", spec.tableId, spec.physicalPage);
  errors.push(...body.errors);
  const warnings = split.sourceFooter ? footerWarnings(spec.tableId, spec.physicalPage, split.sourceFooter) : [];
  return {
    tableId: spec.tableId,
    continued: false,
    title: split.title,
    sourceFooter: split.sourceFooter ?? "",
    printedPage: split.printedPage,
    rows: body.rows,
    errors,
    warnings,
  };
}

export function parseContinuedPercentagePage(
  text: string,
  spec: { tableId: "7.3" | "7.4" | "7.12"; physicalPage: number; topic: "girls" | "boys" | "cwsn" },
): ParsedPage {
  const split = splitKnownPage(text, "continued", spec.tableId, spec.physicalPage);
  const errors = [...split.errors];
  if (!split.continued) {
    errors.push(
      issue({
        code: "continuation_missing",
        severity: "error",
        tableId: spec.tableId,
        physicalPage: spec.physicalPage,
        message: `Expected the percentage continuation of table ${spec.tableId}.`,
      }),
    );
  }
  errors.push(...assertTopic(split.headerText, spec.topic, spec.tableId, spec.physicalPage));
  const body = parseBodyRows(split.bodyLines, 10, "percentage", spec.tableId, spec.physicalPage);
  errors.push(...body.errors);
  const warnings = split.sourceFooter ? footerWarnings(spec.tableId, spec.physicalPage, split.sourceFooter) : [];
  return {
    tableId: spec.tableId,
    continued: true,
    title: split.title,
    sourceFooter: split.sourceFooter ?? "",
    printedPage: split.printedPage,
    rows: body.rows,
    errors,
    warnings,
  };
}

export function managementColumn(index: number): { managementId: ManagementId; sourceColumn: number } {
  const column = PERCENTAGE_COLUMNS[index];
  if (!column) {
    throw new Error(`Percentage column index ${index} is outside the known 9-value layout.`);
  }
  return column;
}
