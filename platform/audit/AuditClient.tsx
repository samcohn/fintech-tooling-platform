"use client";

import { useMemo, useState } from "react";
import { FilterBar } from "@platform/ui";

export type AuditDto = {
  id: string;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
};

const ALL = "";

function ActionPill({ action }: { action: string }) {
  return <span className="lane-pill">{action}</span>;
}

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="k-cell-faint">null</span>;
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {JSON.stringify(value, null, 2)}
    </span>
  );
}

export function AuditClient({ rows }: { rows: AuditDto[] }) {
  const [actorEmail, setActorEmail] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);

  const actors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.actorEmail, r.actorName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const actions = useMemo(
    () => [...new Set(rows.map((r) => r.action))].sort(),
    [rows]
  );

  const visible = rows.filter(
    (r) =>
      (actorEmail === ALL || r.actorEmail === actorEmail) &&
      (action === ALL || r.action === action)
  );

  const open = visible.find((r) => r.id === openId) ?? null;
  const filtered = actorEmail !== ALL || action !== ALL;

  return (
    <>
      <FilterBar>
        <select
          className="k-input"
          value={actorEmail}
          onChange={(e) => setActorEmail(e.target.value)}
          aria-label="Filter by actor"
        >
          <option value={ALL}>All actors</option>
          {actors.map(([email, name]) => (
            <option key={email} value={email}>
              {name} ({email})
            </option>
          ))}
        </select>
        <select
          className="k-input"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by action"
        >
          <option value={ALL}>All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {filtered ? (
          <button
            type="button"
            className="k-btn"
            onClick={() => {
              setActorEmail(ALL);
              setAction(ALL);
            }}
          >
            Clear filters
          </button>
        ) : null}
        <span className="k-cell-muted">
          {visible.length} of {rows.length} entries
        </span>
      </FilterBar>

      {visible.length === 0 ? (
        <p className="k-empty">No audit entries match this filter.</p>
      ) : (
        <table className="k-table">
          <thead>
            <tr>
              <th style={{ width: 148 }}>When</th>
              <th style={{ width: 168 }}>Actor</th>
              <th style={{ width: 196 }}>Action</th>
              <th style={{ width: 116 }}>Entity</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                data-selected={r.id === openId}
                onClick={() => setOpenId(r.id === openId ? null : r.id)}
              >
                <td className="num">
                  {new Date(r.createdAt).toLocaleString("en-US", {
                    month: "numeric",
                    day: "numeric",
                    year: "2-digit",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td>{r.actorName}</td>
                <td>
                  <ActionPill action={r.action} />
                </td>
                <td>{r.entityType}</td>
                <td className="k-cell-truncate ident">{r.entityId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open ? (
        <aside className="k-panel">
          <button className="k-btn k-close" onClick={() => setOpenId(null)}>
            Close
          </button>
          <p className="k-headline">Audit entry</p>
          <p className="k-headline-id ident">{open.id}</p>
          <dl>
            <dt>When</dt>
            <dd>{new Date(open.createdAt).toLocaleString()}</dd>
            <dt>Actor</dt>
            <dd>
              {open.actorName} · {open.actorEmail} · {open.actorRole}
            </dd>
            <dt>Action</dt>
            <dd>
              <ActionPill action={open.action} />
            </dd>
            <dt>Entity</dt>
            <dd className="ident">
              {open.entityType} {open.entityId}
            </dd>
            <dt>Before</dt>
            <dd>
              <Json value={open.before} />
            </dd>
            <dt>After</dt>
            <dd>
              <Json value={open.after} />
            </dd>
          </dl>
        </aside>
      ) : null}
    </>
  );
}
