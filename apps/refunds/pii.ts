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
