import Link from "next/link";
import { Suspense } from "react";

import { Nav } from "@/components/nav";
import { officialImportEnabled } from "@/server/public-demo";

export function Shell({ children }: { children: React.ReactNode }) {
  const showOfficialImport = officialImportEnabled();
  return (
    <div className="flex min-h-full flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Link href="/" className="group">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Internal · Historical 2022–23</p>
              <p className="font-serif text-xl font-semibold tracking-tight group-hover:text-primary sm:text-2xl">School Facilities Evidence Desk</p>
            </Link>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">Not an official UDISE+ or government interface. Figures stay in 2022–23.</p>
          </div>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Desk · Import · Method · Notices</p>}>
            <Nav showOfficialImport={showOfficialImport} />
          </Suspense>
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs leading-5 text-muted-foreground sm:px-6">
          The private draft has an MIT file for code only. It does not cover the UDISE+ booklet or an extract of it, and it is not a completed public grant. A public MIT or Apache contribution is still a decision for the maintainer. Redistribution permission for the booklet was not established. This desk makes no claim about current conditions or social impact.
        </p>
      </footer>
    </div>
  );
}
