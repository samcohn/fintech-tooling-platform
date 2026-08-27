import { existsSync } from "node:fs";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  changeRequests,
  users,
  type ChangeRequest,
  type CrStatus,
} from "../db/schema";
import { writeAudit } from "../audit";
import { classifyRequest, writeTriageFile } from "./triage";
import {
  triggerDevinSession,
  type DevinSessionResult,
} from "../devin/client";
import { loadPlaybook, interpolate } from "../devin/playbook";
import { notifyTriaged, notifyStatusChanged } from "./slack";

function specExists(id: string): boolean {
  return existsSync(join(process.cwd(), ".devin", "specs", `${id}.md`));
}

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
    if (!row) throw new Error("change request insert returned no row");
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

/**
 * Full submit pipeline: record the request, run triage before any
 * Devin session is dispatched, then route by lane. App lane dispatches
 * under playbooks/app-change.md. Platform lane requires a
 * human-authored spec at .devin/specs/{id}.md before any work starts;
 * absent that, the request parks at awaiting_spec.
 */
export async function submitChangeRequest(
  actor: Actor,
  request: string
): Promise<ChangeRequest> {
  const created = await createChangeRequest(actor, request);
  const triage = classifyRequest(request);
  writeTriageFile(created.id, triage);

  let status: ChangeRequest["status"];
  let devin: DevinSessionResult | null = null;

  if (triage.lane === "platform") {
    status = specExists(created.id) ? "in_progress" : "awaiting_spec";
    if (status === "in_progress") {
      devin = await triggerDevinSession(
        interpolate(loadPlaybook("platform-change"), {
          request,
          requester: `${actor.name} <${actor.email}>`,
          app: "platform",
          id: created.id,
        })
      );
    }
  } else {
    devin = await triggerDevinSession(
      interpolate(loadPlaybook("app-change"), {
        request,
        requester: `${actor.name} <${actor.email}>`,
        app: "refunds",
        id: created.id,
      })
    );
    status = "in_progress";
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(changeRequests)
      .set({
        lane: triage.lane,
        status,
        classificationReasoning: triage.reasoning,
      })
      .where(eq(changeRequests.id, created.id))
      .returning();
    if (!row) throw new Error(`change request ${created.id} not found`);
    await writeAudit(tx, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: "change_request.triaged",
      entityType: "change_request",
      entityId: created.id,
      after: {
        lane: triage.lane,
        status,
        touchedPaths: triage.touchedPaths,
        devin,
      },
    });
    return row;
  });

  await notifyTriaged(updated, actor.name);
  return updated;
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
    if (!after) return null;
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

export async function updateRequestStatusAndNotify(
  actor: Actor,
  id: string,
  patch: StatusPatch
): Promise<ChangeRequest | null> {
  const row = await updateRequestStatus(actor, id, patch);
  if (row) await notifyStatusChanged(row, actor.name);
  return row;
}
