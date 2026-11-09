import { connection } from "next/server";

import { answerAsk } from "@/server/ask";

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The request body is not JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ ok: false, message: "The request body must be an object." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  return Response.json(await answerAsk({
    question: typeof record.question === "string" ? record.question : "",
    interpreter: record.interpreter,
    source: record.source,
  }));
}
