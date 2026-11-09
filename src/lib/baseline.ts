import {
  REGIONS,
  indicatorById,
  managementById,
  type IndicatorId,
  type ManagementId,
} from "@/lib/catalog";
import { EvidenceText } from "@/lib/evidence-text";
import { regionName, runQuery, type ReadOnlyQuery } from "@/lib/query";
import type { EvidenceCell, EvidenceDataset } from "@/lib/schema";
import { STATISTICAL_YEAR } from "@/lib/official-source";

export const BASELINE_LABEL = "Deterministic supported-question baseline — not a language model";

export const SUPPORTED_QUESTIONS = [
  "What percentage of schools in Arunachal Pradesh had functional girls toilets in 2022-23 for all management?",
  "Compare functional CWSN-friendly toilets for all management across states and UTs in 2022-23.",
  "Which state or UT had the lowest printed percentage of functional girls toilets, all management, in 2022-23?",
  "Explain the denominator for functional girls toilets.",
  "How should a printed 0 for Andaman and Nicobar, Others, girls toilets be read?",
  "What data-quality warnings apply to this report?",
  "Where does the India figure for functional boys toilets, all management, come from?",
  "How many schools are in the published India denominator for functional girls toilets, all management?",
] as const;

export type WorkflowStep = { title: string; detail: string };

export type WorkflowResult = {
  status: "answered" | "refused" | "unsupported" | "needs_dataset";
  baselineLabel: typeof BASELINE_LABEL;
  agentFoundryGenerated: false;
  workflowId: "deterministic-baseline";
  steps: WorkflowStep[];
  rejectedOperations: string[];
  assumptions: string[];
  query: ReadOnlyQuery | null;
  answer: string;
  cells: EvidenceCell[];
  omittedCells: EvidenceCell[];
  datasetMode: EvidenceDataset["mode"] | "none";
};

type Intent =
  | "refuse"
  | "quality"
  | "denominator"
  | "counts"
  | "zero"
  | "source"
  | "order"
  | "compare"
  | "cell"
  | "unsupported";

export function runBaseline(question: string, dataset: EvidenceDataset | null): WorkflowResult {
  const trimmed = question.trim();
  const folded = fold(trimmed);
  const assumptions: string[] = [];
  const rejected: string[] = [
    "No generated SQL or code was executed.",
    "No cross-indicator subtraction.",
    "No causal estimate.",
    "No inference of students or toilet seats from a percentage.",
    "Government total was not replaced by a sum of KVS, NVS, other central government, and state government.",
  ];

  const baseSteps: WorkflowStep[] = [
    { title: "Question received", detail: trimmed || "(empty)" },
    {
      title: "Interpreter",
      detail: `${BASELINE_LABEL}. workflowId deterministic-baseline. agentFoundryGenerated false. No model request is made.`,
    },
  ];

  if (!trimmed) {
    return finish({
      status: "unsupported",
      steps: [...baseSteps, { title: "Result", detail: "Empty question." }],
      assumptions,
      rejected,
      query: null,
      answer: unsupportedAnswer(),
      cells: [],
      omittedCells: [],
      dataset,
    });
  }

  const indicators = indicatorsIn(folded);
  const regions = regionsIn(folded, assumptions);
  const management = managementIn(folded, assumptions);
  const intent = intentOf(folded, indicators);

  if (intent.kind === "refuse") {
    const reason = intent.reason ?? "Refused.";
    const answer = intent.answer ?? evidenceStatic("This question was refused.");
    return finish({
      status: "refused",
      steps: [
        ...baseSteps,
        { title: "Refusal", detail: reason },
        { title: "Query", detail: "No read was issued." },
      ],
      assumptions,
      rejected: [...rejected, reason],
      query: null,
      answer,
      cells: [],
      omittedCells: [],
      dataset,
    });
  }

  if (indicators.length > 1 && intent.kind !== "quality") {
    const reason = "More than one indicator was named. Girls, boys, and CWSN-friendly percentages use different school populations, so they are not compared arithmetically.";
    return finish({
      status: "refused",
      steps: [...baseSteps, { title: "Refusal", detail: reason }],
      assumptions,
      rejected: [...rejected, reason],
      query: null,
      answer: evidenceStatic(
        "Girls, boys, and CWSN-friendly percentages do not share a denominator. Ask for one indicator. This desk will not subtract them or convert the gap into missing toilets.",
      ),
      cells: [],
      omittedCells: [],
      dataset,
    });
  }

  if (intent.kind === "unsupported") {
    return finish({
      status: "unsupported",
      steps: [...baseSteps, { title: "No supported pattern", detail: "The baseline did not map this wording onto a known operation." }],
      assumptions,
      rejected,
      query: null,
      answer: unsupportedAnswer(),
      cells: [],
      omittedCells: [],
      dataset,
    });
  }

  if (intent.kind === "quality") {
    return qualityResult(baseSteps, assumptions, rejected, dataset);
  }

  const indicator = indicators[0] ? indicatorById(indicators[0]) : undefined;
  if (!indicator) {
    return finish({
      status: "unsupported",
      steps: [...baseSteps, { title: "Indicator missing", detail: "Name girls toilets, boys toilets, or CWSN-friendly toilets." }],
      assumptions,
      rejected,
      query: null,
      answer: unsupportedAnswer(),
      cells: [],
      omittedCells: [],
      dataset,
    });
  }
  if (!indicator) {
    return unsupportedFinish(baseSteps, assumptions, rejected, dataset);
  }

  if (intent.kind === "denominator") {
    return denominatorResult(indicator.id, baseSteps, assumptions, rejected, dataset);
  }

  const regionIds = chooseRegionIds(intent.kind, regions, dataset);
  if (regionIds.note) assumptions.push(regionIds.note);
  const managementId = management ?? "all_management";
  if (!management) {
    assumptions.push("Management was not named. The baseline selected All management, column (2), and recorded that choice.");
  }

  const order =
    intent.kind === "order" ? (intent.direction === "asc" ? "printed_asc" : "printed_desc") : "report";
  const query: ReadOnlyQuery = {
    indicatorId: indicator.id,
    year: STATISTICAL_YEAR,
    regionIds: regionIds.ids,
    managementId,
    order,
    excludeAggregate: intent.kind === "order" || intent.kind === "compare",
  };

  const steps: WorkflowStep[] = [
    ...baseSteps,
    { title: "Dataset", detail: dataset ? `mode ${dataset.mode}; statistical year ${dataset.statisticalYear}` : "No extract is loaded." },
    { title: "Indicator", detail: `${indicator.label}. Table ${indicator.tableId}, physical page ${indicator.physicalPage}.` },
    { title: "Management", detail: `${managementById(managementId)?.label}. Column (${managementById(managementId)?.sourceColumn}). ${managementById(managementId)?.note}` },
    { title: "Geography", detail: describeRegions(query.regionIds) },
    { title: "Read-only query", detail: JSON.stringify(query) },
  ];

  if (!dataset) {
    return finish({
      status: "needs_dataset",
      steps: [...steps, { title: "Read", detail: "Skipped. There is no loaded extract, so no percentage is supplied." }],
      assumptions,
      rejected,
      query,
      answer: needsDatasetAnswer(indicator.id),
      cells: [],
      omittedCells: [],
      dataset,
    });
  }

  const outcome = runQuery(dataset, query);
  if (!outcome.ok) {
    return finish({
      status: "refused",
      steps: [...steps, { title: "Query rejected", detail: outcome.message }],
      assumptions,
      rejected: [...rejected, outcome.message],
      query,
      answer: evidenceStatic(outcome.message),
      cells: [],
      omittedCells: [],
      dataset,
    });
  }

  if (outcome.matched.length === 0) {
    return finish({
      status: "answered",
      steps: [...steps, { title: "Read", detail: "The extract has no cell for this selection. Nothing was imputed." }],
      assumptions,
      rejected,
      query,
      answer: withMode(
        dataset,
        evidenceStatic("The loaded extract has no cell for this selection. The missing cell was not imputed and no percentage is shown."),
      ),
      cells: [],
      omittedCells: [],
      dataset,
    });
  }

  if (intent.kind === "counts") {
    return countsResult(dataset, query, outcome.matched, steps, assumptions, rejected);
  }
  if (intent.kind === "source") {
    return sourceResult(dataset, query, outcome.matched, steps, assumptions, rejected);
  }
  if (intent.kind === "zero") {
    return zeroResult(dataset, query, outcome.matched, steps, assumptions, rejected);
  }
  if (intent.kind === "order") {
    return orderResult(
      dataset,
      query,
      outcome.displayed,
      outcome.omittedFromOrder,
      steps,
      assumptions,
      rejected,
      intent.direction === "asc" ? "asc" : "desc",
    );
  }
  if (intent.kind === "compare") {
    return compareResult(dataset, query, outcome.matched, steps, assumptions, rejected);
  }
  return cellResult(dataset, query, outcome.matched, steps, assumptions, rejected);
}

function qualityResult(
  baseSteps: WorkflowStep[],
  assumptions: string[],
  rejected: string[],
  dataset: EvidenceDataset | null,
): WorkflowResult {
  const text = new EvidenceText();
  text.add("Data-quality notes for this desk. ");
  if (!dataset) {
    text.add(
      "No extract is loaded, so there are no cell-level flags yet. Standing rules: statistical year 2022-23 only; India is an aggregate; tables 8.8, 8.9, and 8.10 have no column (8); government total is not added to its parts; the three indicators use different denominators; printed precision is kept; a zero denominator makes a printed zero undefined; KVS and NVS are not expanded; comparisons are descriptive. Import the booklet to attach these checks to cells, including the table 7.4 footer check.",
    );
  } else {
    text.add(dataset.mode === "synthetic-test" ? "SYNTHETIC TEST DATA. " : "Loaded extract. ");
    if (dataset.warnings.length === 0) {
      text.add("The extract has no stored warnings.");
    }
    for (const warning of dataset.warnings) {
      text.add(`${warning.severity} ${warning.code}: `);
      text.quote(warning.message);
      text.add(" ");
    }
  }
  return finish({
    status: "answered",
    steps: [...baseSteps, { title: "Operation", detail: "List stored quality notes. No percentage was calculated." }],
    assumptions,
    rejected,
    query: null,
    answer: text.finish(),
    cells: [],
    omittedCells: [],
    dataset,
  });
}

function denominatorResult(
  indicatorId: IndicatorId,
  baseSteps: WorkflowStep[],
  assumptions: string[],
  rejected: string[],
  dataset: EvidenceDataset | null,
): WorkflowResult {
  const indicator = indicatorById(indicatorId)!;
  const text = new EvidenceText();
  text.add(`${indicator.label} is a percentage of schools. ${indicator.population} Numerator: ${indicator.numerator} `);
  text.add(`Detailed counts are table ${indicator.countTableId}, physical page ${indicator.countPhysicalPage}. The report also prints a percentage continuation on physical page ${indicator.countContinuationPage}. `);
  text.add(`The headline percentage is table ${indicator.tableId}, physical page ${indicator.physicalPage}. `);
  text.add("The five broad groups in the count table are all management, government, government aided, private unaided, and others. KVS, NVS, other central government, and state government are not given separate denominators there, so those percentages are not turned back into school counts. ");
  if (indicator.topic === "girls") {
    text.add("Girls evidence is table 7.4, not table 7.5. ");
  }
  text.add("Different indicators are not subtracted. ");
  if (!dataset) {
    text.add("No extract is loaded, so this note does not quote a published count.");
  } else {
    text.add("Published counts for a selected broad group appear in the table after a count question or a direct selection. This explanation does not itself quote one.");
  }
  return finish({
    status: "answered",
    steps: [...baseSteps, { title: "Operation", detail: "Denominator definition from the known booklet layout. No arithmetic on percentages." }],
    assumptions,
    rejected,
    query: null,
    answer: text.finish(),
    cells: [],
    omittedCells: [],
    dataset,
  });
}

function countsResult(
  dataset: EvidenceDataset,
  query: ReadOnlyQuery,
  matched: EvidenceCell[],
  steps: WorkflowStep[],
  assumptions: string[],
  rejected: string[],
): WorkflowResult {
  const cell = matched[0];
  const management = managementById(query.managementId)!;
  const text = new EvidenceText();
  if (!management.broad || !cell?.counts) {
    text.add(`${management.label} has no separate published denominator in the detailed count table. The percentage was not inverted into a school count.`);
    return finish({
      status: "answered",
      steps: [...steps, { title: "Counts", detail: "Refused to infer a count for a subcategory the detailed table does not publish." }],
      assumptions,
      rejected,
      query,
      answer: withMode(dataset, text.finish()),
      cells: cell ? [cell] : [],
      omittedCells: [],
      dataset,
    });
  }
  const name = regionName(dataset, cell.regionId);
  text.add(`Published counts for ${name}, ${management.label}, ${indicatorById(query.indicatorId)?.label}. `);
  text.add("Denominator ");
  text.quote(cell.counts.denominatorRaw);
  text.add(` schools, count-table column (${cell.counts.denominatorColumn}). Numerator `);
  text.quote(cell.counts.numeratorRaw);
  text.add(` schools with the functional facility, column (${cell.counts.numeratorColumn}). `);
  text.add(`Source table ${cell.counts.countTableId}, physical page ${cell.counts.countPhysicalPage}, footer `);
  text.quote(cell.counts.countSourceFooter);
  text.add(". These are the printed counts, not a number inferred from the percentage. ");
  if (matched.length > 1) {
    text.add("One geography was quoted. The table lists the rest of the selection.");
  }
  return finish({
    status: "answered",
    steps: [...steps, { title: "Counts", detail: "Quoted published numerator and denominator for the first selected geography." }],
    assumptions,
    rejected,
    query,
    answer: withMode(dataset, text.finish()),
    cells: matched,
    omittedCells: [],
    dataset,
  });
}

function sourceResult(
  dataset: EvidenceDataset,
  query: ReadOnlyQuery,
  matched: EvidenceCell[],
  steps: WorkflowStep[],
  assumptions: string[],
  rejected: string[],
): WorkflowResult {
  const cell = matched[0];
  const text = new EvidenceText();
  const indicator = indicatorById(query.indicatorId)!;
  text.add(`${indicator.label} is taken from table ${cell.percentageTableId}, physical page ${cell.percentagePhysicalPage}, column (${cell.sourceColumn}). Footer `);
  text.quote(cell.percentageSourceFooter);
  text.add(". ");
  if (dataset.mode === "government-data") {
    text.add("Booklet URL is stored on the extract as a citation. SHA-256 ");
    text.quote(dataset.source.sha256);
    text.add(". ");
  }
  text.add(`The cell for ${regionName(dataset, cell.regionId)} prints `);
  text.quote(cell.printed ?? cell.rawToken);
  text.add(`. Reading: ${reading(cell)}. `);
  text.add(dataset.statement);
  return finish({
    status: "answered",
    steps: [...steps, { title: "Source", detail: "Cited the percentage table, page, column, and footer actually stored on the cell." }],
    assumptions,
    rejected,
    query,
    answer: withMode(dataset, text.finish()),
    cells: matched,
    omittedCells: [],
    dataset,
  });
}

function zeroResult(
  dataset: EvidenceDataset,
  query: ReadOnlyQuery,
  matched: EvidenceCell[],
  steps: WorkflowStep[],
  assumptions: string[],
  rejected: string[],
): WorkflowResult {
  const cell = preferZeroCell(matched) ?? matched[0];
  const text = new EvidenceText();
  const name = regionName(dataset, cell.regionId);
  const management = managementById(cell.managementId)?.label;
  text.add(`${name}, ${management}. Printed token `);
  text.quote(cell.rawToken);
  text.add(". ");
  if (cell.interpretation === "undefined_denominator_zero" && cell.counts) {
    text.add("The count table denominator is ");
    text.quote(cell.counts.denominatorRaw);
    text.add(" and the functional count is ");
    text.quote(cell.counts.numeratorRaw);
    text.add(". The percentage is undefined. The raw printed token is kept and is not described as a measured zero percent. ");
  } else if (cell.interpretation === "measured_percentage" && cell.counts) {
    text.add("The denominator is ");
    text.quote(cell.counts.denominatorRaw);
    text.add(", which is above zero, so the printed zero is a measured zero percent in that population. ");
  } else if (cell.interpretation === "zero_denominator_not_available") {
    text.add("The detailed count table does not break out this management, so the printed zero is not confirmed as a measured zero and is not relabelled as missing. ");
  } else if (cell.interpretation === "missing") {
    text.add("This cell is missing, not zero. ");
  } else {
    text.add(`The stored reading is ${reading(cell)}. `);
  }
  text.add(`Table ${cell.percentageTableId}, physical page ${cell.percentagePhysicalPage}.`);
  return finish({
    status: "answered",
    steps: [...steps, { title: "Zero reading", detail: cell.interpretation }],
    assumptions,
    rejected,
    query,
    answer: withMode(dataset, text.finish()),
    cells: matched,
    omittedCells: [],
    dataset,
  });
}

function orderResult(
  dataset: EvidenceDataset,
  query: ReadOnlyQuery,
  displayed: EvidenceCell[],
  omitted: EvidenceCell[],
  steps: WorkflowStep[],
  assumptions: string[],
  rejected: string[],
  direction: "asc" | "desc",
): WorkflowResult {
  const text = new EvidenceText();
  const indicator = indicatorById(query.indicatorId)!;
  const management = managementById(query.managementId)!;
  const word = direction === "asc" ? "lowest" : "highest";
  text.add(`Descriptive ${word} printed percentage for ${indicator.label}, ${management.label}, ${STATISTICAL_YEAR}. India is excluded because it is the aggregate. `);
  if (displayed.length === 0) {
    text.add("No measured percentage was available to order. Undefined and missing cells were not treated as zero.");
  } else {
    const top = displayed[0].numeric;
    const tied = displayed.filter((cell) => cell.numeric === top);
    text.add(`The ${word} printed value is `);
    text.quote(tied[0].printed ?? "");
    text.add(`. Geographies: ${tied.map((cell) => regionName(dataset, cell.regionId)).join(", ")}. `);
    const undefinedCount = omitted.filter((cell) => cell.interpretation === "undefined_denominator_zero").length;
    const missingCount = omitted.filter((cell) => cell.interpretation === "missing").length;
    text.add("Left out of the ordering: ");
    text.quote(String(undefinedCount));
    text.add(" undefined because the denominator is zero, and ");
    text.quote(String(missingCount));
    text.add(" missing. They were not sorted as zero. This is not a judgement of school quality and not a causal finding.");
  }
  return finish({
    status: "answered",
    steps: [...steps, { title: "Order", detail: "Sorted measured printed values only." }],
    assumptions,
    rejected,
    query,
    answer: withMode(dataset, text.finish()),
    cells: displayed,
    omittedCells: omitted,
    dataset,
  });
}

function compareResult(
  dataset: EvidenceDataset,
  query: ReadOnlyQuery,
  matched: EvidenceCell[],
  steps: WorkflowStep[],
  assumptions: string[],
  rejected: string[],
): WorkflowResult {
  const text = new EvidenceText();
  const indicator = indicatorById(query.indicatorId)!;
  const management = managementById(query.managementId)!;
  const measured = matched.filter((cell) => cell.interpretation === "measured_percentage" && dataset.regions.find((region) => region.id === cell.regionId)?.role === "state_ut");
  const undefinedCount = matched.filter((cell) => cell.interpretation === "undefined_denominator_zero").length;
  text.add(`Descriptive comparison of ${indicator.label}, ${management.label}, ${STATISTICAL_YEAR}, across states and UTs. India is the aggregate and is not treated as a state in this comparison. Measured state or UT rows: `);
  text.quote(String(measured.length));
  text.add(". Undefined because the denominator is zero: ");
  text.quote(String(undefinedCount));
  text.add(". No average was calculated. No other indicator was subtracted. The table has the printed values.");
  return finish({
    status: "answered",
    steps: [...steps, { title: "Compare", detail: "Returned the printed cells. No summary statistic was computed." }],
    assumptions,
    rejected,
    query,
    answer: withMode(dataset, text.finish()),
    cells: matched.filter((cell) => dataset.regions.find((region) => region.id === cell.regionId)?.role !== "aggregate"),
    omittedCells: matched.filter((cell) => cell.interpretation !== "measured_percentage"),
    dataset,
  });
}

function cellResult(
  dataset: EvidenceDataset,
  query: ReadOnlyQuery,
  matched: EvidenceCell[],
  steps: WorkflowStep[],
  assumptions: string[],
  rejected: string[],
): WorkflowResult {
  const cell = matched[0];
  const text = new EvidenceText();
  const indicator = indicatorById(query.indicatorId)!;
  const management = managementById(query.managementId)!;
  text.add(`${regionName(dataset, cell.regionId)}, ${STATISTICAL_YEAR}, ${indicator.label}, ${management.label}. `);
  if (cell.interpretation === "measured_percentage" && cell.printed) {
    text.add("Printed ");
    text.quote(cell.printed);
    text.add("%. ");
  } else if (cell.interpretation === "undefined_denominator_zero") {
    text.add("Undefined. Printed token ");
    text.quote(cell.rawToken);
    text.add(". ");
  } else if (cell.interpretation === "missing") {
    text.add("Missing. No percentage is shown. ");
  } else {
    text.add("Printed token ");
    text.quote(cell.rawToken);
    text.add(`. ${reading(cell)}. `);
  }
  text.add(`Table ${cell.percentageTableId}, physical page ${cell.percentagePhysicalPage}, column (${cell.sourceColumn}), footer `);
  text.quote(cell.percentageSourceFooter);
  text.add(". ");
  if (cell.counts) {
    text.add("Published denominator ");
    text.quote(cell.counts.denominatorRaw);
    text.add(", numerator ");
    text.quote(cell.counts.numeratorRaw);
    text.add(`, table ${cell.counts.countTableId} physical page ${cell.counts.countPhysicalPage}. `);
  } else if (!management.broad) {
    text.add("No subcategory denominator is published in the detailed count table, so a school count is not inferred. ");
  }
  if (dataset.regions.find((region) => region.id === cell.regionId)?.role === "aggregate") {
    text.add("India is the national aggregate, not a state. ");
  }
  text.add("Historical 2022-23 only. Not a causal finding.");
  return finish({
    status: "answered",
    steps: [...steps, { title: "Cell", detail: "Answer quotes the stored printed token and, where present, the published counts." }],
    assumptions,
    rejected,
    query,
    answer: withMode(dataset, text.finish()),
    cells: matched,
    omittedCells: [],
    dataset,
  });
}

function needsDatasetAnswer(indicatorId: IndicatorId): string {
  const indicator = indicatorById(indicatorId)!;
  return new EvidenceText()
    .add(`No government extract is loaded, so no percentage is given for ${indicator.label}. Import the official UDISE+ 2022-23 booklet on the Import page. The known layout cites table ${indicator.tableId} on physical page ${indicator.physicalPage}. This desk does not fetch that file and does not fill the gap with an example number.`)
    .finish();
}

function unsupportedAnswer(): string {
  return new EvidenceText()
    .add("This baseline did not recognise a supported question. It can read one indicator for a named geography and management, compare that indicator across states and UTs, order printed values, explain a denominator, read a printed zero, list quality warnings, or cite the table and page. It will not estimate impact, forecast another year, subtract indicators, or infer students from a percentage.")
    .finish();
}

function evidenceStatic(text: string): string {
  return new EvidenceText().add(text).finish();
}

function withMode(dataset: EvidenceDataset, answer: string): string {
  return labelIfSynthetic(dataset, answer);
}

function labelIfSynthetic(dataset: EvidenceDataset | null, answer: string): string {
  if (dataset?.mode !== "synthetic-test" || answer.includes("SYNTHETIC TEST DATA")) return answer;
  return `SYNTHETIC TEST DATA — not a government figure. ${answer}`;
}

function reading(cell: EvidenceCell): string {
  switch (cell.interpretation) {
    case "measured_percentage":
      return "measured printed percentage";
    case "undefined_denominator_zero":
      return "undefined because the denominator is zero";
    case "zero_denominator_not_available":
      return "printed zero without a published denominator for this management";
    case "missing":
      return "missing";
  }
}

function preferZeroCell(cells: EvidenceCell[]): EvidenceCell | undefined {
  return (
    cells.find((cell) => cell.interpretation === "undefined_denominator_zero") ??
    cells.find((cell) => cell.rawToken === "0" || cell.printed === "0")
  );
}

function chooseRegionIds(
  intent: Intent,
  regions: { id: string; note?: string }[],
  dataset: EvidenceDataset | null,
): { ids: string[]; note?: string } {
  if (intent === "order" || intent === "compare") {
    const ids = (dataset?.regions ?? REGIONS).filter((region) => region.role === "state_ut").map((region) => region.id);
    if (regions.length > 0 && intent === "compare") {
      return { ids: regions.map((region) => region.id), note: regions.find((region) => region.note)?.note };
    }
    return { ids, note: "No single geography was named, so the baseline used every state and UT and left India out of the ordering." };
  }
  if (regions.length > 0) {
    return { ids: regions.map((region) => region.id), note: regions.find((region) => region.note)?.note };
  }
  return { ids: ["india"], note: "No geography was named. The baseline selected India, the aggregate, and recorded that choice." };
}

function describeRegions(ids: string[]): string {
  if (ids.length > 4) return `${ids.length} geographies selected.`;
  return ids
    .map((id) => REGIONS.find((region) => region.id === id)?.name ?? id)
    .join(", ");
}

function intentOf(folded: string, indicators: IndicatorId[]): { kind: Intent; reason?: string; answer?: string; direction?: "asc" | "desc" } {
  if (/\b(cause|caused|causes|causal|impact|impacts|impacted|because|effect of|due to|led to|resulted in)\b/.test(folded)) {
    return {
      kind: "refuse",
      reason: "Causal wording.",
      answer: evidenceStatic("This desk does not estimate causal impact. It can only describe the printed 2022-23 percentages and their published denominators."),
    };
  }
  if (/\b(2024|2025|2026|2027|2028|predict|forecast|projection|current status|as of today|right now|latest year)\b/.test(folded)) {
    return {
      kind: "refuse",
      reason: "A year other than 2022-23, or a request for a current status, was detected.",
      answer: evidenceStatic("Only the historical statistical year 2022-23 is in scope. No later year and no current status is estimated."),
    };
  }
  if (/\b(students|student|pupils|pupil|per pupil|per student|enrolment|enrollment)\b/.test(folded)) {
    return {
      kind: "refuse",
      reason: "Student inference.",
      answer: evidenceStatic("These tables are percentages of schools, not of students. A student count is not inferred from a state percentage."),
    };
  }
  if (/\b(how many toilets|number of toilets|toilet seats|count of toilets)\b/.test(folded)) {
    return {
      kind: "refuse",
      reason: "Toilet-seat inference.",
      answer: evidenceStatic("The unit is schools with a functional facility, not a count of toilets or seats. That count is not inferred."),
    };
  }
  if (/\b(warning|warnings|data quality|anomaly|anomalies|column 8|source footer)\b/.test(folded)) return { kind: "quality" };
  if (/\b(how many schools|number of schools|published count|numerator)\b/.test(folded)) return { kind: "counts" };
  if (/\b(denominator|what is counted|which schools are counted|population of schools)\b/.test(folded)) return { kind: "denominator" };
  if (/\b(printed zero|printed 0|denominator is zero|denominator 0|undefined)\b/.test(folded) || /\bwhy\b/.test(folded) && /\bzero\b/.test(folded)) {
    return { kind: "zero" };
  }
  if (/\b(source|where does|which table|which page|citation|come from)\b/.test(folded)) return { kind: "source" };
  if (/\b(lowest|smallest|bottom)\b/.test(folded)) return { kind: "order", direction: "asc" };
  if (/\b(highest|largest|top|which state|which ut|rank)\b/.test(folded)) return { kind: "order", direction: "desc" };
  if (/\b(compare|across|versus|between)\b/.test(folded) && indicators.length <= 1) return { kind: "compare" };
  if (indicators.length === 1) return { kind: "cell" };
  return { kind: "unsupported" };
}

function indicatorsIn(folded: string): IndicatorId[] {
  const found: IndicatorId[] = [];
  if (/\bcwsn\b|special needs|children with special needs/.test(folded)) found.push("functional_cwsn_toilet_pct");
  if (/\bgirls?\b/.test(folded)) found.push("functional_girls_toilet_pct");
  if (/\bboys?\b/.test(folded)) found.push("functional_boys_toilet_pct");
  return found;
}

function managementIn(folded: string, assumptions: string[]): ManagementId | null {
  const table: { id: ManagementId; phrases: string[]; assumption?: string }[] = [
    { id: "other_central_government", phrases: ["other central government", "other central"] },
    { id: "state_government", phrases: ["state government"] },
    { id: "government_aided", phrases: ["government aided", "aided"] },
    {
      id: "private_unaided_recognized",
      phrases: ["private unaided", "unaided", "private"],
      assumption: "The word private was read as private unaided recognized, the printed column. Say if that is the wrong column.",
    },
    {
      id: "government_total",
      phrases: ["government total", "government schools", "government"],
      assumption: "The word government was read as Government total, the parent aggregate, not as state government alone.",
    },
    { id: "kvs", phrases: ["kvs"] },
    { id: "nvs", phrases: ["nvs"] },
    { id: "others", phrases: ["others", "other management"] },
    { id: "all_management", phrases: ["all management", "all schools", "overall"] },
  ];
  for (const entry of table) {
    if (entry.phrases.some((phrase) => hasPhrase(folded, phrase))) {
      if (entry.assumption && (entry.phrases.includes("private") || entry.phrases.includes("government")) && !entry.phrases.some((phrase) => phrase !== "private" && phrase !== "government" && hasPhrase(folded, phrase))) {
        assumptions.push(entry.assumption);
      }
      return entry.id;
    }
  }
  return null;
}

type Alias = { id: string; phrases: string[]; note?: string };

function aliasTable(): Alias[] {
  const combined = REGIONS.find((region) => region.name.startsWith("Dadra"));
  const andaman = REGIONS.find((region) => region.name.startsWith("Andaman"));
  const odisha = REGIONS.find((region) => region.name === "Odisha");
  const puducherry = REGIONS.find((region) => region.name === "Puducherry");
  const delhi = REGIONS.find((region) => region.name === "Delhi");
  const jk = REGIONS.find((region) => region.name === "Jammu & Kashmir");
  const extras: Alias[] = [];
  if (andaman) extras.push({ id: andaman.id, phrases: ["andaman", "andaman and nicobar", "andaman nicobar islands"] });
  if (combined) {
    extras.push({
      id: combined.id,
      phrases: ["dadra", "daman", "dadra and nagar haveli", "daman and diu"],
      note: "The booklet prints one combined row for Dadra & Nagar Haveli and Daman & Diu.",
    });
  }
  if (odisha) extras.push({ id: odisha.id, phrases: ["orissa"], note: "The booklet prints Odisha." });
  if (puducherry) extras.push({ id: puducherry.id, phrases: ["pondicherry"], note: "The booklet prints Puducherry." });
  if (delhi) extras.push({ id: delhi.id, phrases: ["nct of delhi"] });
  if (jk) extras.push({ id: jk.id, phrases: ["jammu and kashmir", "jammu"] });
  extras.push({ id: "india", phrases: ["all india", "national aggregate", "india"] });
  return [
    ...REGIONS.map((region) => ({ id: region.id, phrases: [fold(region.name)] })),
    ...extras,
  ];
}

function regionsIn(folded: string, assumptions: string[]): { id: string; note?: string }[] {
  const found: { id: string; note?: string; start: number; end: number }[] = [];
  const occupied = new Array<boolean>(folded.length).fill(false);
  const candidates = aliasTable()
    .flatMap((alias) => alias.phrases.map((phrase) => ({ id: alias.id, phrase: fold(phrase), note: alias.note })))
    .filter((candidate) => candidate.phrase.length > 0)
    .sort((left, right) => right.phrase.length - left.phrase.length);
  for (const candidate of candidates) {
    let from = 0;
    while (from <= folded.length) {
      const at = indexOfPhrase(folded, candidate.phrase, from);
      if (at < 0) break;
      const end = at + candidate.phrase.length;
      const overlaps = occupied.slice(at, end).some(Boolean);
      if (!overlaps) {
        for (let index = at; index < end; index += 1) occupied[index] = true;
        found.push({ id: candidate.id, note: candidate.note, start: at, end });
      }
      from = end;
    }
  }
  found.sort((left, right) => left.start - right.start);
  const unique: { id: string; note?: string }[] = [];
  for (const hit of found) {
    if (!unique.some((item) => item.id === hit.id)) {
      if (hit.note) assumptions.push(hit.note);
      unique.push({ id: hit.id, note: hit.note });
    }
  }
  return unique;
}

function unsupportedFinish(
  steps: WorkflowStep[],
  assumptions: string[],
  rejected: string[],
  dataset: EvidenceDataset | null,
): WorkflowResult {
  return finish({
    status: "unsupported",
    steps,
    assumptions,
    rejected,
    query: null,
    answer: unsupportedAnswer(),
    cells: [],
    omittedCells: [],
    dataset,
  });
}

function indexOfPhrase(folded: string, phrase: string, from: number): number {
  const haystack = ` ${folded} `;
  const needle = ` ${phrase} `;
  const at = haystack.indexOf(needle, from);
  if (at < 0) return -1;
  return at;
}

function hasPhrase(folded: string, phrase: string): boolean {
  return indexOfPhrase(folded, phrase, 0) >= 0;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function finish(input: {
  status: WorkflowResult["status"];
  steps: WorkflowStep[];
  assumptions: string[];
  rejected: string[];
  query: ReadOnlyQuery | null;
  answer: string;
  cells: EvidenceCell[];
  omittedCells: EvidenceCell[];
  dataset: EvidenceDataset | null;
}): WorkflowResult {
  return {
    status: input.status,
    baselineLabel: BASELINE_LABEL,
    agentFoundryGenerated: false,
    workflowId: "deterministic-baseline",
    steps: input.steps,
    rejectedOperations: input.rejected,
    assumptions: input.assumptions,
    query: input.query,
    answer: labelIfSynthetic(input.dataset, input.answer),
    cells: input.cells,
    omittedCells: input.omittedCells,
    datasetMode: input.dataset?.mode ?? "none",
  };
}

