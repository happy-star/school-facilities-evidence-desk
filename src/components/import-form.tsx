"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OFFICIAL_SHA256, OFFICIAL_SOURCE_URL } from "@/lib/official-source";

type ImportResponse =
  | {
      ok: true;
      summary: {
        sha256: string;
        cells: number;
        regions: number;
        pdfCreationDateRaw: string | null;
        extractionLogDir: string;
        tables: { tableId: string; physicalPage: number; role: string; sourceFooter: string }[];
        warnings: { code: string; severity: string; message: string }[];
      };
    }
  | { ok: false; errors: { code: string; message: string }[]; extractionLogDir: string | null };

export function ImportForm({ loaded, problem }: { loaded: boolean; problem: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (String(data.get("url") ?? "").trim()) {
      setResult({
        ok: false,
        errors: [{ code: "url_fetch_refused", message: "This form does not fetch a URL. Choose the PDF from your computer." }],
        extractionLogDir: null,
      });
      return;
    }
    setPending(true);
    setTransportError(null);
    setResult(null);
    try {
      const response = await fetch("/api/import", { method: "POST", body: data });
      const payload = (await response.json()) as ImportResponse;
      setResult(payload);
      if (payload.ok) router.refresh();
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : "The import request failed before a dataset was saved.");
    } finally {
      setPending(false);
    }
  }

  async function clearImport() {
    setPending(true);
    setTransportError(null);
    try {
      const response = await fetch("/api/import/clear", { method: "POST" });
      if (!response.ok) {
        setTransportError("The local file could not be removed.");
      } else {
        setResult(null);
        router.refresh();
      }
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : "Clear failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="booklet">Local PDF</Label>
          <Input id="booklet" name="booklet" type="file" accept="application/pdf,.pdf" required />
        </div>
        <input type="hidden" name="url" value="" />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Checking the known layout…" : "Import for local validation"}</Button>
          {loaded ? (
            <Button type="button" variant="outline" disabled={pending} onClick={clearImport}>
              Remove local import
            </Button>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          The PDF is parsed on this machine and is not stored in the project. A structured extract is written to <span className="font-mono">data/imported/</span>, which is gitignored. Raw page text goes to a log directory outside the repository.
        </p>
      </form>

      {problem ? (
        <Alert variant="destructive">
          <AlertTitle>Current local file was rejected</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : null}
      {loaded && !problem ? (
        <Alert>
          <AlertTitle>An official extract is already on this machine</AlertTitle>
          <AlertDescription>The desk can read it. Removing it returns the empty state. The PDF itself was not kept.</AlertDescription>
        </Alert>
      ) : null}
      {transportError ? (
        <Alert variant="destructive">
          <AlertTitle>Import did not finish</AlertTitle>
          <AlertDescription>{transportError}</AlertDescription>
        </Alert>
      ) : null}
      {result && !result.ok ? (
        <Alert variant="destructive">
          <AlertTitle>Import refused</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 flex flex-col gap-1">
              {result.errors.map((error) => (
                <li key={`${error.code}-${error.message}`}>
                  <span className="font-semibold">{error.code}.</span> {error.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {result?.ok ? (
        <div className="rounded-xl bg-card p-4 text-sm leading-6 ring-1 ring-foreground/10">
          <h2 className="font-serif text-xl font-semibold">Import accepted</h2>
          <p className="mt-2">{result.summary.cells} cells across {result.summary.regions} geographies. SHA-256 matches the recorded booklet.</p>
          <p className="font-mono text-xs break-all">{result.summary.sha256}</p>
          {result.summary.pdfCreationDateRaw ? (
            <p className="mt-2">PDF CreationDate {result.summary.pdfCreationDateRaw}. That is file metadata, not the statistical year.</p>
          ) : null}
          <ul className="mt-3 flex flex-col gap-1">
            {result.summary.tables.map((table) => (
              <li key={`${table.tableId}-${table.role}`}>
                Table {table.tableId} ({table.role}), physical page {table.physicalPage}. {table.sourceFooter}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Raw extraction log, outside git: {result.summary.extractionLogDir}</p>
          <p className="mt-3">
            <Link className="font-semibold text-primary underline" href="/">Open the desk</Link>
          </p>
        </div>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">Expected SHA-256 {OFFICIAL_SHA256}. Citation URL, not fetched by the app: {OFFICIAL_SOURCE_URL}</p>
    </div>
  );
}
