"use client";

import { useCallback, useEffect, useState } from "react";
import { Masked } from "@kernel/mask/Masked";
import { ActionRail, FilterBar, Kbd, Money, StatusBadge } from "@kernel/ui";
import type { RefundDto } from "./queries";

type Props = {
  initialRows: RefundDto[];
  thresholdCents: number;
  queue: "all" | "approvals";
};

const STATUSES = [
  "pending",
  "recommended",
  "approved",
  "rejected",
  "settled",
  "failed",
];

export function QueueClient({ initialRows, thresholdCents, queue }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visible = statusFilter
    ? rows.filter((r) => r.status === statusFilter)
    : rows;
  const selected = visible[cursor] ?? null;

  const refresh = useCallback(async () => {
    const qs = queue === "approvals" ? "?queue=approvals" : "";
    const res = await fetch(`/api/refunds${qs}`);
    if (res.ok) {
      const data = (await res.json()) as { rows: RefundDto[] };
      setRows(data.rows);
    }
  }, [queue]);

  const act = useCallback(
    async (transition: string) => {
      if (!selected || !selected.actions.includes(transition as never)) return;
      const prev = rows;
      const nextStatus: Record<string, string> = {
        recommend: "recommended",
        approve: "approved",
        reject: "rejected",
        settle: "settled",
        fail: "failed",
      };
      // Optimistic update with rollback on failure.
      setRows((rs) =>
        rs.map((r) =>
          r.id === selected.id
            ? { ...r, status: nextStatus[transition] ?? r.status, actions: [] }
            : r
        )
      );
      setError(null);
      const res = await fetch(`/api/refunds/${selected.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition }),
      });
      if (!res.ok) {
        setRows(prev);
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? `failed to ${transition}`);
      } else {
        void refresh();
      }
    },
    [selected, rows, refresh]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLSelectElement) return;
      if (e.key === "j") setCursor((c) => Math.min(c + 1, visible.length - 1));
      if (e.key === "k") setCursor((c) => Math.max(c - 1, 0));
      if (e.key === "a") {
        // Recommend or approve depending on resolved permission.
        if (selected?.actions.includes("approve")) void act("approve");
        else if (selected?.actions.includes("recommend")) void act("recommend");
      }
      if (e.key === "r") void act("reject");
      if (e.key === "Enter" && selected) {
        window.location.href = `/refunds/${selected.id}`;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible.length, selected, act]);

  return (
    <>
      <FilterBar>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCursor(0);
          }}
        >
          <option value="">all statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="who">
          threshold ${(thresholdCents / 100).toFixed(0)} · <Kbd>j</Kbd>/
          <Kbd>k</Kbd> navigate · <Kbd>a</Kbd> recommend/approve ·{" "}
          <Kbd>r</Kbd> reject
        </span>
      </FilterBar>
      {error && (
        <p role="alert" style={{ color: "var(--signal)" }}>
          {error}
        </p>
      )}
      <ActionRail>
        {selected?.actions.map((t) => (
          <button
            key={t}
            className={`k-btn${t === "reject" || t === "fail" ? " destructive" : ""}`}
            onClick={() => act(t)}
          >
            {t}
          </button>
        ))}
        {selected && selected.actions.length === 0 && (
          <span className="who">no actions available for you on this row</span>
        )}
      </ActionRail>
      <table className="k-table">
        <thead>
          <tr>
            <th>charge</th>
            <th>customer email</th>
            <th>last4</th>
            <th className="num">amount</th>
            <th>reason</th>
            <th>status</th>
            <th>recommended by</th>
            <th>created</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr
              key={r.id}
              data-selected={i === cursor}
              onClick={() => setCursor(i)}
            >
              <td>{r.charge_id}</td>
              <td>
                <Masked
                  entityType="refund_request"
                  entityId={r.id}
                  field="customer_email"
                />
              </td>
              <td>
                <Masked
                  entityType="refund_request"
                  entityId={r.id}
                  field="card_last4"
                />
              </td>
              <td className="num">
                <Money cents={r.amount_cents} currency={r.currency} />
              </td>
              <td>{r.reason_code}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td>{r.recommended_by_name ?? "—"}</td>
              <td>{new Date(r.created_at).toLocaleDateString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
