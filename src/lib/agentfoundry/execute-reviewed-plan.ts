import { indicatorById, managementById, regionById } from "@/lib/catalog";
import { EvidenceText } from "@/lib/evidence-text";
import { runQuery, type ReadOnlyQuery } from "@/lib/query";
import type { EvidenceCell, EvidenceDataset } from "@/lib/schema";
import { planQuestion } from "@/lib/agentfoundry/query-plan.reviewed";
import { validateReadOnlyQuery } from "@/lib/agentfoundry/validate-query";

export const REVIEWED_PLAN_LABEL = "Reviewed plan (post-review edit, not unedited IDE output)";

const REFUSAL_CODES = new Set([
  "causal",
  "other_year",
  "student_inference",
  "toilet_count",
  "cross_indicator",
  "prompt_injection",
]);

export type ReviewedExecution = {
  label: string;
  agentFoundryGenerated: false;
  executedQuery: false | true;
  planStatus: "plan" | "explain" | "refused" | "unsupported" | "invalid_plan" | "needs_dataset";
  refusalCode: string | null;
  operation: string | null;
  query: ReadOnlyQuery | null;
  assumptions: string[];
  answer: string;
  cells: EvidenceCell[];
  omittedCells: EvidenceCell[];
};

export function answerReviewedQuestion(question: string, dataset: EvidenceDataset | null): ReviewedExecution {
  return executeReviewedPlan(planQuestion(question), dataset);
}

/** A refused, explain, or unsupported plan never reaches runQuery, even if a query field was attached. */
export function executeReviewedPlan(plan: unknown, dataset: EvidenceDataset | null): ReviewedExecution {
  const result = buildReviewedExecution(plan, dataset);
  if (dataset?.mode !== "synthetic-test" || result.answer.includes("SYNTHETIC TEST DATA")) return result;
  return { ...result, answer: `SYNTHETIC TEST DATA — not a government figure. ${result.answer}` };
}

function buildReviewedExecution(plan: unknown, dataset: EvidenceDataset | null): ReviewedExecution {
  const base = {
    label: REVIEWED_PLAN_LABEL,
    agentFoundryGenerated: false as const,
    executedQuery: false as const,
    query: null,
    assumptions: readStrings(plan, "assumptions"),
    cells: [] as EvidenceCell[],
    omittedCells: [] as EvidenceCell[],
  };
  if (!isRecord(plan) || typeof plan.status !== "string") {
    return { ...base, planStatus: "invalid_plan", refusalCode: null, operation: null, answer: "The plan was rejected before any query." };
  }
  if (plan.status === "refused" || plan.status === "unsupported" || plan.status === "explain") {
    return explainOrRefuse(plan, dataset, base);
  }
  if (plan.status !== "plan") {
    return { ...base, planStatus: "invalid_plan", refusalCode: null, operation: null, answer: "The plan status is not allowed, so no query ran." };
  }
  const validated = validateReadOnlyQuery(plan.query);
  if (!validated.ok) {
    return {
      ...base,
      planStatus: "invalid_plan",
      refusalCode: null,
      operation: typeof plan.operation === "string" ? plan.operation : null,
      answer: `${validated.message} No query ran.`,
    };
  }
  if (!dataset) {
    return {
      ...base,
      planStatus: "needs_dataset",
      refusalCode: null,
      operation: typeof plan.operation === "string" ? plan.operation : null,
      query: validated.query,
      answer: "No government extract is loaded, so this validated plan was not executed and no figure is supplied.",
    };
  }
  const outcome = runQuery(dataset, validated.query);
  if (!outcome.ok) {
    return {
      ...base,
      executedQuery: true,
      planStatus: "invalid_plan",
      refusalCode: null,
      operation: typeof plan.operation === "string" ? plan.operation : null,
      query: validated.query,
      answer: outcome.message,
    };
  }
  return {
    ...base,
    executedQuery: true,
    planStatus: "plan",
    refusalCode: null,
    operation: typeof plan.operation === "string" ? plan.operation : null,
    query: validated.query,
    answer: describeCells(dataset, validated.query, outcome.displayed, outcome.omittedFromOrder),
    cells: outcome.displayed,
    omittedCells: outcome.omittedFromOrder,
  };
}

function explainOrRefuse(
  plan: Record<string, unknown>,
  dataset: EvidenceDataset | null,
  base: Omit<ReviewedExecution, "planStatus" | "refusalCode" | "operation" | "answer">,
): ReviewedExecution {
  if (plan.status === "explain") {
    const operation = plan.operation === "quality" ? "quality" : plan.operation === "denominator" ? "denominator" : null;
    if (!operation) {
      return { ...base, planStatus: "invalid_plan", refusalCode: null, operation: null, answer: "The explain plan is not a known operation. No query ran." };
    }
    const indicatorId = typeof plan.indicatorId === "string" ? plan.indicatorId : null;
    return {
      ...base,
      planStatus: "explain",
      refusalCode: null,
      operation,
      answer: operation === "quality" ? qualityAnswer(dataset) : denominatorAnswer(indicatorId),
    };
  }
  if (plan.status === "unsupported") {
    return {
      ...base,
      planStatus: "unsupported",
      refusalCode: null,
      operation: null,
      answer: typeof plan.reason === "string" && plan.reason.trim() ? plan.reason : "The question is not supported. No query ran.",
    };
  }
  const code = typeof plan.code === "string" && REFUSAL_CODES.has(plan.code) ? plan.code : null;
  if (!code) {
    return { ...base, planStatus: "invalid_plan", refusalCode: null, operation: null, answer: "The refusal code is not recognized. No query ran." };
  }
  return {
    ...base,
    planStatus: "refused",
    refusalCode: code,
    operation: null,
    answer: typeof plan.reason === "string" && !/\d/.test(plan.reason) ? plan.reason : "The question was refused. No query ran.",
  };
}

function denominatorAnswer(indicatorId: string | null): string {
  const indicator = indicatorId ? indicatorById(indicatorId) : undefined;
  const text = new EvidenceText();
  if (!indicator) {
    text.add("Name one indicator before a denominator note is selected. No percentage is supplied.");
    return text.finish();
  }
  text.add(`${indicator.label} uses this population: ${indicator.population} `);
  text.add(`Counts are table ${indicator.countTableId}, physical page ${indicator.countPhysicalPage}. `);
  text.add(`The headline percentage is table ${indicator.tableId}, physical page ${indicator.physicalPage}. `);
  text.add("No figure is calculated here.");
  return text.finish();
}

function qualityAnswer(dataset: EvidenceDataset | null): string {
  const text = new EvidenceText();
  text.add("Quality notes come from the loaded extract. No new percentage is calculated. ");
  if (!dataset) {
    text.add("No extract is loaded, so there are no cell-level flags.");
    return text.finish();
  }
  if (dataset.mode === "synthetic-test") text.add("SYNTHETIC TEST DATA. ");
  for (const warning of dataset.warnings) {
    text.add(`${warning.code}: `);
    text.quote(warning.message);
    text.add(" ");
  }
  return text.finish();
}

function describeCells(
  dataset: EvidenceDataset,
  query: ReadOnlyQuery,
  displayed: EvidenceCell[],
  omitted: EvidenceCell[],
): string {
  const text = new EvidenceText();
  if (dataset.mode === "synthetic-test") text.add("SYNTHETIC TEST DATA. ");
  const indicator = indicatorById(query.indicatorId);
  const management = managementById(query.managementId);
  text.add(`${indicator?.label ?? query.indicatorId}, ${management?.label ?? query.managementId}, ${query.year}. `);
  if (displayed.length === 0) {
    text.add("The extract has no measured cell for this plan. Nothing was imputed. ");
  }
  const shown = displayed.slice(0, 3);
  for (const cell of shown) {
    const name = dataset.regions.find((region) => region.id === cell.regionId)?.name ?? regionById(cell.regionId)?.name ?? cell.regionId;
    text.add(`${name} prints `);
    text.quote(cell.printed ?? cell.rawToken);
    text.add(`. Table ${cell.percentageTableId}, physical page ${cell.percentagePhysicalPage}, column (${cell.sourceColumn}), footer `);
    text.quote(cell.percentageSourceFooter);
    text.add(". ");
    if (cell.counts) {
      text.add("Denominator ");
      text.quote(cell.counts.denominatorRaw);
      text.add(", numerator ");
      text.quote(cell.counts.numeratorRaw);
      text.add(". ");
    }
    if (cell.interpretation === "undefined_denominator_zero") {
      text.add("The percentage is undefined because the denominator is zero. ");
    }
  }
  if (displayed.length > shown.length) {
    text.add("Further rows stay in the table. ");
  }
  const undefinedCount = omitted.filter((cell) => cell.interpretation === "undefined_denominator_zero").length;
  if (undefinedCount > 0) {
    text.add("Left out of an ordered read because the denominator is zero: ");
    text.quote(String(undefinedCount));
    text.add(". They are not treated as zero. ");
  }
  text.add("Historical 2022-23 only. Not a causal finding.");
  return text.finish();
}

function readStrings(value: unknown, key: string): string[] {
  if (!isRecord(value) || !Array.isArray(value[key])) return [];
  return value[key].filter((item): item is string => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
