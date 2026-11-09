import { lstat, mkdir, open, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildDataset } from "@/lib/build-dataset";
import { INDICATORS, type KnownPageKey } from "@/lib/catalog";
import {
  EXTRACTION_LOG_ROOT,
  KNOWN_PAGES,
  OFFICIAL_PDF_BYTES,
  OFFICIAL_PDF_PAGE_COUNT,
  OFFICIAL_SHA256,
} from "@/lib/official-source";
import { assertLocalPdfPath, extractPdfPage, PdfReadError, readPdfInfo, sha256File } from "@/server/pdf-text";

export type ImportResult =
  | {
      ok: true;
      summary: {
        mode: "government-data";
        statisticalYear: "2022-23";
        sha256: string;
        pdfCreationDateRaw: string | null;
        physicalPdfPages: number | null;
        cells: number;
        regions: number;
        tables: { tableId: string; physicalPage: number; role: string; sourceFooter: string }[];
        warnings: { code: string; severity: string; message: string }[];
        extractionLogDir: string;
        storedAt: string;
      };
    }
  | {
      ok: false;
      errors: { code: string; message: string }[];
      extractionLogDir: string | null;
    };

export async function importLocalBooklet(pdfPath: string, options: { write: boolean; logDir?: string }): Promise<ImportResult> {
  let logDir: string | null = null;
  try {
    assertLocalPdfPath(pdfPath);
    logDir = resolveLogDir(options.logDir);
    await mkdir(logDir, { recursive: true });

    const info = await lstat(pdfPath);
    if (!info.isFile()) {
      return refuse(logDir, [{ code: "not_regular_file", message: "Import reads a regular file. Symlinks, devices, and pipes are refused." }]);
    }
    if (info.size !== OFFICIAL_PDF_BYTES) {
      return refuse(logDir, [{
        code: "unexpected_file_size",
        message: `The recorded booklet is ${OFFICIAL_PDF_BYTES} bytes. This file is ${info.size} bytes and was not parsed.`,
      }]);
    }

    const header = await readHeader(pdfPath);
    if (!header.startsWith("%PDF")) {
      return refuse(logDir, [{ code: "not_a_pdf", message: "The file does not start with a PDF header. It was not parsed." }]);
    }

    const sha256 = await sha256File(pdfPath);
    if (sha256 !== OFFICIAL_SHA256) {
      return refuse(logDir, [{
        code: "hash_mismatch",
        message: "SHA-256 does not match the recorded official booklet. poppler was not run.",
      }]);
    }

    const pdfInfo = await readPdfInfo(pdfPath);
    if (pdfInfo.pages !== OFFICIAL_PDF_PAGE_COUNT) {
      return refuse(logDir, [{
        code: "unexpected_page_count",
        message: `pdfinfo reported ${pdfInfo.pages ?? "no"} pages. The recorded booklet has ${OFFICIAL_PDF_PAGE_COUNT}. Page text was not extracted.`,
      }]);
    }

    const pages = {} as Record<KnownPageKey, string>;
    for (const [key, page] of Object.entries(KNOWN_PAGES) as [KnownPageKey, number][]) {
      const text = await extractPdfPage(pdfPath, page);
      pages[key] = text;
      await writeFile(path.join(logDir, `${key}-p${page}.txt`), text);
    }

    const built = buildDataset({
      mode: "government-data",
      pages,
      sha256,
      importedAt: new Date().toISOString(),
      pdfCreationDateRaw: pdfInfo.creationDateRaw,
      physicalPdfPages: pdfInfo.pages,
      extractionLogDir: logDir,
    });
    if (!built.ok) {
      await writeFile(path.join(logDir, "errors.json"), JSON.stringify(built.errors, null, 2));
      return refuse(
        logDir,
        built.errors.map((item) => ({ code: item.code, message: item.message })),
      );
    }
    if (options.write) {
      if (built.dataset.mode !== "government-data") {
        return refuse(logDir, [{ code: "mode_refused", message: "Refusing to store anything other than government-data mode." }]);
      }
      const target = path.join(process.cwd(), "data", "imported", "udise-2022-23.json");
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(built.dataset));
      await rename(temporary, target);
    }
    const summary = {
      mode: "government-data" as const,
      statisticalYear: "2022-23" as const,
      sha256,
      pdfCreationDateRaw: pdfInfo.creationDateRaw,
      physicalPdfPages: pdfInfo.pages,
      cells: built.dataset.cells.length,
      regions: built.dataset.regions.length,
      tables: built.dataset.tables.map((table) => ({
        tableId: table.tableId,
        physicalPage: table.physicalPage,
        role: table.role,
        sourceFooter: table.sourceFooter,
      })),
      warnings: built.dataset.warnings.map((warning) => ({
        code: warning.code,
        severity: warning.severity,
        message: warning.message,
      })),
      extractionLogDir: logDir,
      storedAt: options.write ? path.join(process.cwd(), "data", "imported", "udise-2022-23.json") : "(not written)",
    };
    await writeFile(
      path.join(logDir, "summary.json"),
      JSON.stringify({ ...summary, indicators: INDICATORS.map((indicator) => indicator.id) }, null, 2),
    );
    return { ok: true, summary };
  } catch (error) {
    const code = error instanceof PdfReadError ? error.code : "import_failed";
    const message = error instanceof PdfReadError ? error.message : "Import failed before a dataset was saved.";
    return refuse(logDir, [{ code, message }]);
  }
}

function resolveLogDir(requested: string | undefined): string {
  const root = path.resolve(EXTRACTION_LOG_ROOT);
  const chosen = path.resolve(requested ?? path.join(root, stamp()));
  if (chosen !== root && !chosen.startsWith(`${root}${path.sep}`)) {
    throw new PdfReadError("log_dir_refused", "Extraction logs stay under the designated temporary directory.");
  }
  return chosen;
}

async function readHeader(pdfPath: string): Promise<string> {
  const handle = await open(pdfPath, "r");
  try {
    const header = Buffer.alloc(5);
    const { bytesRead } = await handle.read(header, 0, 5, 0);
    return header.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function refuse(logDir: string | null, errors: { code: string; message: string }[]): ImportResult {
  return { ok: false, errors, extractionLogDir: logDir };
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
