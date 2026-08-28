import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { resolveAppAccess } from "./access";
import type { Actor } from "../auth";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/internal_tools";

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });

let agent: Actor;
let compliance: Actor;

beforeAll(async () => {
  const rows = await db
    .insert(schema.users)
    .values([
      {
        email: `access-agent-${randomUUID().slice(0, 8)}@test`,
        name: "Access Agent",
        role: "agent",
      },
      {
        email: `access-compliance-${randomUUID().slice(0, 8)}@test`,
        name: "Access Compliance",
        role: "compliance",
      },
    ])
    .returning();
  const [a, c] = rows;
  if (!a || !c) throw new Error("test users missing");
  agent = { id: a.id, email: a.email, name: a.name, role: a.role };
  compliance = { id: c.id, email: c.email, name: c.name, role: c.role };
});

afterAll(async () => {
  await sql.end();
});

describe("app access", () => {
  it("denies an agent the kyc app and writes an audit row", async () => {
    const allowed = await resolveAppAccess(agent, "kyc");
    expect(allowed).toBe(false);
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.actorId, agent.id),
          eq(schema.auditLog.action, "access_denied"),
          eq(schema.auditLog.entityId, "kyc")
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorEmail).toBe(agent.email);
    expect(rows[0]?.before).toBeNull();
    expect(rows[0]?.after).toBeNull();
  });

  it("grants compliance the kyc app without auditing a denial", async () => {
    const allowed = await resolveAppAccess(compliance, "kyc");
    expect(allowed).toBe(true);
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.actorId, compliance.id));
    expect(rows).toHaveLength(0);
  });
});
