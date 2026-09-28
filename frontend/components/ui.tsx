import { cn } from "@/lib/utils";
import { AlertTriangle, Check } from "lucide-react";
import React from "react";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-white/[0.07] bg-white/[0.03]", className)}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/45">
      {children}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className="h-full rounded-full bg-white transition-all duration-700"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function StatusDot({ state }: { state: "completed" | "running" | "pending" | "warn" }) {
  if (state === "completed")
    return <Check size={13} className="shrink-0 text-white" />;
  if (state === "running")
    return <span className="h-2 w-2 shrink-0 animate-pulseDot rounded-full bg-white" />;
  if (state === "warn")
    return <AlertTriangle size={13} className="shrink-0 text-white" />;
  return <span className="h-[7px] w-[7px] shrink-0 rounded-[2px] border border-white/25" />;
}
