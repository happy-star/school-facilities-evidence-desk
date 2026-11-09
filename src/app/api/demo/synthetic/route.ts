import { connection } from "next/server";

import { loadSyntheticDemoDataset } from "@/server/synthetic-demo";

export async function GET() {
  await connection();
  try {
    const dataset = loadSyntheticDemoDataset();
    return Response.json({
      ok: true,
      source: "synthetic-demo",
      replacesOfficialImport: false,
      syntheticBanner: dataset.syntheticBanner,
      dataset,
    });
  } catch {
    return Response.json({ ok: false, message: "The synthetic sample could not be built." }, { status: 500 });
  }
}
