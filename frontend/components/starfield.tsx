"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

/* Tiny twinkling dots over pure black */
export function Starfield({ count = 70, className }: { count?: number; className?: string }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1 + Math.random() * 1.6,
        delay: Math.random() * 4,
        dur: 2.4 + Math.random() * 3.2,
        peak: 0.35 + Math.random() * 0.55,
      })),
    [count]
  );
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)}>
      {stars.map((s, i) => (
        <span
          key={i}
          className="star-twinkle absolute rounded-full bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            ["--peak" as string]: s.peak,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`,
          }}
        />
      ))}
    </div>
  );
}
