/**
 * Stages the requests queue for the demo. Idempotent-ish: clears any
 * previously staged rows first (change_request only; the audit log is
 * append-only and keeps the full history).
 *
 * Three requests, staged so app-lane work looks fast and only
 * platform-lane work has waiting states:
 *
 * 1. App lane, pr_open with a live PR link — the fast path.
 * 2. Platform lane, walked through the full arc to merged, gated on a
 *    human-authored spec at .devin/specs/{id}.md.
 * 3. App lane, blocked with a named failing invariant, no PR.
 *
 * Dispatch to Devin is deliberately skipped here — this seeds the
 * queue state for recording, it does not spawn sessions.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, sql } from "../platform/db/client";
import { changeRequests, users } from "../platform/db/schema";
import {
  createChangeRequest,
  updateRequestStatusAndNotify,
  type Actor,
} from "../platform/requests/service";
import { classifyRequest, writeTriageFile } from "../platform/requests/triage";
import { writeAudit } from "../platform/audit";
import { notifyTriaged } from "../platform/requests/slack";

const PR_URL = "https://github.com/samcohn/fintech-tooling-platform/pull/1";

async function actorByEmail(email: string): Promise<Actor> {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`seed user missing: ${email}`);
  return { id: u.id, email: u.email, name: u.name };
}

async function triage(actor: Actor, id: string, request: string) {
  const result = classifyRequest(request);
  writeTriageFile(id, result);
  const status = result.lane === "platform" ? "awaiting_spec" : "in_progress";
  const [row] = await db
    .update(changeRequests)
    .set({
      lane: result.lane,
      status,
      classificationReasoning: result.reasoning,
    })
    .where(eq(changeRequests.id, id))
    .returning();
  if (!row) throw new Error(`request ${id} not found`);
  await writeAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "change_request.triaged",
    entityType: "change_request",
    entityId: id,
    after: { lane: result.lane, status, touchedPaths: result.touchedPaths },
  });
  await notifyTriaged(row, actor.name);
  return row;
}

async function main() {
  const agent = await actorByEmail("agent@demo.co");
  const approver = await actorByEmail("approver@demo.co");

  await db.delete(changeRequests);

  // 1. App lane: fast path, already at pr_open with a live PR link.
  const appReq = await createChangeRequest(
    agent,
    "add a chargeback reason column to the refunds queue and CSV export"
  );
  await triage(agent, appReq.id, appReq.request);
  await updateRequestStatusAndNotify(agent, appReq.id, {
    status: "pr_open",
    prUrl: PR_URL,
  });

  // 2. Platform lane: the real role-based approval request, full arc.
  const platReq = await createChangeRequest(
    approver,
    "we need approvers assigned by role, not just by amount."
  );
  await triage(approver, platReq.id, platReq.request);

  // Platform owner authors the spec; only then does work begin.
  const specDir = join(process.cwd(), ".devin", "specs");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, `${platReq.id}.md`),
    `# Spec — role-based approver assignment

Request: "we need approvers assigned by role, not just by amount."

## Interface

Extend the approval primitive in \`platform/rbac\`:

- \`requiredApproverRoles(): Role[] | null\` — server-resolved from
  \`REFUND_APPROVER_ROLES\` (comma-separated). Unset returns null and
  disables the rule.
- \`canCommit\` composes both rules: an approval must satisfy the
  role rule (when configured) AND the existing amount threshold.

## Invariants that must hold afterward

- Self-approval remains prohibited at any amount, under any mode.
- The amount threshold behaves exactly as before when the role rule
  is unset.
- Policy is server config; never read from request input.

## Must not change

- Anything under \`/apps/refunds\`. The app consumes \`canCommit\`
  unchanged — this is the proof that platform changes are isolated.
`
  );

  await updateRequestStatusAndNotify(approver, platReq.id, {
    status: "in_progress",
  });
  await updateRequestStatusAndNotify(approver, platReq.id, {
    status: "pr_open",
    prUrl: PR_URL,
  });
  await updateRequestStatusAndNotify(approver, platReq.id, {
    status: "merged",
  });

  // 3. App lane: blocked on a named invariant, no PR.
  const blockedReq = await createChangeRequest(
    agent,
    "let agents approve their own refund recommendations under $2,000 to speed up the queue"
  );
  await triage(agent, blockedReq.id, blockedReq.request);
  await updateRequestStatusAndNotify(agent, blockedReq.id, {
    status: "blocked",
    blockedReason:
      "self-approval prohibition (platform/rbac canCommit): no actor may commit their own recommendation at any amount",
  });

  console.log("Staged 3 demo requests:");
  console.log(`  app/pr_open   ${appReq.id}`);
  console.log(`  platform/merged ${platReq.id}`);
  console.log(`  app/blocked   ${blockedReq.id}`);
}

main()
  .then(() => sql.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
