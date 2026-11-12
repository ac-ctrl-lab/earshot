import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = {
  title: "Earshot — Hear what customers tell regulators",
  description:
    "Earshot turns public CFPB complaints into a ranked, cost-estimated map of the issues a fintech should fix first.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getMeta();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        {meta.source === "sample" && (
          <div className="bg-ink text-white text-center text-[13px] py-2 px-4">
            Demo data: fictional companies and generated complaints. Run the pipeline to load real CFPB data.
          </div>
        )}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-page/80 border-b border-line/70">
          <nav className="mx-auto max-w-6xl px-4 sm:px-6 h-12 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight text-[17px]">
              Earshot
            </Link>
            <div className="flex gap-6 text-[13px] text-ink-2">
              <Link href="/#companies" className="hover:text-ink">Companies</Link>
              <Link href="/method/" className="hover:text-ink">How it works</Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mx-auto max-w-6xl px-4 sm:px-6 py-12 text-[12px] text-ink-3">
          {meta.source === "sample"
            ? "Demo data shaped like the CFPB Consumer Complaint Database. Companies are fictional and complaints are generated."
            : `Source: CFPB Consumer Complaint Database (${meta.product}). Complaints are not verified by the CFPB.`}{" "}
          Cost figures are estimates driven by the assumptions you set. Data through {meta.date_max}.
        </footer>
      </body>
    </html>
  );
}
