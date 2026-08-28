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
 * Server-resolved role-based approver assignment. When
 * REFUND_APPROVER_ROLES is set (comma-separated), only actors holding
 * one of those roles may commit an approval, at any amount. Composes
 * with the amount threshold: an approval must satisfy both rules.
 * Unset means no role restriction, preserving prior behavior.
 */
export function requiredApproverRoles(): Role[] | null {
  const raw = process.env.REFUND_APPROVER_ROLES;
  if (!raw) return null;
  const roles = raw
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is Role => r === "agent" || r === "approver");
  return roles.length > 0 ? roles : null;
}

/**
 * Whether `actor` may commit `transition` on a record in `context`.
 *
 * Invariants:
 * - No actor may ever commit their own recommendation, at any amount,
 *   under any authorization mode.
 * - Approvals must satisfy every configured rule: the amount threshold
 *   and, when configured, the role-based approver assignment.
 * - At or above the threshold, only an approver may commit an approval.
 * - Below the threshold, an agent may commit directly (unless a role
 *   rule says otherwise).
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
      const roles = requiredApproverRoles();
      if (roles && !roles.includes(actor.role)) {
        return false;
      }
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

export type AppId = "refunds" | "kyc";

/**
 * App-level access groups, resolved at the platform layer before an
 * app route runs. Server config, never request input.
 */
const APP_ACCESS: Record<AppId, Role[]> = {
  refunds: ["agent", "approver", "compliance"],
  kyc: ["compliance"],
};

export function canAccessApp(actor: RbacActor, app: AppId): boolean {
  return APP_ACCESS[app].includes(actor.role);
}
