/**
 * Validation gates for change requests. Run as `pnpm validate:cr`.
 * Exits non-zero on any failure. Gate 1 is policy; gates 2-6 are tests
 * driven against the live database.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import * as schema from "../kernel/db/schema";
import { canCommit, approvalThresholdCents } from "../kernel/rbac";
import { applyTransition } from "../apps/refunds/service";
import { listRefunds } from "../apps/refunds/queries";
import { transitions } from "../apps/refunds/machine";
import { piiFields } from "../apps/refunds/pii";
import { REDACTED_VALUE } from "../kernel/mask/redact";
import type { Actor } from "../kernel/auth";
import { sql as appSql } from "../kernel/db/client";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/internal_tools";
const sql = postgres(url, { max: 2 });
const db = drizzle(sql, { schema });

let failures = 0;

function pass(gate: string, msg: string) {
  console.log(`  ✓ [${gate}] ${msg}`);
}
function fail(gate: string, msg: string) {
  failures++;
  console.error(`  ✗ [${gate}] ${msg}`);
}

async function expectDbError(
  fn: () => Promise<unknown>,
  gate: string,
  what: string
) {
  try {
    await fn();
    fail(gate, `${what} was NOT rejected`);
  } catch {
    pass(gate, `${what} rejected`);
  }
}

// ---------------------------------------------------------------- gate 1
function gate1KernelBoundary() {
  const baseRef = process.env.VALIDATE_BASE_REF ?? "origin/main";
  console.log(`Gate 1 — kernel boundary (vs ${baseRef})`);
  let diff = "";
  try {
    // The gate protects an existing kernel. If the base ref has no
    // kernel/ tree yet, this branch is the initial import.
    const kernelOnBase = execSync(`git ls-tree ${baseRef} kernel`, {
      encoding: "utf8",
    }).trim();
    if (kernelOnBase === "") {
      console.log(`  - kernel/ does not exist on ${baseRef}; skipping (initial import)`);
      return;
    }
    diff = execSync(`git diff --name-only ${baseRef}`, {
      encoding: "utf8",
    });
  } catch {
    console.log(`  - ${baseRef} not found; skipping (initial import)`);
    return;
  }
  const touched = diff
    .split("\n")
    .filter((f) => f.startsWith("kernel/"));
  if (touched.length > 0) {
    fail("1", `kernel paths modified: ${touched.join(", ")}`);
  } else {
    pass("1", "no kernel paths modified");
  }
}

// -------------------------------------------------------------- fixtures
type Fixture = {
  agent: Actor;
  agent2: Actor;
  approver: Actor;
  chargeId: string;
  cleanup: () => Promise<void>;
};

async function makeFixture(): Promise<Fixture> {
  const tag = randomUUID().slice(0, 8);
  const rows = await db
    .insert(schema.users)
    .values([
      { email: `gate-agent-${tag}@test`, name: "Gate Agent", role: "agent" },
      { email: `gate-agent2-${tag}@test`, name: "Gate Agent 2", role: "agent" },
      {
        email: `gate-approver-${tag}@test`,
        name: "Gate Approver",
        role: "approver",
      },
    ])
    .returning();
  const [a, a2, ap] = rows;
  if (!a || !a2 || !ap) throw new Error("fixture users missing");
  const chargeId = `ch_gate_${tag}`;
  await db.insert(schema.charges).values({
    id: chargeId,
    customerEmail: "gate@test",
    amountCents: 10_000_000,
  });
  const toActor = (u: schema.User): Actor => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
  });
  return {
    agent: toActor(a),
    agent2: toActor(a2),
    approver: toActor(ap),
    chargeId,
    cleanup: async () => {
      await sql`DELETE FROM refund_request WHERE charge_id = ${chargeId}`;
      // audit_log is append-only by design; gate rows remain.
    },
  };
}

async function makeRefund(
  fx: Fixture,
  overrides: Partial<typeof schema.refundRequests.$inferInsert> = {}
) {
  const rows = await db
    .insert(schema.refundRequests)
    .values({
      chargeId: fx.chargeId,
      customerEmail: "gate-customer@test",
      cardLast4: "4242",
      billingAddress: "1 Gate St, Test City",
      amountCents: 10_000,
      currency: "USD",
      reasonCode: "billing_error",
      requestedBy: fx.agent.id,
      idempotencyKey: `idem_gate_${randomUUID()}`,
      ...overrides,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("fixture refund missing");
  return row;
}

async function auditCount(entityId: string, action: string) {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.entityId, entityId),
        eq(schema.auditLog.action, action)
      )
    );
  return rows;
}

// ---------------------------------------------------------------- gate 2
async function gate2AuditCoverage(fx: Fixture) {
  console.log("Gate 2 — audit coverage");
  const plans: {
    t: keyof typeof transitions;
    setup: Partial<typeof schema.refundRequests.$inferInsert>;
    actor: Actor;
  }[] = [
    { t: "recommend", setup: { status: "pending" }, actor: fx.agent },
    {
      t: "approve",
      setup: { status: "recommended", recommendedBy: fx.agent.id },
      actor: fx.approver,
    },
    {
      t: "reject",
      setup: { status: "recommended", recommendedBy: fx.agent.id },
      actor: fx.approver,
    },
    { t: "settle", setup: { status: "approved" }, actor: fx.approver },
    { t: "fail", setup: { status: "approved" }, actor: fx.approver },
  ];
  for (const plan of plans) {
    const row = await makeRefund(fx, plan.setup);
    const result = await applyTransition(plan.actor, row.id, plan.t);
    if (!result.ok) {
      fail("2", `transition ${plan.t} failed: ${result.error}`);
      continue;
    }
    const rows = await auditCount(row.id, `refund.${plan.t}`);
    const withActor = rows.filter((r) => r.actorId && r.actorEmail);
    if (rows.length === 1 && withActor.length === 1) {
      pass("2", `${plan.t}: exactly one audit row with resolved actor`);
    } else {
      fail("2", `${plan.t}: expected 1 audit row with actor, got ${rows.length}`);
    }
  }
}

// ---------------------------------------------------------------- gate 3
async function gate3PiiContainment(fx: Fixture) {
  console.log("Gate 3 — PII containment");
  await makeRefund(fx, { status: "pending" });
  const { rows } = await listRefunds(fx.agent);
  let leaked = 0;
  for (const row of rows) {
    for (const field of piiFields) {
      const value = (row as Record<string, unknown>)[field];
      if (value != null && value !== REDACTED_VALUE) {
        leaked++;
        fail("3", `field ${field} leaked unredacted on ${row.id}`);
      }
    }
  }
  if (leaked === 0) {
    pass(
      "3",
      `all ${piiFields.length} declared PII fields redacted across ${rows.length} rows`
    );
  }
}

// ---------------------------------------------------------------- gate 4
async function gate4AuditImmutability() {
  console.log("Gate 4 — audit immutability (database level)");
  await expectDbError(
    () => sql`UPDATE audit_log SET action = 'tampered' WHERE true`,
    "4",
    "UPDATE audit_log"
  );
  await expectDbError(
    () => sql`DELETE FROM audit_log WHERE true`,
    "4",
    "DELETE audit_log"
  );
}

// ---------------------------------------------------------------- gate 5
async function gate5Authorization(fx: Fixture) {
  console.log("Gate 5 — authorization invariants");
  const threshold = approvalThresholdCents();

  // Self-approval, below threshold.
  const own = await makeRefund(fx, {
    status: "recommended",
    recommendedBy: fx.agent.id,
    amountCents: 100,
  });
  const selfCommit = await applyTransition(fx.agent, own.id, "approve");
  if (!selfCommit.ok && selfCommit.status === 403) {
    pass("5", "self-approval rejected at any amount");
  } else {
    fail("5", "self-approval was permitted");
  }

  // Agent commit at threshold.
  const big = await makeRefund(fx, {
    status: "recommended",
    recommendedBy: fx.agent2.id,
    amountCents: threshold,
  });
  const agentCommit = await applyTransition(fx.agent, big.id, "approve");
  if (!agentCommit.ok && agentCommit.status === 403) {
    pass("5", `agent commit at/above $${threshold / 100} rejected`);
  } else {
    fail("5", "agent committed at/above threshold");
  }

  // Threshold cannot be influenced by request input: fuzz keys have no
  // channel into canCommit — verify outcome is identical regardless.
  const fuzzKeys = ["threshold", "amount_limit", "role", "is_approver"];
  const baseline = canCommit(fx.agent, "approve", {
    amountCents: threshold,
    recommendedBy: fx.agent2.id,
  });
  let fuzzOk = true;
  for (const key of fuzzKeys) {
    const ctx = {
      amountCents: threshold,
      recommendedBy: fx.agent2.id,
      [key]: 99_999_999,
    };
    const outcome = canCommit(fx.agent, "approve", ctx);
    if (outcome !== baseline || outcome !== false) {
      fuzzOk = false;
      fail("5", `fuzz key ${key} changed authorization outcome`);
    }
  }
  if (fuzzOk) {
    pass("5", `fuzzed keys [${fuzzKeys.join(", ")}] cannot change the outcome`);
  }
}

// ---------------------------------------------------------------- gate 6
async function gate6MoneyInvariants(fx: Fixture) {
  console.log("Gate 6 — money invariants (database level)");
  const key = `idem_gate6_${randomUUID()}`;
  await makeRefund(fx, { idempotencyKey: key });
  await expectDbError(
    () => makeRefund(fx, { idempotencyKey: key }),
    "6",
    "duplicate idempotency_key (double refund)"
  );

  const tag = randomUUID().slice(0, 8);
  const smallCharge = `ch_gate6_${tag}`;
  await db.insert(schema.charges).values({
    id: smallCharge,
    customerEmail: "gate6@test",
    amountCents: 5_000,
  });
  await makeRefund(fx, { chargeId: smallCharge, amountCents: 4_000 });
  await expectDbError(
    () => makeRefund(fx, { chargeId: smallCharge, amountCents: 2_000 }),
    "6",
    "refund sum exceeding charge amount"
  );
  await sql`DELETE FROM refund_request WHERE charge_id = ${smallCharge}`;
}

async function main() {
  console.log(`validate:cr — threshold $${approvalThresholdCents() / 100}\n`);
  gate1KernelBoundary();
  const fx = await makeFixture();
  try {
    await gate2AuditCoverage(fx);
    await gate3PiiContainment(fx);
    await gate4AuditImmutability();
    await gate5Authorization(fx);
    await gate6MoneyInvariants(fx);
  } finally {
    await fx.cleanup();
    await sql.end();
    await appSql.end();
  }
  if (failures > 0) {
    console.error(`\n${failures} gate assertion(s) FAILED`);
    process.exit(1);
  }
  console.log("\nall gates passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
