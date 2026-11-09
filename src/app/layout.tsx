import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/fraunces/latin-500.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "School Facilities Evidence Desk",
    template: "%s · School Facilities Evidence Desk",
  },
  description:
    "Historical UDISE+ 2022-23 school sanitation and accessibility tables. Not an official government site.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
