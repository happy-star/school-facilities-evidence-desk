import { Suspense } from "react";
import { connection } from "next/server";

import { Desk } from "@/components/desk";
import { Shell } from "@/components/shell";
import { modelServiceStatus } from "@/server/model-status";
import { readStoredDataset } from "@/server/store";

export default function Page() {
  return (
    <Shell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking the local import folder…</p>}>
        <DeskGate />
      </Suspense>
    </Shell>
  );
}

async function DeskGate() {
  await connection();
  const [stored, model] = await Promise.all([readStoredDataset(), Promise.resolve(modelServiceStatus())]);
  return <Desk stored={stored} model={model} />;
}
