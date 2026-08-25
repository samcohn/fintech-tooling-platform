import { auditLog } from "../db/schema";
import { db } from "../db/client";

export type AuditEntry = {
  actorId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Append one row to the audit log. Pass the enclosing transaction so
 * the audit row commits atomically with the state change it records.
 */
export async function writeAudit(
  executor: Db | Tx,
  entry: AuditEntry
): Promise<void> {
  await executor.insert(auditLog).values({
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
