"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Item = { slug: string; name: string; hint: string };

/** ⌘K / Ctrl-K search over companies. Also renders an inline trigger. */
export default function CommandPalette({ items, variant = "nav" }: { items: Item[]; variant?: "nav" | "hero" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (variant !== "nav") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener("earshot:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("earshot:search", onOpen);
    };
  }, [variant]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())), [items, q]);

  const go = (slug: string) => {
    setOpen(false);
    router.push(`/company/${slug}/`);
  };

  const trigger =
    variant === "hero" ? (
      <button
        onClick={() => window.dispatchEvent(new Event("earshot:search"))}
        className="group w-full max-w-md flex items-center gap-3 rounded-2xl border border-line bg-panel/80 backdrop-blur px-5 h-14 text-left hover:border-accent/60 transition-colors"
      >
        <SearchIcon />
        <span className="flex-1 text-[16px] text-ink-3 group-hover:text-ink-2">Search a company</span>
        <kbd>⌘K</kbd>
      </button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-line px-3 h-8 text-[13px] text-ink-2 hover:text-ink hover:border-accent/50 transition-colors"
      >
        <SearchIcon size={14} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden sm:inline">⌘K</kbd>
      </button>
    );

  return (
    <>
      {trigger}
      {open && variant === "nav" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4" role="dialog" aria-modal="true" aria-label="Search companies">
          <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm scrim-enter" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg panel bg-raised shadow-2xl overflow-hidden drawer-enter" style={{ animationName: "scrimIn" }}>
            <div className="flex items-center gap-3 px-5 h-14 border-b hairline">
              <SearchIcon />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                  if (e.key === "Enter" && results[active]) go(results[active].slug);
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Search a company"
                className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-ink-3"
                aria-label="Company name"
              />
              <kbd>esc</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 && <li className="px-3 py-6 text-center text-ink-3 text-[14px]">No company matches &ldquo;{q}&rdquo;. Try a shorter name.</li>}
              {results.map((r, i) => (
                <li key={r.slug}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r.slug)}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-3 text-left transition-colors ${i === active ? "bg-panel" : ""}`}
                  >
                    <span className="text-[15px] font-medium">{r.name}</span>
                    <span className="text-[12px] text-ink-3">{r.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className="text-ink-3 shrink-0">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
