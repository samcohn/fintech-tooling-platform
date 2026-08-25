import type { ReactNode } from "react";

export function ActionRail({ children }: { children: ReactNode }) {
  return <div className="k-actionrail">{children}</div>;
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="k-filterbar">{children}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="badge" data-status={status}>
      {status}
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
