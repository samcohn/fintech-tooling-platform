import type { Role } from "../db/schema";

export type RbacActor = { id: string; role: Role };

export type CommitContext = {
  /** Amount of the record being acted on, in cents. */
  amountCents: number;
  /** Who recommended this record, if anyone. */
  recommendedBy: string | null;
};

export type Transition =
  | "recommend"
  | "approve"
  | "reject"
  | "settle"
  | "fail";

/**
 * Server-resolved approval threshold. Configured per deployment; never
 * read from request input.
 */
export function approvalThresholdCents(): number {
  const raw = process.env.REFUND_APPROVAL_THRESHOLD_CENTS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50_000;
}

/**
 * Whether `actor` may commit `transition` on a record in `context`.
 *
 * Invariants:
 * - No actor may ever commit their own recommendation, at any amount.
 * - At or above the threshold, only an approver may commit an approval.
 * - Below the threshold, an agent may commit directly.
 */
export function canCommit(
  actor: RbacActor,
  transition: Transition,
  context: CommitContext
): boolean {
  if (transition === "recommend") {
    return true;
  }
  if (transition === "approve" || transition === "reject") {
    if (context.recommendedBy !== null && context.recommendedBy === actor.id) {
      return false;
    }
    if (transition === "approve") {
      if (context.amountCents >= approvalThresholdCents()) {
        return actor.role === "approver";
      }
      return true;
    }
    return true;
  }
  // settle / fail are settlement status updates, open to both roles.
  return true;
}
