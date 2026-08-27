"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Masked } from "@platform/mask/Masked";
import { Kbd, Money, StatusBadge } from "@platform/ui";
import type { RefundDto } from "./queries";

type Props = {
  initialRows: RefundDto[];
  thresholdCents: number;
  queue: "all" | "approvals";
};

const sentence = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Dot-delimited two-digit date: 08.26.26 */
const dotDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())}.${p(
    d.getFullYear() % 100
  )}`;
};

const ROW_H = 64;
const OVERSCAN = 10;

const OPEN_STATUSES = ["pending", "recommended", "approved"];

function needsYou(r: RefundDto): boolean {
  return r.actions.length > 0;
}

/** Count-up on mount: 750ms cubic ease-out, disabled by reduced motion. */
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current) {
      setValue(target);
      return;
    }
    done.current = true;
    const startAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - startAt) / 750, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled]);
  return value;
}

function StatCard({
  label,
  target,
  currency,
  animate,
}: {
  label: string;
  target: number;
  currency?: boolean;
  animate: boolean;
}) {
  const value = useCountUp(target, animate);
  return (
    <div className="k-stat">
      <div className="k-stat-num">
        {currency && <span className="k-stat-cur">$</span>}
        {value.toLocaleString()}
      </div>
      <div className="k-stat-label">{label}</div>
    </div>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ["j / k", "Navigate"],
  ["a", "Approve or recommend"],
  ["r", "Reject"],
  ["u", "Unmask (audited)"],
  ["Enter", "Open detail"],
  ["Esc", "Close"],
  ["?", "Shortcuts"],
];

export function QueueClient({ initialRows, thresholdCents, queue }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(0);
  const [tab, setTab] = useState<"needs" | "all">("needs");
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [unmaskSignals, setUnmaskSignals] = useState<Record<string, number>>(
    {}
  );
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const [viewH, setViewH] = useState(800);
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const flipRects = useRef<Map<string, number> | null>(null);
  const enteringIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    setBannerOpen(localStorage.getItem("k-banner-collapsed") !== "1");
    setMounted(true);
  }, []);

  // Resolving rows stay rendered so the collapse can play before the
  // row leaves the queue.
  const visible =
    tab === "needs"
      ? rows.filter((r) => needsYou(r) || resolving.has(r.id))
      : rows;
  const selected = visible[cursor] ?? null;

  const needsCount = rows.filter(needsYou).length;
  const openRows = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const queueValueCents = openRows.reduce((s, r) => s + r.amount_cents, 0);
  const aboveLimit = openRows.filter(
    (r) => r.amount_cents >= thresholdCents
  ).length;
  const triagedCount = rows.filter((r) => r.status === "recommended").length;

  // The document scrolls; virtualize against the window viewport.
  const listTop =
    (listRef.current?.getBoundingClientRect().top ?? 0) + scrollY;
  const offset = Math.max(0, scrollY - listTop);
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
    const row = listRef.current?.querySelector('[data-selected="true"]');
    row?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // Publish live counts so the sidebar badge stays state, not decoration.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("queue:counts", {
        detail: { href: queue === "approvals" ? "/refunds/approvals" : "/refunds", count: needsCount },
      })
    );
  }, [needsCount, queue]);

  /** FLIP: capture First positions before a reflow-causing state change. */
  const captureFlip = useCallback(() => {
    const rects = new Map<string, number>();
    for (const [id, el] of rowEls.current) {
      rects.set(id, el.getBoundingClientRect().top);
    }
    flipRects.current = rects;
  }, []);

  useLayoutEffect(() => {
    const first = flipRects.current;
    if (!first) return;
    flipRects.current = null;
    enteringIds.current = new Set();
    for (const [id, el] of rowEls.current) {
      const before = first.get(id);
      if (before === undefined) {
        enteringIds.current.add(id);
        el.setAttribute("data-entering", "true");
        continue;
      }
      const delta = before - el.getBoundingClientRect().top;
      if (delta === 0) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        el.style.transition =
          "transform var(--t-reflow) var(--ease)";
        el.style.transform = "";
      });
    }
  });

  const switchTab = useCallback(
    (next: "needs" | "all") => {
      if (next === tab) return;
      captureFlip();
      setTab(next);
      setCursor(0);
    },
    [tab, captureFlip]
  );

  const refresh = useCallback(async () => {
    const qs = queue === "approvals" ? "?queue=approvals" : "";
    const res = await fetch(`/api/refunds${qs}`);
    if (res.ok) {
      const data = (await res.json()) as { rows: RefundDto[] };
      setRows(data.rows);
      setResolving(new Set());
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
      setRowError(null);
      setInFlight(id);
      const res = await fetch(`/api/refunds/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition }),
      });
      setInFlight(null);
      if (!res.ok) {
        // The row un-collapses (it never collapsed) and the message
        // appears in the action cell. No toast.
        setRows(prev);
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setRowError({
          id,
          msg: data?.error ? sentence(data.error) : `Could not ${transition}`,
        });
        return;
      }
      // Resolving a row removes it from the queue.
      setRows((rs) =>
        rs.map((r) =>
          r.id === id
            ? { ...r, status: nextStatus[transition] ?? r.status, actions: [] }
            : r
        )
      );
      if (tab === "needs") {
        setResolving((s) => new Set(s).add(id));
        window.dispatchEvent(
          new CustomEvent("queue:resolved", {
            detail: { href: queue === "approvals" ? "/refunds/approvals" : "/refunds" },
          })
        );
        window.setTimeout(() => {
          setResolving((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
          void refresh();
        }, 300);
      } else {
        void refresh();
      }
    },
    [selected, rows, refresh, tab, queue]
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
      if (e.key === "?") setShortcutsOpen((o) => !o);
      if (e.key === "Escape") {
        setDetailOpen(false);
        setShortcutsOpen(false);
      }
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
      return (
        <div className="k-actioncell" data-reason="true">
          <span className="k-action-rest k-rowerror">{rowError.msg}</span>
        </div>
      );
    const verb = primaryAction(r);
    if (verb) {
      // Rest state crossfades to the button on hover or selection.
      return (
        <div className="k-actioncell">
          <span className="k-action-rest">
            <span className="k-dash">—</span>
          </span>
          <span className="k-action-live">
            <button
              type="button"
              className={verb === "settle" ? "k-btn quiet" : "k-btn"}
              onClick={(e) => {
                e.stopPropagation();
                setCursor(idx);
                void act(verb);
              }}
            >
              {sentence(verb)}
            </button>
          </span>
        </div>
      );
    }
    if (r.unavailable_reason && r.unavailable_reason !== "closed")
      return (
        <div className="k-actioncell" data-reason="true">
          <span className="k-action-rest">
            {sentence(r.unavailable_reason)}
          </span>
        </div>
      );
    return (
      <div className="k-actioncell" data-reason="true">
        <span className="k-action-rest">
          <span className="k-dash">—</span>
        </span>
      </div>
    );
  }

  const toggleBanner = () => {
    setBannerOpen((o) => {
      localStorage.setItem("k-banner-collapsed", o ? "1" : "0");
      return !o;
    });
  };

  const emptyLabel =
    tab === "needs"
      ? "Nothing is waiting on you."
      : "No refund requests.";

  return (
    <>
      <div className="k-pagehead">
        <h1 className="k-title">
          {queue === "approvals" ? "Approvals" : "Refunds"}
        </h1>
        <div className="k-banner">
          <span className="k-banner-badge" aria-hidden>
            ◆
          </span>
          {bannerOpen ? (
            <span>
              Gate Agent triaged {triagedCount} refunds{" "}
              <span className="k-banner-when">since your last visit.</span>
            </span>
          ) : (
            <span className="k-banner-when">Agent activity</span>
          )}
          <button
            type="button"
            className="k-banner-toggle"
            onClick={toggleBanner}
            aria-label={bannerOpen ? "Collapse banner" : "Expand banner"}
          >
            {bannerOpen ? "▾" : "▸"}
          </button>
        </div>
        <div className="k-stats">
          <StatCard
            label="Awaiting you"
            target={needsCount}
            animate={mounted && !reducedMotion.current}
          />
          <StatCard
            label="Value in queue"
            target={Math.round(queueValueCents / 100)}
            currency
            animate={mounted && !reducedMotion.current}
          />
          <StatCard
            label="Above your limit"
            target={aboveLimit}
            animate={mounted && !reducedMotion.current}
          />
        </div>
      </div>
      <div className="k-viewbar">
        <div className="k-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="k-tab"
            data-active={tab === "needs"}
            aria-selected={tab === "needs"}
            onClick={() => switchTab("needs")}
          >
            Needs you ({needsCount})
          </button>
          <button
            type="button"
            role="tab"
            className="k-tab"
            data-active={tab === "all"}
            aria-selected={tab === "all"}
            onClick={() => switchTab("all")}
          >
            All ({rows.length})
          </button>
        </div>
        <div className="k-threshold">
          <span className="k-threshold-label">Approval threshold </span>
          <span className="k-threshold-value">
            ${(thresholdCents / 100).toFixed(2)}
          </span>
        </div>
      </div>
      <div ref={listRef}>
        <div className="k-grid k-thead">
          <div>Refund</div>
          <div>Amount</div>
          <div>Status</div>
          <div>Customer</div>
          <div>Recommended by</div>
          <div>Action</div>
        </div>
        {visible.length === 0 ? (
          <p className="k-empty">{emptyLabel}</p>
        ) : (
          <>
            {start > 0 && <div style={{ height: start * ROW_H }} aria-hidden />}
            {window_.map((r, i) => {
              const idx = start + i;
              const own = r.unavailable_reason === "own recommendation";
              return (
                <div
                  key={r.id}
                  ref={(el) => {
                    if (el) rowEls.current.set(r.id, el);
                    else rowEls.current.delete(r.id);
                  }}
                  className="k-grid k-row"
                  data-selected={idx === cursor}
                  data-resolving={resolving.has(r.id)}
                  tabIndex={0}
                  onClick={() => setCursor(idx)}
                  onFocus={() => setCursor(idx)}
                >
                  <div>
                    <div className="k-rec-primary">
                      {sentence(r.reason_code)}
                    </div>
                    <div className="k-rec-sub ident">
                      {r.charge_id} · ••{r.card_last4} ·{" "}
                      {dotDate(r.created_at)}
                    </div>
                  </div>
                  <div className="k-amount">
                    <Money cents={r.amount_cents} currency={r.currency} />
                  </div>
                  <div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="k-cell-customer">
                    <Masked
                      entityType="refund_request"
                      entityId={r.id}
                      field="customer_email"
                      unmaskSignal={unmaskSignals[r.id] ?? 0}
                    />
                  </div>
                  <div className="k-cell-by" data-own={own}>
                    {inFlight === r.id ? (
                      <span className="k-shimmer">
                        {r.recommended_by_name ?? "Gate Agent"}
                      </span>
                    ) : (
                      r.recommended_by_name ?? (
                        <span className="k-dash">—</span>
                      )
                    )}
                  </div>
                  {actionCell(r, idx)}
                </div>
              );
            })}
            {end < visible.length && (
              <div
                style={{ height: (visible.length - end) * ROW_H }}
                aria-hidden
              />
            )}
          </>
        )}
      </div>
      <p className="k-shortcut-line">Press ? for shortcuts</p>
      {shortcutsOpen && (
        <div className="k-shortcuts" role="dialog" aria-label="Shortcuts">
          {SHORTCUTS.map(([key, label]) => (
            <div style={{ display: "contents" }} key={key}>
              <span>
                <Kbd>{key}</Kbd>
              </span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      {detailOpen && selected && (
        <aside className="k-panel" aria-label="Refund detail">
          <button
            type="button"
            className="k-btn quiet k-close"
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
          <p className="k-headline-id ident">{selected.charge_id}</p>
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
            <dd className="ident">••{selected.card_last4}</dd>
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
                <span className="k-dash">—</span>
              )}
            </dd>
            <dt>Created</dt>
            <dd>{dotDate(selected.created_at)}</dd>
          </dl>
        </aside>
      )}
    </>
  );
}
