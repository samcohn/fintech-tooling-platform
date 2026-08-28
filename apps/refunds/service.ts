import { eq } from "drizzle-orm";
import { db } from "@platform/db/client";
import { refundRequests, type RefundRequest } from "@platform/db/schema";
import { writeAudit } from "@platform/audit";
import { canCommit, type Transition } from "@platform/rbac";
import type { Actor } from "@platform/auth";
import { canTransition, transitions } from "./machine";

export type TransitionResult =
  | { ok: true; request: RefundRequest }
  | { ok: false; status: number; error: string };

/**
 * Apply a state transition. Authorization is resolved entirely
 * server-side via platform/rbac; every successful transition writes
 * exactly one audit row in the same database transaction.
 */
export async function applyTransition(
  actor: Actor,
  requestId: string,
  transition: Transition
): Promise<TransitionResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, requestId))
      .for("update");
    const current = rows[0];
    if (!current) return { ok: false, status: 404, error: "not found" };

    if (!canTransition(current.status, transition)) {
      return {
        ok: false,
        status: 409,
        error: `cannot ${transition} from ${current.status}`,
      };
    }

    const allowed = canCommit(actor, transition, {
      amountCents: current.amountCents,
      recommendedBy: current.recommendedBy,
    });
    if (!allowed) {
      return { ok: false, status: 403, error: "not permitted" };
    }

    const to = transitions[transition].to;
    const patch: Partial<RefundRequest> = { status: to };
    if (transition === "recommend") patch.recommendedBy = actor.id;
    if (transition === "approve" || transition === "reject") {
      patch.committedBy = actor.id;
    }

    const updated = await tx
      .update(refundRequests)
      .set(patch)
      .where(eq(refundRequests.id, requestId))
      .returning();
    const next = updated[0];
    if (!next) return { ok: false, status: 500, error: "update failed" };

    await writeAudit(tx, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: `refund.${transition}`,
      entityType: "refund_request",
      entityId: current.id,
      before: { status: current.status },
      after: { status: next.status },
    });

    return { ok: true, request: next };
  });
}
