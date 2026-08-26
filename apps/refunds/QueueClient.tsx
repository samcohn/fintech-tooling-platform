"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Masked } from "@kernel/mask/Masked";
import { Kbd, Money, StatusBadge } from "@kernel/ui";
import type { RefundDto } from "./queries";

type Props = {
  initialRows: RefundDto[];
  thresholdCents: number;
  queue: "all" | "approvals";
};

const FILTERS = [
  "all",
  "pending",
  "recommended",
  "approved",
  "settled",
  "rejected",
  "failed",
] as const;

const sentence = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const ROW_H = 34;
const OVERSCAN = 12;

export function QueueClient({ initialRows, thresholdCents, queue }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [unmaskSignals, setUnmaskSignals] = useState<Record<string, number>>(
    {}
  );
  const [scrollY, setScrollY] = useState(0);
  const [viewH, setViewH] = useState(800);
  const tableRef = useRef<HTMLTableElement>(null);

  const visible =
    statusFilter === "all"
      ? rows
      : rows.filter((r) => r.status === statusFilter);
  const selected = visible[cursor] ?? null;
  const aboveThreshold = rows.filter(
    (r) => r.amount_cents >= thresholdCents
  ).length;

  // The document scrolls; virtualize against the window viewport.
  const tableTop =
    (tableRef.current?.getBoundingClientRect().top ?? 0) + scrollY;
  const offset = Math.max(0, scrollY - tableTop);
  const start = Math.max(0, Math.floor(offset / ROW_H) - OVERSCAN);
  const end = Math.min(
    visible.length,
    Math.ceil((offset + viewH) / ROW_H) + OVERSCAN
  );
  const window_ = visible.slice(start, end);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    const onResize = () => setViewH(window.innerHeight);
    onScroll();
    onResize();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Keep the cursor row in view when navigating by keyboard.
  useEffect(() => {
    const row = tableRef.current?.querySelector('tr[data-selected="true"]');
    row?.scrollIntoView({ block: "nearest" });
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
      const id = selected.id;
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
          r.id === id
            ? { ...r, status: nextStatus[transition] ?? r.status, actions: [] }
            : r
        )
      );
      setRowError(null);
      const res = await fetch(`/api/refunds/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition }),
      });
      if (!res.ok) {
        setRows(prev);
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setRowError({
          id,
          msg: data?.error ? sentence(data.error) : `Could not ${transition}`,
        });
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

  function primaryAction(r: RefundDto): string | null {
    if (r.actions.includes("approve")) return "approve";
    if (r.actions.includes("recommend")) return "recommend";
    if (r.actions.includes("settle")) return "settle";
    return null;
  }

  function actionCell(r: RefundDto, idx: number) {
    if (rowError && rowError.id === r.id)
      return <span className="k-rowerror">{rowError.msg}</span>;
    const verb = primaryAction(r);
    if (verb)
      return (
        <button
          type="button"
          className="k-btn"
          onClick={(e) => {
            e.stopPropagation();
            setCursor(idx);
            void act(verb);
          }}
        >
          {sentence(verb)}
        </button>
      );
    if (r.unavailable_reason && !["closed"].includes(r.unavailable_reason))
      return <span className="k-cell-muted">{sentence(r.unavailable_reason)}</span>;
    return <span className="k-cell-faint">—</span>;
  }

  const counts: Record<string, number> = { all: rows.length };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return (
    <>
      <div className="k-pagehead">
        <div>
          <h1 className="k-title">
            {queue === "approvals" ? "Approvals" : "Refund requests"}
          </h1>
          <p className="k-threshold">
            Approval threshold ${(thresholdCents / 100).toFixed(2)}
          </p>
        </div>
        <div className="k-counts">
          {visible.length} requests
          <br />
          {aboveThreshold} above threshold
        </div>
      </div>
      <div className="k-filterbar" role="group" aria-label="Status filter">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="k-seg"
            data-active={statusFilter === f}
            onClick={() => {
              setStatusFilter(f);
              setCursor(0);
            }}
          >
            {sentence(f)}
            <span className="k-count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="k-empty">
          No {statusFilter === "all" ? "" : `${statusFilter} `}requests
          {queue === "approvals" ? " awaiting approval" : ""}.
        </p>
      ) : (
        <table className="k-table" ref={tableRef}>
          <thead>
            <tr>
              <th style={{ width: 132 }}>Charge</th>
              <th style={{ width: 148 }}>Customer</th>
              <th style={{ width: 92 }}>Card</th>
              <th className="num" style={{ width: 96 }}>
                Amount
              </th>
              <th style={{ width: 168 }}>Reason</th>
              <th style={{ width: 116 }}>Status</th>
              <th style={{ width: 132 }}>Recommended by</th>
              <th className="num" style={{ width: 88 }}>
                Created
              </th>
              <th className="num">Action</th>
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
              const own =
                r.unavailable_reason === "own recommendation";
              return (
                <tr
                  key={r.id}
                  data-selected={idx === cursor}
                  onClick={() => setCursor(idx)}
                >
                  <td className="mono">{r.charge_id}</td>
                  <td className="k-cell-customer">
                    <Masked
                      entityType="refund_request"
                      entityId={r.id}
                      field="customer_email"
                      unmaskSignal={unmaskSignals[r.id] ?? 0}
                    />
                  </td>
                  <td className="mono k-cell-muted">•••• {r.card_last4}</td>
                  <td className="k-amount">
                    <Money cents={r.amount_cents} currency={r.currency} />
                  </td>
                  <td>{sentence(r.reason_code)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td
                    className={own ? undefined : "k-cell-muted"}
                    style={own ? { color: "var(--ink)" } : undefined}
                  >
                    {r.recommended_by_name ?? (
                      <span className="k-cell-faint">—</span>
                    )}
                  </td>
                  <td className="num k-cell-muted">
                    {new Date(r.created_at).toLocaleDateString("en-US", {
                      month: "numeric",
                      day: "numeric",
                      year: "2-digit",
                    })}
                  </td>
                  <td className="num">{actionCell(r, idx)}</td>
                </tr>
              );
            })}
            {end < visible.length && (
              <tr className="k-spacer" aria-hidden>
                <td
                  colSpan={9}
                  style={{ height: (visible.length - end) * ROW_H }}
                />
              </tr>
            )}
          </tbody>
        </table>
      )}
      {detailOpen && selected && (
        <aside className="k-panel" aria-label="Refund detail">
          <button
            type="button"
            className="k-btn k-close"
            onClick={() => setDetailOpen(false)}
          >
            Close
          </button>
          <p className="k-headline">
            <Money
              cents={selected.amount_cents}
              currency={selected.currency}
            />
          </p>
          <p className="k-headline-id">{selected.charge_id}</p>
          <dl>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={selected.status} />
            </dd>
            <dt>Reason</dt>
            <dd>{sentence(selected.reason_code)}</dd>
            <dt>Customer</dt>
            <dd>
              <Masked
                entityType="refund_request"
                entityId={selected.id}
                field="customer_email"
                unmaskSignal={unmaskSignals[selected.id] ?? 0}
              />
            </dd>
            <dt>Card</dt>
            <dd className="mono">•••• {selected.card_last4}</dd>
            <dt>Billing address</dt>
            <dd>
              <Masked
                entityType="refund_request"
                entityId={selected.id}
                field="billing_address"
              />
            </dd>
            <dt>Recommended by</dt>
            <dd>
              {selected.recommended_by_name ?? (
                <span className="k-cell-faint">—</span>
              )}
            </dd>
            <dt>Created</dt>
            <dd className="mono">
              {new Date(selected.created_at).toLocaleString("en-US")}
            </dd>
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
