/**
 * Stages the requests queue for the demo from demo/staged-requests.json.
 * Idempotent-ish: clears any previously staged rows first (change_request
 * only; the audit log is append-only and keeps the full history).
 *
 * Three staged records:
 *
 * 1. App lane, pr_open with a live PR link — the fast path.
 * 2. Platform lane, walked through the full arc to merged, gated on a
 *    human-authored spec at .devin/specs/{id}.md.
 * 3. Platform lane, blocked on the self-approval invariant, no PR;
 *    .devin/blocked/{id}.md renders in the detail panel.
 *
 * Dispatch to Devin is deliberately skipped here — this seeds the
 * queue state for recording, it does not spawn sessions. With
 * DEMO_REPLAY=true, submitting matching text in the UI replays these
 * records instead of dispatching.
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
import { writeTriageFile, classifyRequest } from "../platform/requests/triage";
import { writeAudit } from "../platform/audit";
import { notifyTriaged } from "../platform/requests/slack";
import { loadStagedRequests, type StagedRequest } from "../platform/requests/replay";

async function actorByEmail(email: string): Promise<Actor> {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`seed user missing: ${email}`);
  return { id: u.id, email: u.email, name: u.name };
}

async function triage(actor: Actor, id: string, staged: StagedRequest) {
  const classified = classifyRequest(staged.text);
  writeTriageFile(id, { ...classified, lane: staged.lane, reasoning: staged.reasoning });
  const status = staged.lane === "platform" ? "awaiting_spec" : "in_progress";
  const [row] = await db
    .update(changeRequests)
    .set({
      lane: staged.lane,
      status,
      classificationReasoning: staged.reasoning,
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
    after: { lane: staged.lane, status },
  });
  await notifyTriaged(row, actor.name);
  return row;
}

function writeSpec(id: string, staged: StagedRequest) {
  const specDir = join(process.cwd(), ".devin", "specs");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, `${id}.md`),
    `# Spec — role-based approver assignment

Request: "${staged.text}"

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
}

function writeBlockedMd(id: string, staged: StagedRequest) {
  const dir = join(process.cwd(), ".devin", "blocked");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.md`),
    `# Blocked — change request ${id}

Request: "${staged.text}"

## Why this cannot proceed

The request asks for agents to commit their own refund recommendations
below $2,000. That contradicts the self-approval prohibition in
\`platform/rbac\` (\`canCommit\`): **no actor may commit their own
recommendation, at any amount**.

The prohibition is enforced in three places, all of which would fail:

1. \`platform/rbac\` unit tests (self-approval rejection).
2. The authorization-invariants gate in \`pnpm validate:cr\`.
3. The server-side transition handler, which resolves the rule from
   session identity, never from request input.

## Disposition

No PR opened. Satisfying this request requires deleting a named
invariant, which is outside both lanes' authority. If the business
wants a below-amount self-approval carve-out, that is a policy decision
for the platform owners, made in a spec, not a change request.
`
  );
}

async function main() {
  const staged = loadStagedRequests();

  await db.delete(changeRequests);

  for (const s of staged) {
    const actor = await actorByEmail(s.requester);
    const req = await createChangeRequest(actor, s.text);
    await triage(actor, req.id, s);

    if (s.spec) writeSpec(req.id, s);
    if (s.blockedMd) writeBlockedMd(req.id, s);

    if (s.status === "merged") {
      // Full platform arc: spec authored, work runs, PR opens, merges.
      await updateRequestStatusAndNotify(actor, req.id, {
        status: "in_progress",
      });
      await updateRequestStatusAndNotify(actor, req.id, {
        status: "pr_open",
        prUrl: s.prUrl,
      });
      await updateRequestStatusAndNotify(actor, req.id, { status: "merged" });
    } else if (s.status === "blocked") {
      await updateRequestStatusAndNotify(actor, req.id, {
        status: "blocked",
        blockedReason: s.blockedReason,
      });
    } else {
      await updateRequestStatusAndNotify(actor, req.id, {
        status: s.status,
        prUrl: s.prUrl ?? null,
      });
    }

    console.log(`  ${s.lane}/${s.status}  ${req.id}  "${s.text}"`);
  }

  console.log(`Staged ${staged.length} demo requests.`);
}

main()
  .then(() => sql.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
