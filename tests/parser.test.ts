import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildDataset } from "@/lib/build-dataset";
import { REGIONS } from "@/lib/catalog";
import { OFFICIAL_SHA256 } from "@/lib/official-source";
import { parseManagementPercentagePage } from "@/lib/parse-layout";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "fixtures/synthetic", name), "utf8");

function syntheticDataset() {
  return buildDataset({
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
}

describe("known percentage layout", () => {
  it("keeps wrapped Dadra & Nagar Haveli and Daman & Diu as one region", () => {
    const built = syntheticDataset();
    expect(built.ok, !built.ok ? built.errors.map((item) => item.message).join("\n") : "").toBe(true);
    if (!built.ok) return;
    const dadra = built.dataset.regions.find((region) => region.name === "Dadra & Nagar Haveli and Daman & Diu");
    expect(dadra).toBeTruthy();
    const cell = built.dataset.cells.find(
      (item) => item.regionId === dadra?.id && item.managementId === "all_management",
    );
    expect(cell?.printed).toBe("100");
    expect(cell?.sourceColumn).toBe(2);
  });

  it("maps nine values onto printed columns and does not invent column 8", () => {
    const built = syntheticDataset();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const india = (managementId: string) =>
      built.dataset.cells.find((cell) => cell.regionId === "india" && cell.managementId === managementId);
    expect(india("all_management")).toMatchObject({ printed: "11.1", sourceColumn: 2 });
    expect(india("government_total")).toMatchObject({ printed: "22.2", sourceColumn: 3 });
    expect(india("kvs")).toMatchObject({ printed: "10", sourceColumn: 4 });
    expect(india("nvs")).toMatchObject({ printed: "10", sourceColumn: 5 });
    expect(india("other_central_government")).toMatchObject({ printed: "10", sourceColumn: 6 });
    expect(india("state_government")).toMatchObject({ printed: "10", sourceColumn: 7 });
    expect(india("government_aided")).toMatchObject({ printed: "40", sourceColumn: 9 });
    expect(india("private_unaided_recognized")).toMatchObject({ printed: "10", sourceColumn: 10 });
    expect(india("others")).toMatchObject({ printed: "10", sourceColumn: 11 });
    expect(built.dataset.cells.some((cell) => cell.sourceColumn === 8)).toBe(false);
  });

  it("rejects a printed column (8) instead of shifting later columns", () => {
    const text = fixture("girls-percentage.txt").replace("(7) (9)", "(7) (8) (9)");
    const parsed = parseManagementPercentagePage(text, {
      tableId: "8.8",
      physicalPage: 159,
      topic: "girls",
    });
    expect(parsed.errors.some((item) => item.code === "unexpected_column_8")).toBe(true);
    expect(parsed.rows).toEqual([]);
  });

  it("rejects a short row instead of aligning by guesswork", () => {
    const text = fixture("girls-percentage.txt").replace("India 11.1 22.2 10 10 10 10 40 10 10", "India 11.1 22.2 10 10 10 10 40 10");
    const parsed = parseManagementPercentagePage(text, {
      tableId: "8.8",
      physicalPage: 159,
      topic: "girls",
    });
    expect(parsed.errors.some((item) => item.code === "column_alignment")).toBe(true);
  });

  it("rejects duplicate regions and out-of-range percentages", () => {
    const duplicate = fixture("girls-percentage.txt").replace(
      "Kerala 33 55.5 10 10 10 0 NA 12.5 0",
      "India 11.1 22.2 10 10 10 10 40 10 10\nKerala 33 55.5 10 10 10 0 NA 12.5 0",
    );
    const duplicated = parseManagementPercentagePage(duplicate, {
      tableId: "8.8",
      physicalPage: 159,
      topic: "girls",
    });
    expect(duplicated.errors.some((item) => item.code === "duplicate_region")).toBe(true);

    const ranged = fixture("girls-percentage.txt").replace("Kerala 33 ", "Kerala 140 ");
    const parsed = parseManagementPercentagePage(ranged, {
      tableId: "8.8",
      physicalPage: 159,
      topic: "girls",
    });
    expect(parsed.errors.some((item) => item.code === "percentage_out_of_range")).toBe(true);
  });

  it("preserves raw zero, marks denominator 0 as undefined, and leaves unconfirmed zeros alone", () => {
    const built = syntheticDataset();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const andaman = REGIONS.find((region) => region.name.startsWith("Andaman"));
    const andamanOthers = built.dataset.cells.find(
      (cell) => cell.regionId === andaman?.id && cell.managementId === "others",
    );
    expect(andamanOthers).toMatchObject({
      rawToken: "0",
      printed: "0",
      interpretation: "undefined_denominator_zero",
    });
    expect(andamanOthers?.counts).toMatchObject({ numerator: 0, denominator: 0 });
    expect(andamanOthers?.numeric).toBe(0);

    const keralaState = built.dataset.cells.find(
      (cell) => cell.regionId === "kerala" && cell.managementId === "state_government",
    );
    expect(keralaState).toMatchObject({
      printed: "0",
      interpretation: "zero_denominator_not_available",
      counts: null,
    });

    const keralaOthers = built.dataset.cells.find(
      (cell) => cell.regionId === "kerala" && cell.managementId === "others",
    );
    expect(keralaOthers).toMatchObject({
      printed: "0",
      interpretation: "measured_percentage",
    });
    expect(keralaOthers?.counts).toMatchObject({ numerator: 0, denominator: 2 });
  });

  it("keeps missing cells missing and does not fill them from the continuation page", () => {
    const built = syntheticDataset();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const missing = built.dataset.cells.find(
      (cell) => cell.regionId === "kerala" && cell.managementId === "government_aided",
    );
    expect(missing).toMatchObject({
      rawToken: "NA",
      printed: null,
      numeric: null,
      interpretation: "missing",
    });
    expect(missing?.corroboration?.raw).toBe("15");
    expect(missing?.corroboration?.matchesPrinted).toBe(false);
    expect(missing?.warnings.some((item) => item.code === "corroboration_not_used_to_fill_missing")).toBe(true);
  });

  it("does not replace government total with the sum of its components", () => {
    const built = syntheticDataset();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const total = built.dataset.cells.find(
      (cell) => cell.regionId === "kerala" && cell.managementId === "government_total",
    );
    expect(total?.printed).toBe("55.5");
    const parts = ["kvs", "nvs", "other_central_government", "state_government"].map((managementId) =>
      built.dataset.cells.find((cell) => cell.regionId === "kerala" && cell.managementId === managementId),
    );
    expect(parts.map((cell) => cell?.printed)).toEqual(["10", "10", "10", "0"]);
    expect(total?.printed).not.toBe("30");
  });

  it("flags the page 126 source footer and a corroboration mismatch without overwriting print", () => {
    const built = syntheticDataset();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.dataset.warnings.some((item) => item.code === "source_label_inconsistency")).toBe(true);
    expect(built.dataset.warnings.some((item) => item.message.includes("Source: UDISE+ 2020-2"))).toBe(true);
    const india = built.dataset.cells.find(
      (cell) => cell.regionId === "india" && cell.managementId === "all_management",
    );
    expect(india?.printed).toBe("11.1");
    expect(india?.roundedFromCounts).toBe("50.0");
    expect(india?.warnings.some((item) => item.code === "printed_differs_from_rounded_count")).toBe(true);
    expect(india?.warnings.some((item) => item.code === "corroboration_mismatch")).toBe(true);
    expect(built.dataset.mode).toBe("synthetic-test");
    expect(built.dataset.syntheticBanner).toMatch(/SYNTHETIC/);
  });

  it("refuses to label a partial or wrong-hash extract as government data", () => {
    const wrongHash = buildDataset({
      mode: "government-data",
      pages: {
        girlsPercent: fixture("girls-percentage.txt"),
        girlsCounts: fixture("girls-counts.txt"),
        girlsPercentContinuation: fixture("girls-continued.txt"),
      },
      sha256: "abc",
      importedAt: "2026-11-08T00:00:00.000Z",
      pdfCreationDateRaw: null,
      physicalPdfPages: 185,
      extractionLogDir: null,
    });
    expect(wrongHash.ok).toBe(false);
    if (!wrongHash.ok) {
      expect(wrongHash.errors.some((item) => item.code === "hash_mismatch")).toBe(true);
    }

    const officialHashPartial = buildDataset({
      mode: "government-data",
      pages: {
        girlsPercent: fixture("girls-percentage.txt"),
        girlsCounts: fixture("girls-counts.txt"),
        girlsPercentContinuation: fixture("girls-continued.txt"),
        boysPercent: fixture("girls-percentage.txt"),
        boysCounts: fixture("girls-counts.txt"),
        boysPercentContinuation: fixture("girls-continued.txt"),
        cwsnPercent: fixture("girls-percentage.txt"),
        cwsnCounts: fixture("girls-counts.txt"),
        cwsnPercentContinuation: fixture("girls-continued.txt"),
      },
      sha256: OFFICIAL_SHA256,
      importedAt: "2026-11-08T00:00:00.000Z",
      pdfCreationDateRaw: null,
      physicalPdfPages: 185,
      extractionLogDir: null,
    });
    expect(officialHashPartial.ok).toBe(false);
  });

  it("knows India plus 36 states and UTs", () => {
    expect(REGIONS).toHaveLength(37);
    expect(REGIONS.filter((region) => region.role === "state_ut")).toHaveLength(36);
    expect(REGIONS[0]).toMatchObject({ id: "india", role: "aggregate" });
  });
});
