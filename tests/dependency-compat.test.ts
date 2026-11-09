import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { clearCaches, parseAndGenerateServices } from "@typescript-eslint/typescript-estree";

/**
 * typescript-eslint 8.72.1 calls minimatch in one place:
 * useProgramFromProjectService.js filePathMatchedBy(relativePath, allowDefaultProject)
 * with options `{ dot: true }` only. These tests drive that path through
 * parseAndGenerateServices. They do not call minimatch() directly.
 *
 * Passing lint on this repo does not exercise the path: eslint-config-next's
 * TypeScript block does not enable projectService.
 */

const SHADCN_TAILWIND_SHA256 = "4c371f7a1ff5d219ae2f7ff28bd256b4346fd546fe46fbae22092e57db2f0fae";

const root = mkdtempSync(path.join(tmpdir(), "allow-default-project-"));

function write(relativePath: string, text: string) {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

write(
  "tsconfig.json",
  JSON.stringify({
    compilerOptions: {
      strict: true,
      target: "ES2022",
      module: "esnext",
      moduleResolution: "bundler",
      noEmit: true,
      skipLibCheck: true,
    },
    include: ["included.ts"],
  }),
);
write("included.ts", "export const value = 1;\n");
write("outside.ts", "export const value = 2;\n");
write(".hidden.ts", "export const value = 3;\n");
write("scripts/loose.ts", "export const value = 4;\n");
write("scripts/.dot.ts", "export const value = 5;\n");

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  clearCaches();
});

function parseRelative(relativePath: string, allowDefaultProject: string[]) {
  const file = path.join(root, relativePath);
  return parseAndGenerateServices(readFileSync(file, "utf8"), {
    filePath: file,
    tsconfigRootDir: root,
    loc: true,
    range: true,
    projectService: {
      allowDefaultProject,
      defaultProject: "tsconfig.json",
    },
  });
}

function refusal(relativePath: string, allowDefaultProject: string[]): string | null {
  try {
    parseRelative(relativePath, allowDefaultProject);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("typescript-eslint allowDefaultProject on the installed minimatch", () => {
  it("resolves 11.0.5 only under typescript-estree and leaves ESLint on 3.1.5", () => {
    const estree = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          "node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch/package.json",
        ),
        "utf8",
      ),
    ) as { version: string };
    const eslintCopy = JSON.parse(
      readFileSync(path.join(process.cwd(), "node_modules/minimatch/package.json"), "utf8"),
    ) as { version: string };
    expect(estree.version).toBe("11.0.5");
    expect(eslintCopy.version).toBe("3.1.5");
  });

  it("types a tsconfig member that is not on the allow list", () => {
    const result = parseRelative("included.ts", ["outside.ts"]);
    expect(result.services.program).toBeTruthy();
  });

  it("refuses a tsconfig member that the allow list also matches", () => {
    const message = refusal("included.ts", ["included.ts"]);
    expect(message).toContain("was included by allowDefaultProject but also was found in the project service");
  });

  it("accepts an exact relative path and a second pattern", () => {
    expect(parseRelative("outside.ts", ["outside.ts"]).services.program).toBeTruthy();
    expect(parseRelative("outside.ts", ["nope.ts", "outside.ts"]).services.program).toBeTruthy();
  });

  it("lets * match a file in the root, including a dotfile, and not a nested file", () => {
    expect(parseRelative("outside.ts", ["*.ts"]).services.program).toBeTruthy();
    expect(parseRelative(".hidden.ts", ["*.ts"]).services.program).toBeTruthy();
    const nested = refusal("scripts/loose.ts", ["*.ts"]);
    expect(nested).toContain("which does not match 'scripts/loose.ts'");
  });

  it("matches one directory segment, including a dotfile in that segment", () => {
    expect(parseRelative("scripts/loose.ts", ["scripts/*.ts"]).services.program).toBeTruthy();
    expect(parseRelative("scripts/.dot.ts", ["scripts/*.ts"]).services.program).toBeTruthy();
    const missed = refusal("outside.ts", ["scripts/*.ts"]);
    expect(missed).toContain("which does not match 'outside.ts'");
  });

  it("does not treat a # pattern as a glob, and an empty allow list matches nothing", () => {
    expect(refusal("outside.ts", ["#*.ts"])).toContain("which does not match 'outside.ts'");
    expect(refusal("outside.ts", [])).toContain("which does not match 'outside.ts'");
  });

  it("rejects the wide globs before matching", () => {
    expect(refusal("outside.ts", ["*"])).toContain("overly wide '*'");
    expect(refusal("outside.ts", ["**/*.ts"])).toContain("disallowed '**'");
  });
});

describe("copied shadcn stylesheet", () => {
  it("keeps the shadcn 4.23.0 tailwind.css bytes and the MIT copyright", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/shadcn-tailwind.css"), "utf8");
    const marker = "@theme inline {";
    const body = css.slice(css.indexOf(marker));
    expect(createHash("sha256").update(body).digest("hex")).toBe(SHADCN_TAILWIND_SHA256);
    expect(css).toContain("Copyright (c) 2023 shadcn");
    expect(css).toContain("Permission is hereby granted, free of charge");
    const globals = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(globals).toContain('@import "./shadcn-tailwind.css"');
    const notice = readFileSync(path.join(process.cwd(), "NOTICE"), "utf8");
    expect(notice).toContain("Copyright (c) 2023 shadcn");
    expect(notice).toContain("does not relicense that copy");
  });
});
