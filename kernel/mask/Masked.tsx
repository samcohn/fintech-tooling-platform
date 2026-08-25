"use client";

import { useState } from "react";
import { REDACTED_VALUE } from "./redact";

type Props = {
  entityType: string;
  entityId: string;
  field: string;
  unmaskEndpoint?: string;
};

/**
 * Renders redacted by default. Unmasking calls the app's unmask route,
 * which writes an audit row naming the actor and field before the value
 * is revealed.
 */
export function Masked({
  entityType,
  entityId,
  field,
  unmaskEndpoint = "/api/unmask",
}: Props) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function unmask(e: React.MouseEvent) {
    e.stopPropagation();
    if (value !== null || loading) return;
    setLoading(true);
    try {
      const res = await fetch(unmaskEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, field }),
      });
      if (res.ok) {
        const data = (await res.json()) as { value: string };
        setValue(data.value);
      }
    } finally {
      setLoading(false);
    }
  }

  if (value !== null) return <span className="masked-revealed">{value}</span>;

  return (
    <button
      type="button"
      className="masked"
      onClick={unmask}
      title={`Unmask ${field} (audited)`}
    >
      {loading ? "…" : REDACTED_VALUE}
    </button>
  );
}
