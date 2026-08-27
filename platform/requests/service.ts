import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  changeRequests,
  users,
  type ChangeRequest,
  type CrStatus,
} from "../db/schema";
import { writeAudit } from "../audit";

export type Actor = { id: string; email: string; name: string };

export type ChangeRequestRow = ChangeRequest & { requesterName: string };

export async function listChangeRequests(): Promise<ChangeRequestRow[]> {
  const rows = await db
    .select({
      cr: changeRequests,
      requesterName: users.name,
    })
    .from(changeRequests)
    .innerJoin(users, eq(changeRequests.requestedBy, users.id))
    .orderBy(desc(changeRequests.submittedAt));
  return rows.map((r) => ({ ...r.cr, requesterName: r.requesterName }));
}

/**
 * Record a change request. Writes to the shared audit_log — the same
 * log that records unmasks and refund transitions. There is no second
 * log.
 */
export async function createChangeRequest(
  actor: Actor,
  request: string
): Promise<ChangeRequest> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(changeRequests)
      .values({ request, requestedBy: actor.id })
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: "change_request.submitted",
      entityType: "change_request",
      entityId: row.id,
      after: { request },
    });
    return row;
  });
}

export type StatusPatch = {
  status: CrStatus;
  prUrl?: string | null;
  blockedReason?: string | null;
};

export async function updateRequestStatus(
  actor: Actor,
  id: string,
  patch: StatusPatch
): Promise<ChangeRequest | null> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.id, id));
    if (!before) return null;
    const [after] = await tx
      .update(changeRequests)
      .set({
        status: patch.status,
        prUrl: patch.prUrl === undefined ? before.prUrl : patch.prUrl,
        blockedReason:
          patch.blockedReason === undefined
            ? before.blockedReason
            : patch.blockedReason,
      })
      .where(eq(changeRequests.id, id))
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: "change_request.status_changed",
      entityType: "change_request",
      entityId: id,
      before: { status: before.status },
      after: {
        status: after.status,
        prUrl: after.prUrl,
        blockedReason: after.blockedReason,
      },
    });
    return after;
  });
}
