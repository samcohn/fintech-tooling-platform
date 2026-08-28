import { db } from "../db/client";
import { writeAudit } from "../audit";
import type { Actor } from "../auth";
import { canAccessApp, type AppId } from "./index";

/**
 * Resolve app access for `actor` and audit any denial. Runs at the
 * platform layer before an app route executes; the refusal itself is
 * part of the audit trail.
 */
export async function resolveAppAccess(
  actor: Actor,
  app: AppId
): Promise<boolean> {
  if (canAccessApp(actor, app)) return true;
  await writeAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "access_denied",
    entityType: "app",
    entityId: app,
    before: null,
    after: null,
  });
  return false;
}
