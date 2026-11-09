import { closeSync, ftruncateSync, openSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { buildDataset } from "@/lib/build-dataset";
import { cellsToCsv } from "@/lib/export-dataset";
import { OFFICIAL_PDF_BYTES, OFFICIAL_SHA256 } from "@/lib/official-source";
import { runQuery } from "@/lib/query";
import { acceptGovernmentDataset } from "@/lib/schema";
import { importLocalBooklet } from "@/server/import-booklet";
import { pdftotextArgs, popplerEnv } from "@/server/pdf-text";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "fixtures/synthetic", name), "utf8");
const scratch = await mkdtemp(path.join(tmpdir(), "evidence-desk-security-"));

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

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

describe("import bounds", () => {
  it("refuses a file URL before any parse", async () => {
    const result = await importLocalBooklet("file:///etc/passwd", { write: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === "url_fetch_refused")).toBe(true);
  });

  it("refuses a short PDF by size and does not claim a hash match", async () => {
    const file = path.join(scratch, "short.pdf");
    writeFileSync(file, "%PDF-1.7\nnot the booklet");
    const result = await importLocalBooklet(file, { write: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toEqual(["unexpected_file_size"]);
    }
  });

  it("refuses an exact-length file with the wrong hash before poppler", async () => {
    const file = path.join(scratch, "wrong-hash.pdf");
    const handle = openSync(file, "w");
    writeFileSync(handle, Buffer.from("%PDF-"));
    ftruncateSync(handle, OFFICIAL_PDF_BYTES);
    closeSync(handle);
    const result = await importLocalBooklet(file, { write: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toEqual(["hash_mismatch"]);
      expect(result.errors[0]?.message).toContain("poppler was not run");
    }
  });

  it("refuses a symlink", async () => {
    const target = path.join(scratch, "target.pdf");
    writeFileSync(target, "%PDF-");
    const link = path.join(scratch, "link.pdf");
    symlinkSync(target, link);
    const result = await importLocalBooklet(link, { write: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === "not_regular_file")).toBe(true);
  });

  it("refuses an extraction log directory outside the temporary root", async () => {
    const result = await importLocalBooklet(path.join(scratch, "missing.pdf"), {
      write: false,
      logDir: "/tmp",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === "log_dir_refused")).toBe(true);
  });

  it("refuses a page that is not one of the known booklet pages", () => {
    expect(() => pdftotextArgs("/tmp/local-booklet.pdf", 1)).toThrow(/known booklet pages/);
  });
});

describe("process and export boundaries", () => {
  it("does not pass provider secrets to poppler", () => {
    const env = popplerEnv({
      PATH: "/usr/bin",
      OPENAI_API_KEY: "sk-test-secret",
      ANTHROPIC_API_KEY: "provider-test-value",
      AWS_SECRET_ACCESS_KEY: "secret",
      HOME: "/home/someone",
    });
    expect(env.PATH).toBe("/usr/bin");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.HOME).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain("sk-test-secret");
  });

  it("prefixes spreadsheet formula characters in CSV cells", () => {
    const dataset = synthetic();
    dataset.cells[0] = {
      ...dataset.cells[0],
      percentageSourceFooter: '=HYPERLINK("http://evil.example","click")',
      rawToken: "+1",
      printed: "+1",
    };
    const csv = cellsToCsv(dataset, [dataset.cells[0]], "2026-11-08T00:00:00.000Z");
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain(`"'+1"`);
    expect(csv.split("\n").some((line) => line.split(",").some((field) => /^=/.test(field) || /^\+/.test(field)))).toBe(false);
  });
});

describe("query and stored-file integrity", () => {
  it("rejects an indicator and an order outside the allowlist", () => {
    const dataset = synthetic();
    const unknown = runQuery(dataset, {
      indicatorId: "enrolment" as never,
      year: "2022-23",
      regionIds: ["kerala"],
      managementId: "all_management",
      order: "report",
      excludeAggregate: false,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe("unknown_indicator");

    const order = runQuery(dataset, {
      indicatorId: "functional_girls_toilet_pct",
      year: "2022-23",
      regionIds: ["kerala"],
      managementId: "all_management",
      order: "subtract" as never,
      excludeAggregate: false,
    });
    expect(order.ok).toBe(false);
    if (!order.ok) expect(order.code).toBe("unknown_order");
  });

  it("does not order a zero denominator as a measured zero", () => {
    const dataset = synthetic();
    const andaman = dataset.regions.find((region) => region.name.startsWith("Andaman"));
    expect(andaman).toBeTruthy();
    for (const cell of dataset.cells) {
      if (cell.regionId === andaman?.id && cell.managementId === "others") {
        cell.interpretation = "measured_percentage";
        cell.numeric = 0;
        cell.printed = "0";
      }
    }
    const result = runQuery(dataset, {
      indicatorId: "functional_girls_toilet_pct",
      year: "2022-23",
      regionIds: dataset.regions.map((region) => region.id),
      managementId: "others",
      order: "printed_asc",
      excludeAggregate: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.displayed.some((cell) => cell.regionId === andaman?.id)).toBe(false);
    expect(result.omittedFromOrder.some((cell) => cell.regionId === andaman?.id)).toBe(true);
  });

  it("rejects a government file that marks denominator 0 as measured or cites the wrong page", () => {
    const dataset = structuredClone(synthetic());
    dataset.mode = "government-data";
    dataset.syntheticBanner = null;
    dataset.source.sha256 = OFFICIAL_SHA256;
    dataset.source.url = "https://example.invalid/citation-only";
    const tampered = structuredClone(dataset);
    const zero = tampered.cells.find((cell) => cell.counts?.denominator === 0);
    expect(zero).toBeTruthy();
    if (zero) {
      zero.interpretation = "measured_percentage";
      zero.numeric = 0;
      zero.printed = "0";
    }
    const rejected = acceptGovernmentDataset(tampered);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.message).toContain("denominator 0");

    const wrongPage = structuredClone(dataset);
    wrongPage.cells[0].percentagePhysicalPage = 1;
    const pageRejected = acceptGovernmentDataset(wrongPage);
    expect(pageRejected.ok).toBe(false);
    if (!pageRejected.ok) expect(pageRejected.message).toContain("page");
  });
});
