/**
 * PII manifest for the refunds app. Every declared field renders
 * through <Masked> and never leaves an API route unredacted without an
 * audited unmask event.
 */
export const piiFields = [
  "customer_email",
  "card_last4",
  "billing_address",
] as const;

export type PiiField = (typeof piiFields)[number];

/**
 * Fields whose stored value is already a display-safe partial (e.g. the
 * last four card digits). These render unmasked so agents can reconcile
 * against customer conversations; full-value fields stay redacted.
 */
export const partialFields: readonly PiiField[] = ["card_last4"];

/** Fields that must be redacted in every list/API response. */
export const redactedFields = piiFields.filter(
  (f) => !partialFields.includes(f)
);
