import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { promisify } from "node:util";

import { KNOWN_PAGE_NUMBERS } from "@/lib/official-source";

const execFileAsync = promisify(execFile);

const PARSER_TIMEOUT_MS = 20_000;
const PAGE_TEXT_MAX_BYTES = 1024 * 1024;
const INFO_MAX_BYTES = 256 * 1024;
/** Virtual memory cap for one poppler process. This is not a sandbox. */
const PARSER_ADDRESS_SPACE_BYTES = 1024 * 1024 * 1024;

export class PdfReadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PdfReadError";
  }
}

export function assertLocalPdfPath(pdfPath: string): void {
  if (pdfPath.includes("\0") || /[\r\n]/.test(pdfPath)) {
    throw new PdfReadError("path_refused", "The PDF path contains a control character.");
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(pdfPath) || pdfPath.startsWith("//")) {
    throw new PdfReadError("url_fetch_refused", "Import accepts a local file path only. URLs, including file://, are not fetched.");
  }
}

/** Child environment for poppler. Parent secrets are not copied. */
export function popplerEnv(source: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = { LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };
  if (source.PATH) env.PATH = source.PATH;
  return env;
}

/** Arguments for the one supported extractor. No shell, and no network tools. */
export function pdftotextArgs(pdfPath: string, page: number): string[] {
  assertLocalPdfPath(pdfPath);
  if (!KNOWN_PAGE_NUMBERS.has(page)) {
    throw new PdfReadError(
      "page_out_of_range",
      `Refusing to extract page ${page}. Only the known booklet pages are read.`,
    );
  }
  return ["-layout", "-f", String(page), "-l", String(page), "-nopgbrk", "-q", pdfPath, "-"];
}

export function pdfinfoArgs(pdfPath: string): string[] {
  assertLocalPdfPath(pdfPath);
  return ["-f", "0", "-l", "0", pdfPath];
}

export async function sha256File(pdfPath: string): Promise<string> {
  assertLocalPdfPath(pdfPath);
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(pdfPath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function readPdfHeader(pdfPath: string): Promise<string> {
  assertLocalPdfPath(pdfPath);
  const handle = await open(pdfPath, "r");
  try {
    const header = Buffer.alloc(5);
    const { bytesRead } = await handle.read(header, 0, 5, 0);
    return header.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

export async function readPdfInfo(pdfPath: string): Promise<{ pages: number | null; creationDateRaw: string | null }> {
  const stdout = await runPoppler("pdfinfo", pdfinfoArgs(pdfPath), INFO_MAX_BYTES);
  const pages = stdout.match(/^Pages:\s+(\d+)/m);
  const created = stdout.match(/^CreationDate:\s+(.+)$/m);
  return {
    pages: pages ? Number(pages[1]) : null,
    creationDateRaw: created ? created[1].trim() : null,
  };
}

export async function extractPdfPage(pdfPath: string, page: number): Promise<string> {
  const stdout = await runPoppler("pdftotext", pdftotextArgs(pdfPath, page), PAGE_TEXT_MAX_BYTES);
  if (!stdout.trim()) {
    throw new PdfReadError(
      "empty_page_text",
      `Page ${page} had no copyable text. This importer does not OCR scanned pages.`,
    );
  }
  return stdout;
}

let prlimitPath: string | null | undefined;

async function findPrlimit(): Promise<string | null> {
  if (prlimitPath !== undefined) return prlimitPath;
  try {
    await execFileAsync("prlimit", ["--version"], { timeout: 2000, env: popplerEnv() as NodeJS.ProcessEnv });
    prlimitPath = "prlimit";
  } catch {
    prlimitPath = null;
  }
  return prlimitPath;
}

async function runPoppler(tool: "pdfinfo" | "pdftotext", args: string[], maxBuffer: number): Promise<string> {
  const limiter = await findPrlimit();
  const command = limiter ?? tool;
  const commandArgs = limiter
    ? [`--as=${PARSER_ADDRESS_SPACE_BYTES}`, "--cpu=30", "--nofile=64", tool, ...args]
    : args;
  try {
    const { stdout } = await execFileAsync(command, commandArgs, {
      timeout: PARSER_TIMEOUT_MS,
      maxBuffer,
      env: popplerEnv() as NodeJS.ProcessEnv,
      killSignal: "SIGKILL",
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    throw toolError(tool, error);
  }
}

function toolError(tool: "pdfinfo" | "pdftotext", error: unknown): PdfReadError {
  if (error instanceof PdfReadError) return error;
  const failed = error as { code?: string; killed?: boolean; signal?: string };
  if (failed.code === "ENOENT") {
    return new PdfReadError(
      `${tool}_missing`,
      `${tool} is not installed. Install poppler-utils. This desk does not OCR.`,
    );
  }
  if (failed.killed || failed.signal === "SIGKILL" || failed.signal === "SIGTERM") {
    return new PdfReadError("parser_timeout", `${tool} exceeded its time limit and was stopped. Nothing was imported.`);
  }
  return new PdfReadError(`${tool}_failed`, `${tool} could not read the file. Nothing was imported.`);
}
