import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { acceptGovernmentDataset, type EvidenceDataset } from "@/lib/schema";
import { officialStoreReadable } from "@/server/public-demo";

export type StoredDataset =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "ready"; dataset: EvidenceDataset };

export function importFilePath(): string {
  return path.join(process.cwd(), "data", "imported", "udise-2022-23.json");
}

export async function readStoredDataset(): Promise<StoredDataset> {
  if (!officialStoreReadable()) return { status: "empty" };
  let text: string;
  try {
    text = await readFile(importFilePath(), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { status: "empty" };
    }
    return { status: "invalid", message: error instanceof Error ? error.message : "Could not read the local import." };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "invalid", message: "The local import file is not valid JSON. Remove it and import the booklet again." };
  }
  const accepted = acceptGovernmentDataset(json);
  if (!accepted.ok) {
    return { status: "invalid", message: accepted.message };
  }
  return { status: "ready", dataset: accepted.dataset };
}

export async function clearStoredDataset(): Promise<void> {
  await rm(importFilePath(), { force: true });
}
