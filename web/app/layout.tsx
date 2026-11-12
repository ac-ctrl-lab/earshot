import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./globals.css";
import CommandPalette from "@/components/CommandPalette";
import Wordmark from "@/components/Wordmark";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = {
  title: "Earshot: hear what customers tell regulators",
  description:
    "Earshot turns public CFPB complaints into a live map of the issues a fintech should fix first, priced and benchmarked against peers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getMeta();
  const items = meta.companies.map((c) => ({ slug: c.slug, name: c.name, hint: `${c.complaints_12m.toLocaleString("en-US")} complaints` }));
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-[15px]">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-bg/70 border-b hairline">
          <nav className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <Link href="/" aria-label="Earshot home"><Wordmark /></Link>
            <div className="flex items-center gap-5 text-[13px] text-ink-2">
              <Link href="/#companies" className="hidden sm:inline hover:text-ink">Companies</Link>
              <Link href="/method/" className="hover:text-ink">How it works</Link>
              <CommandPalette items={items} />
            </div>
          </nav>
          {meta.source === "sample" && (
            <div className="border-t hairline text-center text-[12px] text-ink-3 py-1.5 px-4">
              Demo data with fictional companies. Load real CFPB data by running the pipeline.
            </div>
          )}
        </header>
        <main>{children}</main>
        <footer className="mx-auto max-w-7xl px-4 sm:px-6 py-14 text-[12px] text-ink-3">
          <p className="max-w-3xl">
          {meta.source === "sample"
            ? "Demo data shaped like the CFPB Consumer Complaint Database. Companies are fictional and complaints are generated."
            : `Source: CFPB Consumer Complaint Database (${meta.product}). Complaints are not verified by the CFPB.`}{" "}
          Cost figures are estimates driven by the assumptions you set. Data through {meta.date_max}.
          </p>
        </footer>
      </body>
    </html>
  );
}
