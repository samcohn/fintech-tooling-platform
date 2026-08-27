import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { writeAudit } from "./index";
import { handleUnmask } from "../mask/unmask";
import type { Actor } from "../auth";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/internal_tools";

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });

let actor: Actor;

beforeAll(async () => {
  const rows = await db
    .insert(schema.users)
    .values({
      email: `audit-test-${randomUUID().slice(0, 8)}@test`,
      name: "Audit Tester",
      role: "agent",
    })
    .returning();
  const u = rows[0];
  if (!u) throw new Error("test user missing");
  actor = { id: u.id, email: u.email, name: u.name, role: u.role };
});

afterAll(async () => {
  await sql.end();
});

describe("audit_log trigger", () => {
  it("rejects UPDATE at the database level", async () => {
    await writeAudit(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: "test.update",
      entityType: "test",
      entityId: "t1",
    });
    await expect(
      sql`UPDATE audit_log SET action = 'tampered' WHERE actor_id = ${actor.id}`
    ).rejects.toThrow(/append-only/);
  });

  it("rejects DELETE at the database level", async () => {
    await expect(
      sql`DELETE FROM audit_log WHERE actor_id = ${actor.id}`
    ).rejects.toThrow(/append-only/);
  });
});

describe("unmask", () => {
  it("emits exactly one audit row naming actor and field", async () => {
    const entityId = randomUUID();
    const res = await handleUnmask(
      actor,
      { entityType: "refund_request", entityId, field: "customer_email" },
      ["customer_email"],
      async () => "person@example.com"
    );
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.entityId, entityId),
          eq(schema.auditLog.action, "unmask.customer_email")
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(actor.id);
    expect(rows[0]?.actorEmail).toBe(actor.email);
  });

  it("rejects fields not in the PII manifest", async () => {
    const res = await handleUnmask(
      actor,
      { entityType: "refund_request", entityId: randomUUID(), field: "ssn" },
      ["customer_email"],
      async () => "should-not-load"
    );
    expect(res.status).toBe(400);
  });
});
