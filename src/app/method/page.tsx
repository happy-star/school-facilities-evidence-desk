import { Shell } from "@/components/shell";
import { SUPPORTED_QUESTIONS } from "@/lib/baseline";

export const metadata = { title: "Method" };

export default function MethodPage() {
  return (
    <Shell>
      <article className="flex max-w-3xl flex-col gap-6 text-sm leading-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">How a question becomes a cited cell</h1>
          <p className="mt-2 text-muted-foreground">
            The workflow is small on purpose. A question is matched to the one known booklet, one indicator, one management, and a geography. A typed read-only query then returns stored cells. The answer may quote those cells, their published counts, and structural table identifiers. It does not run generated code or SQL.
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Receive the question. If it asks for a cause, another year, a student count, a count of toilets, or a gap between indicators, stop.</li>
          <li>Select the dataset. The default is the official import, and a missing import stops before any percentage. The synthetic sample is a separate opt-in and is labeled as invented data.</li>
          <li>Select the indicator. Girls, boys, and CWSN-friendly toilets are different populations.</li>
          <li>Run the validated query. Unknown geographies, other years, and additive rewrites of Government total are rejected.</li>
          <li>Explain the source and the quality flags that were stored with the cell, including a zero denominator and the table 7.4 footer when it applies.</li>
        </ol>
        <section>
          <h2 className="font-serif text-2xl font-semibold">What the baseline will answer</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {SUPPORTED_QUESTIONS.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-serif text-2xl font-semibold">AgentFoundry status</h2>
          <p className="mt-2">
            AgentFoundry 0.1.80 <span className="font-mono">create_file</span> wrote <span className="font-mono">query-plan.ts</span>, 12210 bytes, SHA-256 <span className="font-mono">eb251f01b91859f6668b9f4593b2db2694a3256b4419d958d9977ee3b9756820</span>. That file is unchanged. A later review corrected a separate copy, and that copy is the explicit opt-in. The default path is still the hand-written baseline in <span className="font-mono">src/lib/baseline.ts</span>. The published judging text requires use of AgentFoundry, a public GitHub README, an accessible live or video demo, and a submission issue. It does not require the generated file to remain unedited. Whether this recorded use meets the rule is for the organisers. This draft has not been submitted.
          </p>
          <p className="mt-2">
            The baseline returns <span className="font-mono">agentFoundryGenerated: false</span>. The reviewed path does too. Citations, denominators, and zero-denominator readings are written by the server from stored cells.
          </p>
          <p className="mt-2">The checklist for that later step is in <span className="font-mono">docs/AGENTFOUNDRY.md</span>.</p>
        </section>
      </article>
    </Shell>
  );
}
