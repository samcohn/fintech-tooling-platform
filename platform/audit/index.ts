import { desc, eq } from "drizzle-orm";
import { auditLog, users } from "../db/schema";
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

export type AuditListRow = {
  id: string;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
};

/**
 * Read the log for the audit surface. Newest first, all actions and all
 * entity types in one list — refund transitions, unmasks and access
 * denials share this table by design. Read-only: there is no update or
 * delete path, and the database rejects both.
 */
export async function listAuditEntries(
  filter: { actorEmail?: string } = {},
  limit = 500
): Promise<AuditListRow[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      actorEmail: auditLog.actorEmail,
      actorName: users.name,
      actorRole: users.role,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(users, eq(auditLog.actorId, users.id))
    .where(filter.actorEmail ? eq(auditLog.actorEmail, filter.actorEmail) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  return rows;
}
