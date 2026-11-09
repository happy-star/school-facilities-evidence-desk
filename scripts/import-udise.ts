import { importLocalBooklet } from "../src/server/import-booklet";
import { officialImportEnabled } from "../src/server/public-demo";

if (!officialImportEnabled()) {
  console.error("PUBLIC_DEMO=1 refuses official PDF import. Use the synthetic sample. poppler is not a sandbox.");
  process.exit(1);
}

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: npm run import -- /absolute/path/to/UDISE+2022-23-booklet.pdf");
  console.error("The app does not download the booklet. Pass a local file.");
  process.exit(1);
}

const result = await importLocalBooklet(pdfPath, { write: true });
if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result.summary, null, 2));
