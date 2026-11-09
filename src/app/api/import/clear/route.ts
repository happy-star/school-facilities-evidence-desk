import { connection } from "next/server";

import { officialImportEnabled, publicDemoImportRefusal } from "@/server/public-demo";
import { clearStoredDataset } from "@/server/store";

export async function POST() {
  await connection();
  if (!officialImportEnabled()) {
    return Response.json(publicDemoImportRefusal(), { status: 403 });
  }
  await clearStoredDataset();
  return Response.json({ ok: true });
}
