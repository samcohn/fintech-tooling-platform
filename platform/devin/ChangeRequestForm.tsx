"use client";

import { useState } from "react";

type Result = {
  id: string;
  devin:
    | { triggered: true; sessionId: string; url: string }
    | { triggered: false; reason: string };
};

export function ChangeRequestForm() {
  const [request, setRequest] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, app: "refunds" }),
      });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) setError(data.error ?? "failed");
      else setResult(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 640 }}>
      <p className="who">
        Describe the change in plain English. Devin works inside the
        guardrails: it cannot touch the kernel, every transition stays
        audited, and a PR only opens if the validation gates pass.
      </p>
      <textarea
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        rows={5}
        style={{ width: "100%", font: "inherit", padding: 8 }}
        placeholder='e.g. "add a chargeback reason code and show it in the queue"'
        required
        minLength={10}
      />
      <div className="k-actionrail">
        <button className="k-btn" disabled={busy || request.length < 10}>
          {busy ? "submitting…" : "submit change request"}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: "var(--signal)" }}>
          {error}
        </p>
      )}
      {result && (
        <div>
          <p>
            Change request <strong>{result.id}</strong> recorded in the audit
            log.
          </p>
          {result.devin.triggered ? (
            <p>
              Devin session started:{" "}
              <a href={result.devin.url}>{result.devin.sessionId}</a>
            </p>
          ) : (
            <p className="who">Devin not triggered: {result.devin.reason}</p>
          )}
        </div>
      )}
    </form>
  );
}
