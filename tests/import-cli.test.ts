import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const guard = path.join(root, "tests", "helpers", "sentinel-fs-guard.cjs");
const sentinel = "/tmp/school-facilities-evidence-desk-sentinel-do-not-open.pdf";
const refusal =
  "This public build does not accept a PDF upload and does not read an official extract. Use the synthetic sample on the desk. The MIT licence does not cover the UDISE+ booklet or official statistics.";

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.PUBLIC_DEMO;
  delete env.PUBLIC_RELEASE;
  env.SENTINEL_PDF_PATH = sentinel;
  env.NODE_OPTIONS = [env.NODE_OPTIONS, `--require ${guard}`].filter(Boolean).join(" ");
  return env;
}

describe("npm run import", () => {
  it("guard notices an open of the sentinel before the real call", () => {
    const result = spawnSync(
      process.execPath,
      ["-e", "require('node:fs').openSync(process.env.SENTINEL_PDF_PATH, 'r')"],
      { env: childEnv(), encoding: "utf8" },
    );
    expect(result.status).toBe(97);
    expect(result.stderr).toContain("SENTINEL_OPENED openSync");
  });

  it("exits with the public-release refusal and does not open a sentinel path", () => {
    expect(existsSync(sentinel)).toBe(false);
    const result = spawnSync("npm", ["run", "import", "--", sentinel], {
      cwd: root,
      env: childEnv(),
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(refusal);
    expect(result.stderr).not.toContain("SENTINEL_OPENED");
    expect(result.stderr).not.toContain("Transform failed");
    expect(result.stderr).not.toContain("ENOENT");
    expect(result.stderr).not.toContain("poppler");
    expect(`${result.stdout}${result.stderr}`).not.toContain("PUBLIC_DEMO=1 refuses");
    expect(existsSync(sentinel)).toBe(false);
  });

  it("refuses with no path argument before any usage or parser startup", () => {
    const result = spawnSync("npm", ["run", "import"], {
      cwd: root,
      env: childEnv(),
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(refusal);
    expect(result.stderr).not.toContain("SENTINEL_OPENED");
    expect(result.stderr).not.toContain("Usage:");
  });
});
