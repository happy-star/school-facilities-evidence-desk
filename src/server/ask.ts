import { answerReviewedQuestion, type ReviewedExecution } from "@/lib/agentfoundry/execute-reviewed-plan";
import { runBaseline, type WorkflowResult } from "@/lib/baseline";
import { SYNTHETIC_DEMO_NOTICE } from "@/lib/synthetic-demo-notice";
import { loadSyntheticDemoDataset } from "@/server/synthetic-demo";
import { readStoredDataset } from "@/server/store";

const MAX_QUESTION = 2_000;

export type AskResult = {
  ok: true;
  interpreter: "baseline" | "reviewed-plan";
  activeDefault: boolean;
  source: "official" | "synthetic-demo";
  syntheticBanner: string | null;
  replacesOfficialImport: false;
  result: WorkflowResult | ReviewedExecution;
};

export async function answerAsk(input: {
  question: string;
  interpreter?: unknown;
  source?: unknown;
}): Promise<AskResult> {
  const question = typeof input.question === "string" ? input.question.slice(0, MAX_QUESTION) : "";
  const interpreter = input.interpreter === "reviewed-plan" ? "reviewed-plan" : "baseline";
  const source = input.source === "synthetic-demo" ? "synthetic-demo" : "official";
  const dataset = source === "synthetic-demo"
    ? loadSyntheticDemoDataset()
    : await officialDataset();
  const syntheticBanner = dataset?.mode === "synthetic-test" ? dataset.syntheticBanner ?? SYNTHETIC_DEMO_NOTICE : null;
  if (interpreter === "baseline") {
    return {
      ok: true,
      interpreter: "baseline",
      activeDefault: true,
      source,
      syntheticBanner,
      replacesOfficialImport: false,
      result: runBaseline(question, dataset),
    };
  }
  return {
    ok: true,
    interpreter: "reviewed-plan",
    activeDefault: false,
    source,
    syntheticBanner,
    replacesOfficialImport: false,
    result: answerReviewedQuestion(question, dataset),
  };
}

async function officialDataset() {
  const stored = await readStoredDataset();
  return stored.status === "ready" ? stored.dataset : null;
}
