"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { Starfield } from "./starfield";
import { LiquidMetalView } from "./liquid-metal-view";

/* Amorphous blob — radial fade so there are no box edges at all. */
const DESKTOP_MASK: CSSProperties = {
  maskImage: "radial-gradient(ellipse 62% 58% at 50% 50%, black 52%, transparent 76%)",
  WebkitMaskImage: "radial-gradient(ellipse 62% 58% at 50% 50%, black 52%, transparent 76%)",
};

const MOBILE_MASK: CSSProperties = {
  maskImage: "radial-gradient(ellipse 66% 60% at 50% 50%, black 48%, transparent 74%)",
  WebkitMaskImage: "radial-gradient(ellipse 66% 60% at 50% 50%, black 48%, transparent 74%)",
};

const METHOD = [
  ["Sovereignty", "Runs on-premise. Nothing leaves."],
  ["Routing", "Each task meets its model."],
  ["Agentic", "Planned, executed, verified."],
  ["Evidence", "Every claim cites a source."],
  ["Delivery", "Human approval before output."],
];

export function HeroLiquidMetal() {
  const router = useRouter();
  // WebGL canvas can only render client-side; rendering it immediately on mount
  // (same bundle) instead of a lazy dynamic import removes the 4-5s pop-in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Pre-compile /workspace in the background (dev) so Get Started opens instantly.
  useEffect(() => {
    router.prefetch("/workspace");
  }, [router]);
  return (
    <section className="relative flex min-h-dvh flex-col overflow-hidden bg-black">
      <Starfield />

      {/* amorphous blob — mobile, soft behind the text */}
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[10%] aspect-square w-[86%] -translate-x-1/2 opacity-60 lg:hidden" style={MOBILE_MASK}>
        {mounted && <LiquidMetalView style={{ width: "100%", height: "100%" }} speed={0.8} scale={0.7} />}
      </div>

      {/* header */}
      <header className="relative z-10 mx-auto flex w-full max-w-[1520px] shrink-0 items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/" className="font-display text-[21px] font-medium tracking-tight text-white transition-opacity hover:opacity-90">
          Adrestia
        </Link>
        <div className="flex items-center gap-6">
          <span className="hidden items-center gap-2.5 font-plex text-[12px] tracking-[0.08em] text-white/60 sm:flex">
            <span className="h-[7px] w-[7px] rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
            Local pilot
          </span>
          <Link
            href="/workspace"
            className="rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-black transition-all duration-300 hover:scale-105 hover:shadow-[0_0_24px_rgba(255,255,255,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:shadow-[0_0_32px_rgba(255,255,255,0.8)]"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* hero */}
      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-75px)] w-full max-w-[1520px] flex-1 grid-cols-1 content-center items-center gap-8 px-6 py-6 sm:px-10 lg:grid-cols-[1.1fr_0.9fr]">
        {/* amorphous blob — floats in the space on the right */}
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 hidden aspect-square w-[46%] xl:w-[50%] -translate-y-[50%] lg:block" style={DESKTOP_MASK}>
          {mounted && <LiquidMetalView style={{ width: "100%", height: "100%" }} speed={1} scale={0.72} />}
        </div>
        <div className="text-left">
          <p className="font-plex text-[11px] sm:text-[12px] tracking-[0.28em] text-white/45">
            ADRESTIA — SOVEREIGN AI WORKBENCH
          </p>
          <h1 className="mt-6 font-display text-[10.5vw] font-medium leading-[1.04] tracking-[-0.015em] text-white sm:text-6xl lg:text-[4.25rem] xl:text-[4.85rem]">
            Confidential data in,
            <br />
            <em className="font-normal text-white/95">verified action out.</em>
          </h1>
          <p className="mt-6 max-w-lg text-[15px] sm:text-[15.5px] leading-relaxed text-white/55">
            A secure, on-premise AI workspace for confidential industrial work.
            Upload documents, check them against private knowledge, approve
            every finding — and deliver. Every answer cites its source.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link
              href="/workspace"
              className="rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_32px_rgba(255,255,255,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:shadow-[0_0_40px_rgba(255,255,255,0.85)]"
            >
              Get Started
            </Link>
            <a href="#method" className="text-[14px] font-semibold text-white/70 transition-colors hover:text-white">
              See the method
            </a>
          </div>
        </div>
        {/* right column left empty — the free shader flows behind it */}
        <div aria-hidden="true" className="hidden lg:block" />
      </div>

      {/* hairline divider between hero and method */}
      <div aria-hidden="true" className="relative z-10 mx-auto w-full max-w-[1520px] shrink-0 px-6 sm:px-10">
        <div className="h-px w-full bg-white/[0.08]" />
      </div>

      {/* method + footer share ONE continuous wash — no seam, gradient can't leak into hero */}
      <div className="relative z-10 shrink-0 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(85% 95% at 50% 122%, rgba(12,80,105,0.5), rgba(12,80,105,0.1) 58%, transparent 76%)" }}
        />
        {/* method strip */}
        <div id="method" className="relative z-10 mx-auto w-full max-w-[1520px] px-6 py-14 sm:px-10 lg:py-20">
          <p className="font-plex text-[11px] sm:text-[12px] tracking-[0.28em] text-white/45">
            THE METHOD — INPUT → DELIVER
          </p>
          <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-5">
            {METHOD.map(([t, d], i) => (
              <div key={t}>
                <div className="font-display text-2xl lg:text-3xl text-white/95">0{i + 1}</div>
                <div className="mt-3 font-plex text-[11px] tracking-[0.2em] text-white/50">
                  {t.toUpperCase()}
                </div>
                <div className="mt-2 text-[13px] lg:text-[14px] leading-relaxed text-white/60">{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* footer — same wash continues, no divider */}
        <div className="relative z-10 mx-auto flex w-full max-w-[1520px] items-center justify-between px-6 py-5 font-plex text-[11px] tracking-[0.08em] text-white/35 sm:px-10">
          <span>ADRESTIA · SIH26117</span>
          <span>NO CLOUD — NO EXTERNAL TRANSFER</span>
        </div>
      </div>
    </section>
  );
}

export default HeroLiquidMetal;
