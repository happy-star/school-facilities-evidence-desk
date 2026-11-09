import { Suspense } from "react";
import { connection } from "next/server";

import { ImportForm } from "@/components/import-form";
import { Shell } from "@/components/shell";
import { OFFICIAL_PDF_PAGE_COUNT, OFFICIAL_SHA256, OFFICIAL_SOURCE_URL } from "@/lib/official-source";
import { officialImportEnabled } from "@/server/public-demo";
import { readStoredDataset } from "@/server/store";

export const metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <Shell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking the local import folder…</p>}>
        <ImportGate />
      </Suspense>
    </Shell>
  );
}

async function ImportGate() {
  await connection();
  const stored = await readStoredDataset();
  if (!officialImportEnabled()) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">PDF upload is off in this demo</h1>
        <p className="text-sm leading-6">
          Public-demo mode does not accept a PDF. poppler is not a sandbox, and this demo does not take an untrusted upload. Use the synthetic sample on the desk. That sample is invented and does not replace an official import. An official booklet stays a separate manual step on a private machine, with <span className="font-mono">PUBLIC_DEMO</span> unset.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Import the one known booklet</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          This path reads the copyable text of the UDISE+ 2022–23 booklet, tables 8.8, 8.9, and 8.10, plus the count pages that explain their denominators. It is not a general PDF reader and it does not OCR scans. It does not download the file.
        </p>
      </div>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-6">
        <li>Download the official booklet yourself. Opening the citation below is your browser, not this app.</li>
        <li>Check the SHA-256. A different hash is refused, so a chart cannot be labelled official by mistake.</li>
        <li>Import the local PDF here, or run <span className="font-mono">npm run import -- /absolute/path/to/the-booklet.pdf</span>.</li>
      </ol>
      <p className="text-sm leading-6">
        <a className="font-semibold text-primary underline" href={OFFICIAL_SOURCE_URL} rel="noreferrer">
          Official booklet URL
        </a>
        <span className="mt-1 block font-mono text-xs break-all text-muted-foreground">{OFFICIAL_SOURCE_URL}</span>
      </p>
      <p className="text-sm leading-6">
        Expected SHA-256 <span className="font-mono text-xs break-all">{OFFICIAL_SHA256}</span>. The recorded file has {OFFICIAL_PDF_PAGE_COUNT} pages. Its creation timestamp is not the statistical year.
      </p>
      <ImportForm loaded={stored.status === "ready"} problem={stored.status === "invalid" ? stored.message : null} />
      <div className="rounded-xl bg-muted px-4 py-3 text-sm leading-6">
        <p className="font-semibold">Command-line import</p>
        <p className="mt-1 font-mono text-xs">npm run import -- /absolute/path/to/UDISE+2022_23_Booklet.pdf</p>
        <p className="mt-2 text-muted-foreground">Requires poppler-utils (<span className="font-mono">pdftotext</span> and <span className="font-mono">pdfinfo</span>) on the machine that runs the import. The dev server does not call them until you import.</p>
      </div>
    </div>
  );
}
