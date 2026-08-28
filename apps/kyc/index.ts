/**
 * KYC stub. Exists to exercise app-level access control at the
 * platform layer — only the compliance group reaches this surface,
 * and every refusal is audited. There is no real KYC logic here.
 */
export const KYC_CASES = [
  { id: "kyc_01", subject: "Acme Holdings LLC", status: "review" },
  { id: "kyc_02", subject: "Nimbus Trading Co", status: "cleared" },
  { id: "kyc_03", subject: "Vertex Capital SA", status: "escalated" },
] as const;
