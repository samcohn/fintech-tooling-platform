"use client";

import { useEffect, useRef, useState } from "react";
import { REDACTED_VALUE } from "./redact";

type Props = {
  entityType: string;
  entityId: string;
  field: string;
  unmaskEndpoint?: string;
  /** Increment to trigger an unmask from a keystroke. */
  unmaskSignal?: number;
};

const REVEAL_MS = 30_000;

/**
 * Renders redacted by default. Unmasking is an explicit click or
 * keystroke (never hover) and calls the app's unmask route, which
 * writes an audit row naming the actor and field before the value is
 * revealed. A revealed field carries a persistent marker and re-masks
 * after 30 seconds or on window blur, whichever comes first.
 */
export function Masked({
  entityType,
  entityId,
  field,
  unmaskEndpoint = "/api/unmask",
  unmaskSignal = 0,
}: Props) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastSignal = useRef(unmaskSignal);

  async function unmask() {
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

  useEffect(() => {
    if (unmaskSignal > lastSignal.current) {
      lastSignal.current = unmaskSignal;
      void unmask();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unmaskSignal]);

  // Re-mask after 30s or on window blur, whichever comes first.
  useEffect(() => {
    if (value === null) return;
    const timer = setTimeout(() => setValue(null), REVEAL_MS);
    const onBlur = () => setValue(null);
    window.addEventListener("blur", onBlur);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("blur", onBlur);
    };
  }, [value]);

  if (value !== null)
    return <span className="masked-revealed">{value}</span>;

  return (
    <button
      type="button"
      className="masked"
      onClick={(e) => {
        e.stopPropagation();
        void unmask();
      }}
      title={`Unmask ${field} (audited)`}
    >
      {loading ? "…" : REDACTED_VALUE}
    </button>
  );
}
