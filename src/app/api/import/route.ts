import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";

import { OFFICIAL_PDF_BYTES } from "@/lib/official-source";
import { importLocalBooklet } from "@/server/import-booklet";
import { officialImportEnabled, publicDemoImportRefusal } from "@/server/public-demo";

export async function POST(request: Request) {
  await connection();
  if (!officialImportEnabled()) {
    return Response.json(publicDemoImportRefusal(), { status: 403 });
  }
  const form = await request.formData();
  const url = String(form.get("url") ?? "").trim();
  if (url) {
    return Response.json({
      ok: false,
      errors: [{ code: "url_fetch_refused", message: "URLs are not fetched. Choose a local PDF." }],
      extractionLogDir: null,
    });
  }
  const booklet = form.get("booklet");
  if (!(booklet instanceof File)) {
    return Response.json({
      ok: false,
      errors: [{ code: "file_missing", message: "Choose the official PDF on this computer." }],
      extractionLogDir: null,
    });
  }
  if (booklet.size !== OFFICIAL_PDF_BYTES) {
    return Response.json({
      ok: false,
      errors: [{
        code: "unexpected_file_size",
        message: `The recorded booklet is ${OFFICIAL_PDF_BYTES} bytes. This upload is ${booklet.size} bytes and was not parsed.`,
      }],
      extractionLogDir: null,
    });
  }
  const bytes = Buffer.from(await booklet.arrayBuffer());
  if (bytes.length !== OFFICIAL_PDF_BYTES) {
    return Response.json({
      ok: false,
      errors: [{ code: "unexpected_file_size", message: "The uploaded byte length does not match the recorded booklet. It was not parsed." }],
      extractionLogDir: null,
    });
  }
  if (!bytes.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
    return Response.json({
      ok: false,
      errors: [{ code: "not_a_pdf", message: "That file does not start with a PDF header. This importer does not OCR other formats." }],
      extractionLogDir: null,
    });
  }
  const directory = "/tmp/school-facilities-evidence-desk";
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `upload-${randomBytes(8).toString("hex")}.pdf`);
  await writeFile(temporary, bytes);
  try {
    const result = await importLocalBooklet(temporary, { write: true });
    return Response.json(result);
  } finally {
    await rm(temporary, { force: true });
  }
}
