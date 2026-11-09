import { Shell } from "@/components/shell";
import { OFFICIAL_SHA256, OFFICIAL_SOURCE_URL } from "@/lib/official-source";

export const metadata = { title: "Notices" };

export default function NoticesPage() {
  return (
    <Shell>
      <article className="flex max-w-3xl flex-col gap-5 text-sm leading-6">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Licence and data notices</h1>
        <section>
          <h2 className="font-serif text-2xl font-semibold">Code</h2>
          <p className="mt-2">This private draft already contains an MIT file for source code. That file does not apply to the UDISE+ booklet, to page images, or to an extract of the official tables. The hackathon registration text asks for an MIT or Apache contribution to the Code for India GitHub organisation. Choosing that public grant, and completing any organisation transfer, is still a maintainer decision. This page does not make that grant.</p>
        </section>
        <section>
          <h2 className="font-serif text-2xl font-semibold">The booklet</h2>
          <p className="mt-2">One official report, not three datasets. Statistical year 2022–23. Citation URL:</p>
          <p className="mt-2 font-mono text-xs break-all">{OFFICIAL_SOURCE_URL}</p>
          <p className="mt-2 font-mono text-xs break-all">SHA-256 {OFFICIAL_SHA256}</p>
          <p className="mt-2">A text search of the extracted booklet did not find an explicit reuse licence. The contents page points at a disclaimer, and the rendered physical page 7 that was checked did not show readable licence terms. Absence of a found licence is not permission to redistribute, and it is not a legal finding that reuse is forbidden. The full PDF and bulk extracts stay out of this repository. A few attributed cells are used as test anchors only.</p>
        </section>
        <section>
          <h2 className="font-serif text-2xl font-semibold">How to read a cell</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The unit is a percentage of schools with a functional facility, not a count of toilets and not a percentage of children.</li>
            <li>India is the aggregate. It is not ranked as a state.</li>
            <li>Tables 8.8, 8.9, and 8.10 have no printed column (8). Later columns keep their printed numbers.</li>
            <li>Government total is a parent aggregate. It is not added to KVS, NVS, other central government, or state government.</li>
            <li>KVS and NVS are shown as printed. The abbreviations are not expanded here.</li>
            <li>Girls use girls-only and coeducational schools (table 7.4, not 7.5). Boys use boys-only and coeducational schools (table 7.3). CWSN-friendly toilets use total schools (table 7.12), not a count of CWSN pupils.</li>
            <li>Those three percentages are not subtracted from each other.</li>
            <li>A printed zero with denominator zero is undefined. The raw zero is kept. A printed zero without a count breakout is not relabelled.</li>
            <li>Printed integers stay integers. Table 7.4 page 126 may show a source footer that does not say 2022–23. That footer is preserved and flagged.</li>
            <li>Nothing here is a 2026 status, a school-level diagnosis, or evidence of causal impact.</li>
          </ul>
        </section>
      </article>
    </Shell>
  );
}
