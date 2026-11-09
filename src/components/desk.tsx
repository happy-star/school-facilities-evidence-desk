"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { EvidenceView, type Row, type SortMode } from "@/components/evidence-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewedExecution } from "@/lib/agentfoundry/execute-reviewed-plan";
import { runBaseline, SUPPORTED_QUESTIONS, type WorkflowResult } from "@/lib/baseline";
import {
  INDICATORS,
  MANAGEMENTS,
  REGIONS,
  type IndicatorId,
  type ManagementId,
} from "@/lib/catalog";
import type { ReadOnlyQuery } from "@/lib/query";
import type { EvidenceDataset } from "@/lib/schema";
import type { ModelServiceStatus } from "@/server/model-status";
import type { StoredDataset } from "@/server/store";

const indicatorItems = INDICATORS.map((indicator) => ({ value: indicator.id, label: indicator.shortLabel }));
const managementItems = MANAGEMENTS.map((management) => ({ value: management.id, label: management.label }));
const geographyItems = [
  { value: "all-states", label: "All states and UTs" },
  { value: "india", label: "India (aggregate)" },
  ...REGIONS.filter((region) => region.role === "state_ut").map((region) => ({ value: region.id, label: region.name })),
];

export function Desk({ stored, model }: { stored: StoredDataset; model: ModelServiceStatus }) {
  const official = stored.status === "ready" ? stored.dataset : null;
  const [series, setSeries] = useState<"official" | "synthetic-demo">("official");
  const [synthetic, setSynthetic] = useState<EvidenceDataset | null>(null);
  const [syntheticState, setSyntheticState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [indicatorId, setIndicatorId] = useState<IndicatorId>("functional_girls_toilet_pct");
  const [managementId, setManagementId] = useState<ManagementId>("all_management");
  const [geography, setGeography] = useState("all-states");
  const [sort, setSort] = useState<SortMode>("report");
  const [filter, setFilter] = useState("");
  const [question, setQuestion] = useState<string>(SUPPORTED_QUESTIONS[0]);
  const [interpreter, setInterpreter] = useState<"baseline" | "reviewed-plan">("baseline");
  const [workflow, setWorkflow] = useState<WorkflowResult | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedExecution | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const dataset = series === "synthetic-demo" ? synthetic : official;

  const rows = useMemo(() => (dataset ? rowsFor(dataset, indicatorId, managementId, geography, sort) : []), [dataset, indicatorId, managementId, geography, sort]);

  async function showSynthetic() {
    setFailure(null);
    setWorkflow(null);
    setReviewed(null);
    if (synthetic?.mode === "synthetic-test" && synthetic.syntheticBanner) {
      setSeries("synthetic-demo");
      return;
    }
    setSyntheticState("loading");
    try {
      const response = await fetch("/api/demo/synthetic");
      const payload = (await response.json()) as { ok?: boolean; dataset?: EvidenceDataset; message?: string };
      if (!response.ok || payload.dataset?.mode !== "synthetic-test" || !payload.dataset.syntheticBanner) {
        setSynthetic(null);
        setSeries("official");
        setSyntheticState("error");
        setFailure(payload.message ?? "The synthetic sample was refused. The official import was not changed.");
        return;
      }
      setSynthetic(payload.dataset);
      setSyntheticState("ready");
      setSeries("synthetic-demo");
    } catch (error) {
      setSynthetic(null);
      setSeries("official");
      setSyntheticState("error");
      setFailure(error instanceof Error ? error.message : "The synthetic sample was refused. The official import was not changed.");
    }
  }

  function showOfficial() {
    setSeries("official");
    setWorkflow(null);
    setReviewed(null);
  }

  async function ask(text: string) {
    setQuestion(text);
    setFailure(null);
    if (series === "official" && interpreter === "baseline") {
      setReviewed(null);
      try {
        const result = runBaseline(text, official);
        setWorkflow(result);
        if (result.query) applyQuery(result.query);
      } catch (error) {
        setWorkflow(null);
        setFailure(error instanceof Error ? error.message : "The baseline stopped before showing an answer.");
      }
      return;
    }
    setWorkflow(null);
    setReviewed(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: text,
          interpreter: interpreter === "reviewed-plan" ? "reviewed-plan" : "baseline",
          ...(series === "synthetic-demo" ? { source: "synthetic-demo" } : {}),
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        interpreter?: string;
        message?: string;
        result?: WorkflowResult & ReviewedExecution;
      };
      if (!response.ok || !payload.result) {
        setFailure(payload.message ?? "The question was not run.");
        return;
      }
      if (payload.interpreter === "reviewed-plan") {
        setReviewed(payload.result);
        if (payload.result.executedQuery && payload.result.query) applyQuery(payload.result.query);
        return;
      }
      setWorkflow(payload.result);
      if (payload.result.query) applyQuery(payload.result.query);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The question was not run.");
    }
  }

  function applyQuery(query: ReadOnlyQuery) {
    setIndicatorId(query.indicatorId);
    setManagementId(query.managementId);
    setSort(query.order === "printed_asc" ? "value_asc" : query.order === "printed_desc" ? "value_desc" : "report");
    if (query.regionIds.length === 1) setGeography(query.regionIds[0]);
    else setGeography("all-states");
    setFilter("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Read a 2022–23 sanitation table without losing the footnote</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Choose a geography, management, and indicator, or ask one of the supported questions. The reply is a read of the loaded extract, with the source page and the data-quality note attached. It is not a chatbot, and it is not an AgentFoundry run.
        </p>
      </div>

      <Alert>
        <AlertTitle>Natural-language model: unavailable</AlertTitle>
        <AlertDescription>{model.reason}</AlertDescription>
      </Alert>

      {stored.status === "invalid" ? (
        <Alert variant="destructive">
          <AlertTitle>The local import cannot be used</AlertTitle>
          <AlertDescription>{stored.message} No chart is drawn from it.</AlertDescription>
        </Alert>
      ) : null}

      {series === "synthetic-demo" && dataset?.syntheticBanner ? (
        <p role="status" className="rounded-lg border-2 border-[#8a5a00] bg-[#f8efd8] px-4 py-3 text-sm font-semibold leading-6 text-[#3f2a00]">
          Synthetic sample — not official India statistics. {dataset.syntheticBanner} The official import file is unchanged. This sample has the girls-toilet fixture only.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Supported question</CardTitle>
            <CardDescription>
              {interpreter === "baseline"
                ? "Active path: deterministic baseline (default). A model is not called."
                : "Active path: reviewed plan. This is a post-review edit, not unedited IDE output, and not a model."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1 font-medium">Data source</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="data-source"
                  checked={series === "official"}
                  onChange={showOfficial}
                />
                Official import (separate, default)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="data-source"
                  checked={series === "synthetic-demo"}
                  onChange={() => void showSynthetic()}
                />
                Synthetic sample (not official statistics)
              </label>
            </fieldset>
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1 font-medium">Question path</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="question-path"
                  checked={interpreter === "baseline"}
                  onChange={() => {
                    setInterpreter("baseline");
                    setReviewed(null);
                  }}
                />
                Deterministic baseline (default)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="question-path"
                  checked={interpreter === "reviewed-plan"}
                  onChange={() => {
                    setInterpreter("reviewed-plan");
                    setWorkflow(null);
                  }}
                />
                Reviewed plan (internal opt-in)
              </label>
            </fieldset>
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              aria-label="Question"
            />
            <Button type="button" onClick={() => void ask(question)}>
              {interpreter === "baseline" ? "Run baseline" : "Run reviewed plan"}
            </Button>
            <div className="flex flex-col gap-2">
              {SUPPORTED_QUESTIONS.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="rounded-lg px-2 py-1 text-left text-sm text-primary hover:bg-accent"
                  onClick={() => ask(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Direct selection</CardTitle>
            <CardDescription>Year is locked to 2022–23. Changing a control clears the question result&apos;s control of the sort.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Indicator">
              <Select
                items={indicatorItems}
                value={indicatorId}
                onValueChange={(value) => {
                  if (!value) return;
                  setIndicatorId(value as IndicatorId);
                  setWorkflow(null);
                }}
              >
                <SelectTrigger className="w-full" aria-label="Indicator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {indicatorItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Management">
              <Select
                items={managementItems}
                value={managementId}
                onValueChange={(value) => {
                  if (!value) return;
                  setManagementId(value as ManagementId);
                  setWorkflow(null);
                }}
              >
                <SelectTrigger className="w-full" aria-label="Management">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {managementItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Geography">
              <Select
                items={geographyItems}
                value={geography}
                onValueChange={(value) => {
                  if (!value) return;
                  setGeography(value);
                  setWorkflow(null);
                }}
              >
                <SelectTrigger className="w-full" aria-label="Geography">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {geographyItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
      </div>

      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>Baseline stopped</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}

      {workflow ? <WorkflowPanel result={workflow} /> : null}
      {reviewed ? <ReviewedPanel result={reviewed} /> : null}

      {dataset ? (
        <EvidenceView
          dataset={dataset}
          rows={rows}
          sort={sort}
          onSort={(next) => {
            setSort(next);
            setWorkflow(null);
          }}
          filter={filter}
          onFilter={setFilter}
        />
      ) : syntheticState === "loading" && series === "synthetic-demo" ? (
        <p className="text-sm text-muted-foreground">Loading the synthetic sample. The official import is not being changed.</p>
      ) : (
        <EmptyDesk onPreview={() => void showSynthetic()} />
      )}

      {dataset ? (
        <Card>
          <CardHeader>
            <CardTitle>Warnings stored with this extract</CardTitle>
            <CardDescription>These travel with the file. They are not a full audit of every printed cell.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm leading-6">
              {dataset.warnings.map((warning) => (
                <li key={`${warning.code}-${warning.message.slice(0, 24)}`} className="rounded-lg bg-muted px-3 py-2">
                  <span className="font-semibold">{warning.code}</span>
                  <span className="text-muted-foreground"> · {warning.severity}. </span>
                  {warning.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ReviewedPanel({ result }: { result: ReviewedExecution }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{result.planStatus === "plan" ? "Reviewed plan answer" : result.planStatus === "refused" ? "Refused" : result.planStatus === "needs_dataset" ? "Plan not executed" : "Reviewed plan"}</CardTitle>
        <CardDescription>{result.label}. Query executed: {result.executedQuery ? "yes" : "no"}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm leading-6">
        <p>{result.answer}</p>
        {result.assumptions.length > 0 ? (
          <ul className="list-disc pl-5">
            {result.assumptions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function WorkflowPanel({ result }: { result: WorkflowResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{result.status === "answered" ? "Baseline answer" : result.status === "needs_dataset" ? "No extract loaded" : result.status === "refused" ? "Refused" : "Not a supported question"}</CardTitle>
        <CardDescription>{result.baselineLabel}. AgentFoundry generated: no.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm leading-6">{result.answer}</p>
        {result.assumptions.length > 0 ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Assumptions recorded</p>
            <ul className="mt-1 list-disc pl-5 text-sm leading-6">
              {result.assumptions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}
        <details open className="rounded-lg bg-muted px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">Inspect the decision</summary>
          <ol className="mt-3 flex flex-col gap-2">
            {result.steps.map((step) => (
              <li key={step.title}>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="font-mono text-xs leading-5 break-all text-muted-foreground">{step.detail}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Rejected: {result.rejectedOperations.join(" ")}</p>
        </details>
      </CardContent>
    </Card>
  );
}

function EmptyDesk({ onPreview }: { onPreview: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center sm:px-8">
      <h2 className="font-serif text-2xl font-semibold">No official series is loaded</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        The official table stays empty until a manual import. It is not filled with a guessed national figure. The synthetic sample is a separate, labeled choice and does not write the official import.
      </p>
      <div className="mx-auto mt-6 max-w-xl rounded-lg border border-dashed border-border px-3 py-8 text-sm text-muted-foreground">
        Chart withheld. There is no loaded official series.
      </div>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button type="button" variant="outline" onClick={onPreview}>
          Preview synthetic sample
        </Button>
        <Button nativeButton={false} render={<Link href="/import" />}>
          How to import
        </Button>
      </div>
    </div>
  );
}

function rowsFor(
  dataset: EvidenceDataset,
  indicatorId: IndicatorId,
  managementId: ManagementId,
  geography: string,
  sort: SortMode,
): Row[] {
  const allowed = new Set(
    geography === "all-states"
      ? dataset.regions.map((region) => region.id)
      : geography === "india"
        ? ["india"]
        : [geography],
  );
  const rows: Row[] = dataset.cells
    .filter((cell) => cell.indicatorId === indicatorId && cell.managementId === managementId && allowed.has(cell.regionId))
    .map((cell) => {
      const region = dataset.regions.find((item) => item.id === cell.regionId);
      return {
        cell,
        name: region?.name ?? cell.regionId,
        role: region?.role ?? "state_ut",
        reportOrder: region?.reportOrder ?? 999,
      };
    });
  const india = rows.find((row) => row.role === "aggregate");
  let states = rows.filter((row) => row.role !== "aggregate");
  if (sort === "report" || geography !== "all-states") {
    states.sort((left, right) => left.reportOrder - right.reportOrder);
  } else {
    const measured = states.filter((row) => row.cell.interpretation === "measured_percentage" && row.cell.numeric != null);
    const rest = states.filter((row) => !measured.includes(row));
    const direction = sort === "value_asc" ? 1 : -1;
    measured.sort((left, right) => (left.cell.numeric! - right.cell.numeric!) * direction || left.reportOrder - right.reportOrder);
    rest.sort((left, right) => left.reportOrder - right.reportOrder);
    states = [...measured, ...rest];
  }
  if (geography === "all-states" && india) return [india, ...states];
  return geography === "india" && india ? [india] : states;
}
