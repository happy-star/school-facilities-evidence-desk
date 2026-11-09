"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { indicatorById, managementById } from "@/lib/catalog";
import { cellsToCsv, cellsToJson } from "@/lib/export-dataset";
import type { EvidenceCell, EvidenceDataset } from "@/lib/schema";

export type SortMode = "report" | "value_asc" | "value_desc";

type Row = {
  cell: EvidenceCell;
  name: string;
  role: "aggregate" | "state_ut";
  reportOrder: number;
};

export function EvidenceView({
  dataset,
  rows,
  sort,
  onSort,
  filter,
  onFilter,
}: {
  dataset: EvidenceDataset;
  rows: Row[];
  sort: SortMode;
  onSort: (sort: SortMode) => void;
  filter: string;
  onFilter: (value: string) => void;
}) {
  const filtered = rows.filter((row) => row.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const indicator = indicatorById(filtered[0]?.cell.indicatorId ?? rows[0]?.cell.indicatorId ?? "");
  const management = managementById(filtered[0]?.cell.managementId ?? rows[0]?.cell.managementId ?? "");
  const sample = filtered[0]?.cell ?? rows[0]?.cell;
  const undefinedRows = filtered.filter((row) => row.cell.interpretation === "undefined_denominator_zero");
  const measured = filtered.filter((row) => row.role !== "aggregate" && chartable(row.cell));
  const india = filtered.find((row) => row.role === "aggregate");

  function download(kind: "csv" | "json") {
    const cells = filtered.map((row) => row.cell);
    const exportedAt = new Date().toISOString();
    const contents = kind === "csv" ? cellsToCsv(dataset, cells, exportedAt) : cellsToJson(dataset, cells, exportedAt);
    const blob = new Blob([contents], { type: kind === "csv" ? "text/csv;charset=utf-8" : "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const syntheticFile = dataset.mode === "synthetic-test";
    anchor.href = url;
    anchor.download = syntheticFile
      ? kind === "csv" ? "synthetic-sample-not-government.csv" : "synthetic-sample-not-government.json"
      : kind === "csv" ? "udise-2022-23-school-facilities.csv" : "udise-2022-23-school-facilities.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      {dataset.syntheticBanner ? (
        <p role="status" className="rounded-lg border-2 border-[#8a5a00] bg-[#f8efd8] px-4 py-3 text-sm font-semibold leading-6 text-[#3f2a00]">
          Synthetic sample — not official India statistics. {dataset.syntheticBanner}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">What the denominator is</CardTitle>
          <CardDescription>{indicator?.label}. {management?.label}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-6">
          <p>{indicator?.population}</p>
          <p>{indicator?.numerator}</p>
          <p>
            Counts for the broad groups are in table {indicator?.countTableId}, physical page {indicator?.countPhysicalPage}, with a percentage continuation on page {indicator?.countContinuationPage}. Headline percentages are table {indicator?.tableId}, physical page {indicator?.physicalPage}.
            {indicator?.topic === "girls" ? " Girls evidence is table 7.4, not table 7.5." : ""}
          </p>
          <p>{management?.note}</p>
          {sample?.counts && filtered.length === 1 ? (
            <p>
              Published counts for this cell: numerator {sample.counts.numeratorRaw} (column {sample.counts.numeratorColumn}), denominator {sample.counts.denominatorRaw} (column {sample.counts.denominatorColumn}), footer {sample.counts.countSourceFooter}.
            </p>
          ) : (
            <p>Each geography has its own denominator. A state percentage is not India&apos;s percentage, and India&apos;s denominator is not applied to the states.</p>
          )}
          {!management?.broad ? <p>This management is not broken out in the detailed count table, so the desk does not turn the percentage back into a school count.</p> : null}
        </CardContent>
      </Card>

      {undefinedRows.length > 0 ? (
        <p className="rounded-lg border border-[#e2c48a] bg-[#f8efd8] px-3 py-2 text-sm leading-6 text-[#6d4a10]">
          {undefinedRows.length} {undefinedRows.length === 1 ? "cell in this view is" : "cells in this view are"} undefined because the published denominator is 0. The raw printed token is kept. {undefinedRows.length === 1 ? "It is" : "They are"} not charted as 0%.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <SortButton current={sort} value="report" onSort={onSort}>Report order</SortButton>
          <SortButton current={sort} value="value_asc" onSort={onSort}>Low to high</SortButton>
          <SortButton current={sort} value="value_desc" onSort={onSort}>High to low</SortButton>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            placeholder="Filter geographies"
            aria-label="Filter geographies"
            className="sm:w-56"
          />
          <Button type="button" variant="outline" onClick={() => download("csv")} disabled={filtered.length === 0}>CSV</Button>
          <Button type="button" variant="outline" onClick={() => download("json")} disabled={filtered.length === 0}>JSON</Button>
        </div>
      </div>

      <ComparisonChart india={india ?? null} states={measured} synthetic={dataset.mode === "synthetic-test"} />

      <div className="rounded-xl bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Geography</TableHead>
              <TableHead>Printed</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Denominator</TableHead>
              <TableHead>Numerator</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>No geography matches that filter.</TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={`${row.cell.regionId}-${row.cell.managementId}`}>
                  <TableCell>
                    <span className="font-medium">{row.name}</span>
                    {row.role === "aggregate" ? <Badge variant="outline" className="ml-2">Aggregate</Badge> : null}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{printedText(row.cell)}</TableCell>
                  <TableCell className="max-w-xs text-sm">{readingText(row.cell)}</TableCell>
                  <TableCell className="font-mono text-sm" title={row.cell.counts?.denominatorRaw}>
                    {row.cell.counts ? groupCount(row.cell.counts.denominatorRaw) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm" title={row.cell.counts?.numeratorRaw}>
                    {row.cell.counts ? groupCount(row.cell.counts.numeratorRaw) : "—"}
                  </TableCell>
                  <TableCell className="text-xs leading-5">
                    Table {row.cell.percentageTableId}, p. {row.cell.percentagePhysicalPage}, col. ({row.cell.sourceColumn})
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {sample ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {sample.percentageSourceFooter}. Physical page {sample.percentagePhysicalPage}. SHA-256 {dataset.source.sha256}. The URL is a citation only: {dataset.source.url}. PDF creation metadata{dataset.source.pdfCreationDateRaw ? ` (${dataset.source.pdfCreationDateRaw})` : ""} is not the statistical year.
        </p>
      ) : null}
    </div>
  );
}

function ComparisonChart({ india, states, synthetic }: { india: Row | null; states: Row[]; synthetic: boolean }) {
  const bars = [...(india && chartable(india.cell) ? [india] : []), ...states];
  return (
    <figure className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <figcaption className="mb-3 text-sm leading-6">
        <span className="font-serif text-lg font-semibold">{synthetic ? "Synthetic sample chart" : "Descriptive chart"}</span>
        <span className="mt-1 block text-muted-foreground">
          {synthetic ? "SYNTHETIC SAMPLE. Not official India statistics. " : ""}
          Bar length is the printed number on a 0 to 100 scale. It is not a second official statistic. Undefined and missing cells are left off the chart.
        </span>
      </figcaption>
      {bars.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">No measured percentage in this view. Nothing is drawn as zero to fill the gap.</p>
      ) : (
        <ul className="flex max-h-[32rem] flex-col gap-1.5 overflow-auto pr-1">
          {bars.map((row) => (
            <li key={row.cell.regionId} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-2 text-xs sm:text-sm">
              <span className={row.role === "aggregate" ? "truncate font-semibold" : "truncate"}>{row.name}</span>
              <span className="h-2.5 rounded-full bg-secondary">
                <span
                  className={row.role === "aggregate" ? "block h-2.5 rounded-full bg-[#243056]" : "block h-2.5 rounded-full bg-primary"}
                  style={{ width: `${Math.max(0, Math.min(100, row.cell.numeric ?? 0))}%` }}
                />
              </span>
              <span className="font-mono">{row.cell.printed}%</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function SortButton({
  current,
  value,
  onSort,
  children,
}: {
  current: SortMode;
  value: SortMode;
  onSort: (sort: SortMode) => void;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" size="sm" variant={current === value ? "default" : "outline"} onClick={() => onSort(value)}>
      {children}
    </Button>
  );
}

function chartable(cell: EvidenceCell): boolean {
  return cell.interpretation === "measured_percentage" && cell.numeric != null && cell.counts?.denominator !== 0;
}

function printedText(cell: EvidenceCell): string {
  if (cell.interpretation === "missing") return "missing";
  if (cell.interpretation === "undefined_denominator_zero") return "undefined";
  return cell.printed ? `${cell.printed}%` : cell.rawToken;
}

function readingText(cell: EvidenceCell): string {
  switch (cell.interpretation) {
    case "measured_percentage":
      return cell.numeric === 0 ? "Measured 0%. The denominator is above zero." : "Measured printed percentage.";
    case "undefined_denominator_zero":
      return `Undefined. Printed token ${cell.rawToken}; denominator 0.`;
    case "zero_denominator_not_available":
      return "Printed 0. This management has no published denominator, so it is not confirmed as a measured zero and it is not marked missing.";
    case "missing":
      return "Missing. Not imputed.";
  }
}

function groupCount(raw: string): string {
  if (!/^\d+$/.test(raw)) return raw;
  return Number(raw).toLocaleString("en-US");
}

export type { Row };
