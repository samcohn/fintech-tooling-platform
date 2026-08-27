import type { ReactNode } from "react";

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="k-filterbar">{children}</div>;
}

/** Sentence-case status mark. Only unresolved states get chrome. */
export function StatusBadge({ status }: { status: string }) {
  const spaced = status.replace(/_/g, " ").replace(/\bpr\b/i, "PR");
  const label = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  return (
    <span className="badge" data-status={status}>
      {label}
    </span>
  );
}

export function Money({ cents, currency }: { cents: number; currency: string }) {
  const value = (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency,
  });
  return <span className="num">{value}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}
