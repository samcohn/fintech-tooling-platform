"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@platform/ui";

export type RequestDto = {
  id: string;
  request: string;
  requesterName: string;
  submittedAt: string;
  lane: "app" | "platform" | null;
  status: string;
  prUrl: string | null;
  blockedReason: string | null;
  classificationReasoning: string | null;
  blockedMd: string | null;
  specMd: string | null;
};

/** One beat on `triaging` before a replayed row resolves. */
const REPLAY_BEAT_MS = 1200;

function LanePill({ lane }: { lane: RequestDto["lane"] }) {
  if (!lane) return <span className="k-cell-faint">—</span>;
  return <span className="lane-pill">{lane}</span>;
}

export function RequestsClient({ initialRows }: { initialRows: RequestDto[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (replayTimer.current) clearTimeout(replayTimer.current);
    },
    []
  );

  const open = rows.find((r) => r.id === openId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: text }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "Could not submit request");
      return;
    }
    const created = (await res.json()) as RequestDto & { replay?: boolean };
    setText("");
    if (created.replay) {
      // Attached to a staged record: hold on `triaging` for one beat,
      // then resolve to the staged final state.
      setRows((rs) => {
        const existing = rs.find((r) => r.id === created.id);
        const rest = rs.filter((r) => r.id !== created.id);
        return [existing ?? { ...created, blockedMd: null, specMd: null }, ...rest];
      });
      setReplayingId(created.id);
      replayTimer.current = setTimeout(() => {
        setReplayingId(null);
        router.refresh();
      }, REPLAY_BEAT_MS);
      return;
    }
    setRows((rs) => [{ ...created, blockedMd: null, specMd: null }, ...rs]);
    router.refresh();
  }

  function displayed(r: RequestDto): RequestDto {
    return r.id === replayingId
      ? { ...r, status: "triaging", lane: null, prUrl: null, blockedReason: null }
      : r;
  }

  return (
    <>
      <form onSubmit={submit} style={{ marginBottom: 24 }}>
        <textarea
          className="k-input"
          rows={3}
          placeholder="Describe the change in plain English"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div style={{ marginTop: 8 }}>
          <button className="k-btn" disabled={busy || text.trim().length < 10}>
            {busy ? "Submitting…" : "Submit request"}
          </button>
          {error ? (
            <span className="k-cell-muted" style={{ marginLeft: 12 }}>
              {error}
            </span>
          ) : null}
        </div>
      </form>

      <table className="k-table">
        <thead>
          <tr>
            <th>Request</th>
            <th style={{ width: 132 }}>Requester</th>
            <th style={{ width: 92 }}>Lane</th>
            <th style={{ width: 116 }}>Status</th>
            <th style={{ width: 88 }} className="num">
              Submitted
            </th>
            <th style={{ width: 72 }}>PR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(displayed).map((r) => (
            <tr
              key={r.id}
              data-selected={r.id === openId}
              onClick={() => setOpenId(r.id === openId ? null : r.id)}
            >
              <td className="k-cell-truncate">{r.request}</td>
              <td>{r.requesterName}</td>
              <td>
                <LanePill lane={r.lane} />
              </td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td className="num">
                {new Date(r.submittedAt).toLocaleDateString("en-US", {
                  month: "numeric",
                  day: "numeric",
                  year: "2-digit",
                })}
              </td>
              <td>
                {r.prUrl ? (
                  <a
                    href={r.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    PR
                  </a>
                ) : (
                  <span className="k-cell-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {open ? (
        <aside className="k-panel">
          <button className="k-btn k-close" onClick={() => setOpenId(null)}>
            Close
          </button>
          <p className="k-headline">Change request</p>
          <p className="k-headline-id">{open.id}</p>
          <dl>
            <dt>Request</dt>
            <dd>{open.request}</dd>
            <dt>Requester</dt>
            <dd>{open.requesterName}</dd>
            <dt>Lane</dt>
            <dd>
              <LanePill lane={open.lane} />
            </dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={open.status} />
            </dd>
            {open.prUrl ? (
              <>
                <dt>PR</dt>
                <dd>
                  <a href={open.prUrl} target="_blank" rel="noreferrer">
                    {open.prUrl}
                  </a>
                </dd>
              </>
            ) : null}
            {open.blockedReason ? (
              <>
                <dt>Blocked</dt>
                <dd>{open.blockedReason}</dd>
              </>
            ) : null}
            {open.blockedMd ? (
              <>
                <dt>blocked.md</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{open.blockedMd}</dd>
              </>
            ) : null}
            {open.specMd ? (
              <>
                <dt>Spec (human-authored)</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{open.specMd}</dd>
              </>
            ) : null}
            <dt>Classification</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>
              {open.classificationReasoning ?? "Triage has not run yet."}
            </dd>
          </dl>
        </aside>
      ) : null}
    </>
  );
}
