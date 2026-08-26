"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const ROW_H = 32;
const OVERSCAN = 12;

export function QueueClient({ initialRows, thresholdCents, queue }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [unmaskSignals, setUnmaskSignals] = useState<Record<string, number>>(
    {}
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = statusFilter
    ? rows.filter((r) => r.status === statusFilter)
    : rows;
  const selected = visible[cursor] ?? null;

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(
    visible.length,
    Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN
  );
  const window_ = visible.slice(start, end);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewH(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Keep the cursor row in view when navigating by keyboard.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const rowTop = cursor * ROW_H;
    if (rowTop < el.scrollTop) el.scrollTop = rowTop;
    else if (rowTop + ROW_H > el.scrollTop + el.clientHeight)
      el.scrollTop = rowTop + ROW_H - el.clientHeight;
  }, [cursor]);

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
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j") setCursor((c) => Math.min(c + 1, visible.length - 1));
      if (e.key === "k") setCursor((c) => Math.max(c - 1, 0));
      if (e.key === "a") {
        // Recommend or approve depending on resolved permission.
        if (selected?.actions.includes("approve")) void act("approve");
        else if (selected?.actions.includes("recommend")) void act("recommend");
      }
      if (e.key === "r") void act("reject");
      if (e.key === "u" && selected) {
        // Explicit audited unmask of the selected row's email.
        setUnmaskSignals((s) => ({
          ...s,
          [selected.id]: (s[selected.id] ?? 0) + 1,
        }));
      }
      if (e.key === "Enter" && selected) setDetailOpen(true);
      if (e.key === "Escape") setDetailOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible.length, selected, act]);

  function primaryLabel(r: RefundDto): string | null {
    if (r.actions.includes("approve")) return "approve";
    if (r.actions.includes("recommend")) return "recommend";
    if (r.actions.includes("settle")) return "settle";
    return null;
  }

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
        <span className="k-hint num">
          approval threshold ${(thresholdCents / 100).toFixed(0)}
        </span>
        <span className="k-hint">{visible.length} requests</span>
      </FilterBar>
      {error && (
        <p role="alert" className="k-alert">
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
          <span className="k-hint">
            {selected.unavailable_reason ?? "no actions available"}
          </span>
        )}
      </ActionRail>
      <div className="k-scroll" ref={scrollRef}>
        <table className="k-table">
          <thead>
            <tr>
              <th>charge</th>
              <th>customer email</th>
              <th>card</th>
              <th className="num">amount</th>
              <th>reason</th>
              <th>status</th>
              <th>recommended by</th>
              <th>created</th>
              <th>action</th>
            </tr>
          </thead>
          <tbody>
            {start > 0 && (
              <tr className="k-spacer" aria-hidden>
                <td colSpan={9} style={{ height: start * ROW_H }} />
              </tr>
            )}
            {window_.map((r, i) => {
              const idx = start + i;
              return (
                <tr
                  key={r.id}
                  data-selected={idx === cursor}
                  onClick={() => setCursor(idx)}
                >
                  <td className="mono k-cell-secondary">{r.charge_id}</td>
                  <td>
                    <Masked
                      entityType="refund_request"
                      entityId={r.id}
                      field="customer_email"
                      unmaskSignal={unmaskSignals[r.id] ?? 0}
                    />
                  </td>
                  <td className="mono k-cell-secondary">
                    •••• {r.card_last4}
                  </td>
                  <td className="num">
                    <Money cents={r.amount_cents} currency={r.currency} />
                  </td>
                  <td className="k-cell-secondary">{r.reason_code}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="k-cell-secondary">
                    {r.recommended_by_name ?? "—"}
                  </td>
                  <td className="num k-cell-secondary">
                    {new Date(r.created_at).toLocaleDateString("en-US")}
                  </td>
                  <td className="k-cell-muted">
                    {primaryLabel(r) ?? r.unavailable_reason ?? "—"}
                  </td>
                </tr>
              );
            })}
            {end < visible.length && (
              <tr className="k-spacer" aria-hidden>
                <td colSpan={9} style={{ height: (visible.length - end) * ROW_H }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {detailOpen && selected && (
        <aside className="k-panel" aria-label="refund detail">
          <button
            type="button"
            className="k-btn k-close"
            onClick={() => setDetailOpen(false)}
          >
            close
          </button>
          <h2>Refund {selected.charge_id}</h2>
          <dl>
            <dt>amount</dt>
            <dd className="num">
              <Money
                cents={selected.amount_cents}
                currency={selected.currency}
              />
            </dd>
            <dt>status</dt>
            <dd>
              <StatusBadge status={selected.status} />
            </dd>
            <dt>reason</dt>
            <dd>{selected.reason_code}</dd>
            <dt>customer email</dt>
            <dd>
              <Masked
                entityType="refund_request"
                entityId={selected.id}
                field="customer_email"
                unmaskSignal={unmaskSignals[selected.id] ?? 0}
              />
            </dd>
            <dt>card</dt>
            <dd className="mono">•••• {selected.card_last4}</dd>
            <dt>billing address</dt>
            <dd>
              <Masked
                entityType="refund_request"
                entityId={selected.id}
                field="billing_address"
              />
            </dd>
            <dt>recommended by</dt>
            <dd>{selected.recommended_by_name ?? "—"}</dd>
            <dt>created</dt>
            <dd>{new Date(selected.created_at).toLocaleString("en-US")}</dd>
          </dl>
        </aside>
      )}
      <footer className="k-legend">
        <span>
          <Kbd>j</Kbd>/<Kbd>k</Kbd> navigate
        </span>
        <span>
          <Kbd>a</Kbd> approve or recommend
        </span>
        <span>
          <Kbd>r</Kbd> reject
        </span>
        <span>
          <Kbd>u</Kbd> unmask (audited)
        </span>
        <span>
          <Kbd>Enter</Kbd> detail
        </span>
        <span>
          <Kbd>Esc</Kbd> close
        </span>
      </footer>
    </>
  );
}
