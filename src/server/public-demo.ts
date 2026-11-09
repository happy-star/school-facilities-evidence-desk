/**
 * Private source keeps this false so a manual booklet import still works.
 * The public snapshot build sets it to true. That lock does not read the
 * environment, so a container flag cannot turn official import back on.
 */
export const PUBLIC_RELEASE_LOCK = true;

/** A prospective public demo sets PUBLIC_DEMO=1 so the PDF upload is refused. Unset keeps the private manual import. */
export function officialImportEnabled(): boolean {
  if (PUBLIC_RELEASE_LOCK) return false;
  return process.env.PUBLIC_DEMO !== "1" && process.env.PUBLIC_RELEASE !== "1";
}

/** The public snapshot never reads a mounted official extract. */
export function officialStoreReadable(): boolean {
  if (PUBLIC_RELEASE_LOCK) return false;
  return process.env.PUBLIC_RELEASE !== "1";
}

export function publicDemoImportRefusal(): {
  ok: false;
  errors: { code: string; message: string }[];
  extractionLogDir: null;
} {
  const message = PUBLIC_RELEASE_LOCK
    ? "This public build does not accept a PDF upload and does not read an official extract. Use the synthetic sample on the desk. The MIT licence does not cover the UDISE+ booklet or official statistics."
    : "This process is in public-demo mode. It does not accept a PDF upload. Use the synthetic sample on the desk. An official booklet stays a separate manual import, and poppler is not a sandbox.";
  return {
    ok: false,
    errors: [{ code: "public_demo_import_disabled", message }],
    extractionLogDir: null,
  };
}
