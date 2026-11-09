import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { runBaseline, SUPPORTED_QUESTIONS } from "@/lib/baseline";
import { buildDataset } from "@/lib/build-dataset";
import { cellsToCsv, cellsToJson } from "@/lib/export-dataset";
import { runQuery } from "@/lib/query";
import { acceptGovernmentDataset } from "@/lib/schema";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "fixtures/synthetic", name), "utf8");

function synthetic() {
  const built = buildDataset({
    mode: "synthetic-test",
    pages: {
      girlsPercent: fixture("girls-percentage.txt"),
      girlsCounts: fixture("girls-counts.txt"),
      girlsPercentContinuation: fixture("girls-continued.txt"),
    },
    sha256: null,
    importedAt: "2026-11-08T00:00:00.000Z",
    pdfCreationDateRaw: null,
    physicalPdfPages: null,
    extractionLogDir: null,
  });
  if (!built.ok) throw new Error(built.errors.map((item) => item.message).join("\n"));
  return built.dataset;
}

describe("deterministic baseline", () => {
  const dataset = synthetic();

  it("quotes a synthetic cell and labels it as not government data", () => {
    const result = runBaseline(
      "What percentage of schools in Kerala had functional girls toilets in 2022-23 for all management?",
      dataset,
    );
    expect(result.status).toBe("answered");
    expect(result.agentFoundryGenerated).toBe(false);
    expect(result.answer).toContain("SYNTHETIC TEST DATA");
    expect(result.answer).toContain("33");
    expect(result.answer).not.toContain("55.5");
    expect(result.cells[0]?.printed).toBe("33");
    expect(result.cells[0]?.sourceColumn).toBe(2);
  });

  it("does not invent a figure for a geography the fixture does not contain", () => {
    const result = runBaseline(
      "What percentage of schools in Arunachal Pradesh had functional girls toilets in 2022-23 for all management?",
      dataset,
    );
    expect(result.answer.toLowerCase()).toContain("no cell");
    expect(result.cells).toEqual([]);
  });

  it("refuses causal, forecast, cross-indicator, and student questions without a percentage", () => {
    const causal = runBaseline("Did toilet construction cause enrolment to rise in Kerala?", dataset);
    expect(causal.status).toBe("refused");
    expect(causal.answer).not.toContain("33");
    const forecast = runBaseline("What is the 2026 girls toilet percentage in Kerala?", dataset);
    expect(forecast.status).toBe("refused");
    expect(forecast.cells).toHaveLength(0);
    const gap = runBaseline("How many percentage points do girls toilets exceed boys toilets in Kerala?", dataset);
    expect(gap.status).toBe("refused");
    expect(gap.answer.toLowerCase()).toContain("denominator");
    const students = runBaseline("How many students lack a girls toilet in Kerala?", dataset);
    expect(students.status).toBe("refused");
  });

  it("reads a denominator-zero printed 0 as undefined and keeps the raw token", () => {
    const result = runBaseline(
      "How should a printed 0 for Andaman and Nicobar, Others, girls toilets be read?",
      dataset,
    );
    expect(result.status).toBe("answered");
    expect(result.answer.toLowerCase()).toContain("undefined");
    expect(result.answer.toLowerCase()).toContain("not described as a measured zero");
    const cell = result.cells.find((item) => item.managementId === "others");
    expect(cell?.interpretation).toBe("undefined_denominator_zero");
    expect(cell?.rawToken).toBe("0");
  });

  it("orders measured values and does not treat an undefined zero as the lowest", () => {
    const result = runBaseline(
      "Which state had the lowest printed percentage of functional girls toilets for others in 2022-23?",
      dataset,
    );
    expect(result.status).toBe("answered");
    expect(result.query?.excludeAggregate).toBe(true);
    expect(result.answer).toContain("Kerala");
    expect(result.cells[0]?.regionId).toBe("kerala");
    expect(result.cells[0]?.interpretation).toBe("measured_percentage");
    expect(result.omittedCells.some((cell) => cell.interpretation === "undefined_denominator_zero")).toBe(true);
    expect(result.cells.some((cell) => cell.regionId === "india")).toBe(false);
  });

  it("does not replace government total when the question names government", () => {
    const result = runBaseline("What is the government girls toilet percentage in Kerala in 2022-23?", dataset);
    expect(result.cells[0]?.managementId).toBe("government_total");
    expect(result.cells[0]?.printed).toBe("55.5");
    expect(result.assumptions.some((item) => item.toLowerCase().includes("parent aggregate"))).toBe(true);
  });

  it("explains the girls denominator without quoting a percentage", () => {
    const result = runBaseline("Explain the denominator for functional girls toilets.", null);
    expect(result.status).toBe("answered");
    expect(result.answer).toContain("7.4");
    expect(result.answer).toContain("7.5");
    expect(result.answer).not.toMatch(/\b\d{2}\.\d\b/);
  });

  it("returns needs-dataset instead of a number when nothing is loaded", () => {
    const result = runBaseline(SUPPORTED_QUESTIONS[0], null);
    expect(result.status).toBe("needs_dataset");
    expect(result.answer.toLowerCase()).toContain("no government extract");
    expect(result.answer).not.toMatch(/\b\d{2}\.\d\b/);
  });

  it("refuses to load a synthetic dataset as government data", () => {
    const accepted = acceptGovernmentDataset(dataset);
    expect(accepted.ok).toBe(false);
  });

  it("exports provenance and does not add a cross-indicator gap", () => {
    const queried = runQuery(dataset, {
      indicatorId: "functional_girls_toilet_pct",
      year: "2022-23",
      regionIds: ["kerala"],
      managementId: "all_management",
      order: "report",
      excludeAggregate: false,
    });
    expect(queried.ok).toBe(true);
    if (!queried.ok) return;
    const csv = cellsToCsv(dataset, queried.matched, "2026-11-08T00:00:00.000Z");
    expect(csv).toContain("source_sha256");
    expect(csv).toContain("percentage_source_footer");
    expect(csv).toContain("synthetic-not-official");
    expect(csv).toContain("33");
    expect(csv.toLowerCase()).not.toContain("gap");
    const json = JSON.parse(cellsToJson(dataset, queried.matched, "2026-11-08T00:00:00.000Z"));
    expect(json.provenance.statisticalYear).toBe("2022-23");
    expect(json.provenance.syntheticBanner).toMatch(/SYNTHETIC/);
    expect(json.rows[0].printed).toBe("33");
  });
});
