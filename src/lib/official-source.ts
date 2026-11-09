/**
 * Identity of the single official booklet this desk knows how to read.
 * The URL is a citation. Nothing in the app fetches it.
 */

export const DATASET_ID = "udise-plus-2022-23-booklet";
export const STATISTICAL_YEAR = "2022-23" as const;
export const PARSER_VERSION = "1.0.0";

export const OFFICIAL_SOURCE_URL =
  "https://dashboard.udiseplus.gov.in/report-new-v.6-demo2025/static/media/UDISE+2022_23_Booklet_existing.d209e7c7516d77939da9.pdf";

/** SHA-256 of the one internal copy described in the data spec. */
export const OFFICIAL_SHA256 =
  "59884f936772bc79ac7f007ae0f8330311c85b4f5cf748d6834672c0be8f08e6";

export const OFFICIAL_PDF_PAGE_COUNT = 185;

/** Byte length of the recorded booklet. Anything else is refused before poppler runs. */
export const OFFICIAL_PDF_BYTES = 12_786_598;

/**
 * PDF creation metadata recorded for that copy. It is not the statistical year.
 * Import stores whatever pdfinfo prints; this constant is the expected value.
 */
export const EXPECTED_PDF_CREATION_DATE = "Mon Dec 30 09:41:36 2024 UTC";

export const KNOWN_PAGES = {
  boysCounts: 124,
  boysPercentContinuation: 125,
  girlsCounts: 126,
  girlsPercentContinuation: 127,
  cwsnCounts: 136,
  cwsnPercentContinuation: 137,
  girlsPercent: 159,
  boysPercent: 160,
  cwsnPercent: 161,
} as const;

export type KnownPageKey = keyof typeof KNOWN_PAGES;

export const KNOWN_PAGE_NUMBERS: ReadonlySet<number> = new Set(Object.values(KNOWN_PAGES));

export const EXTRACTION_LOG_ROOT = "/tmp/school-facilities-evidence-desk/extraction";

export const IMPORT_RELATIVE_PATH = "data/imported/udise-2022-23.json";

export const HISTORICAL_STATEMENT =
  "All figures are from the historical statistical year 2022-23. They are not a current or 2026 status. The PDF file's creation timestamp is not the statistical year.";
