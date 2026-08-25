export type PiiManifest = readonly string[];

const REDACTED = "•••••";

/**
 * Redact every declared PII field on a record before it leaves the
 * server. API routes must pass all rows through this.
 */
export function redactRecord<T extends Record<string, unknown>>(
  record: T,
  manifest: PiiManifest
): T {
  const out: Record<string, unknown> = { ...record };
  for (const field of manifest) {
    if (field in out && out[field] != null) out[field] = REDACTED;
  }
  return out as T;
}

export function redactAll<T extends Record<string, unknown>>(
  records: T[],
  manifest: PiiManifest
): T[] {
  return records.map((r) => redactRecord(r, manifest));
}

export const REDACTED_VALUE = REDACTED;
