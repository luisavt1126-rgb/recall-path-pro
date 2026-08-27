import type { ReactNode } from "react";
import { PRIORITY_META, type PriorityLevel } from "@/lib/priority";

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      <div className={title || action ? "mt-4" : ""}>{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  progress,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "rose" | "brand";
  progress?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 font-display text-2xl font-semibold sm:text-3xl ${
          tone === "rose" ? "text-rose" : tone === "brand" ? "text-brand" : ""
        }`}
      >
        {value}
      </p>
      {progress !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PriorityTag({ level }: { level: PriorityLevel }) {
  const meta = PRIORITY_META[level];
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.bg} ${meta.text}`}
    >
      {meta.emoji} {meta.label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

export const buttonClass =
  "rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60";

export const ghostButtonClass =
  "rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground";
