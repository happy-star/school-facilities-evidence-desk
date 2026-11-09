"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Desk" },
  { href: "/import", label: "Import", officialImport: true },
  { href: "/method", label: "Method" },
  { href: "/notices", label: "Notices" },
];

export function Nav({ showOfficialImport = true }: { showOfficialImport?: boolean }) {
  const pathname = usePathname();
  const links = LINKS.filter((link) => showOfficialImport || !link.officialImport);
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Primary">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground"
                : "rounded-full px-3 py-1 text-sm font-semibold text-foreground hover:bg-secondary"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
