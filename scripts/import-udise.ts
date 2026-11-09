import { officialImportEnabled, publicDemoImportRefusal } from "../src/server/public-demo";

/**
 * Public entry point. PUBLIC_RELEASE_LOCK is hardcoded, so this process
 * refuses before it reads argv as a file, loads the booklet parser, or
 * starts poppler. The official importer is intentionally not imported here.
 */
const refusal = publicDemoImportRefusal();
if (!officialImportEnabled()) {
  for (const error of refusal.errors) {
    console.error(error.message);
  }
  process.exit(1);
}

console.error("This public build does not accept a PDF upload and does not read an official extract.");
process.exit(1);
