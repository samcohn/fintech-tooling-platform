import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../kernel/db/schema";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/internal_tools";

// Weighted, not round-robin: duplicate charge and billing error
// dominate in reality.
const REASONS = [
  "duplicate_charge",
  "duplicate_charge",
  "duplicate_charge",
  "billing_error",
  "billing_error",
  "billing_error",
  "customer_request",
  "customer_request",
  "subscription_canceled",
  "product_unsatisfactory",
  "fraudulent",
];

// Deterministic pseudo-random in [0, 1).
function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Long tail of small refunds, a handful above threshold, a few large.
function realisticAmount(i: number): number {
  const r = rand(i);
  if (r < 0.55) return 500 + Math.floor(rand(i + 1) * 14_500); // $5–$150
  if (r < 0.8) return 15_000 + Math.floor(rand(i + 2) * 34_900); // $150–$499
  if (r < 0.97) return 50_000 + Math.floor(rand(i + 3) * 150_000); // $500–$2,000
  return 200_000 + Math.floor(rand(i + 4) * 90_000); // $2,000–$2,900
}

const FIRST = ["ana", "ben", "carla", "dev", "elena", "frank", "grace", "hiro", "ida", "jon", "kim", "luis", "mona", "nate", "olga", "pri", "quinn", "rosa", "sam", "tara"];
const LAST = ["moreno", "chu", "okafor", "silva", "novak", "haddad", "kim", "brennan", "sato", "ali"];
const STREETS = ["Maple Ave", "Oak St", "Cedar Ln", "5th Ave", "Pine Rd", "Elm St", "Broadway", "Lakeview Dr"];
const CITIES = ["Austin TX", "Columbus OH", "Portland OR", "Raleigh NC", "Tucson AZ", "Albany NY", "Boise ID", "Reno NV"];

function pick<T>(arr: T[], i: number): T {
  const v = arr[i % arr.length];
  if (v === undefined) throw new Error("empty array");
  return v;
}

async function main() {
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  await sql`TRUNCATE refund_request, audit_log, charges, users RESTART IDENTITY CASCADE`;

  const seededUsers = await db
    .insert(schema.users)
    .values([
      { email: "agent@demo.co", name: "Avery Agent", role: "agent" },
      { email: "agent2@demo.co", name: "Alex Agent", role: "agent" },
      { email: "approver@demo.co", name: "Priya Approver", role: "approver" },
      { email: "compliance@demo.co", name: "Casey Compliance", role: "approver" },
    ])
    .returning();

  const agent = seededUsers.find((u) => u.email === "agent@demo.co");
  const agent2 = seededUsers.find((u) => u.email === "agent2@demo.co");
  const approver = seededUsers.find((u) => u.email === "approver@demo.co");
  if (!agent || !agent2 || !approver) throw new Error("seed users missing");

  const statuses = schema.refundStatusEnum.enumValues;
  const now = Date.now();

  type ChargeInsert = typeof schema.charges.$inferInsert;
  type RefundInsert = typeof schema.refundRequests.$inferInsert;
  const chargeRows: ChargeInsert[] = [];
  const refundRows: RefundInsert[] = [];

  // Six charge pairs sharing a charge_id, to exercise double-refund
  // protection: two partial refunds against one charge.
  for (let p = 0; p < 6; p++) {
    const chargeId = `ch_pair_${1000 + p}`;
    const chargeAmount = 120_000 + p * 10_000;
    const email = `${pick(FIRST, p)}.${pick(LAST, p)}@example.com`;
    chargeRows.push({
      id: chargeId,
      customerEmail: email,
      amountCents: chargeAmount,
    });
    for (let half = 0; half < 2; half++) {
      const amount = Math.floor(chargeAmount / 3) + half * 500;
      refundRows.push({
        chargeId,
        customerEmail: email,
        cardLast4: String(4000 + p * 7 + half).slice(-4),
        billingAddress: `${100 + p} ${pick(STREETS, p)}, ${pick(CITIES, p)}`,
        amountCents: amount,
        currency: "USD",
        reasonCode: pick(REASONS, p + half),
        requestedBy: half === 0 ? agent.id : agent2.id,
        status: "pending",
        idempotencyKey: `idem_${chargeId}_${half}`,
        // Scatter the shared-charge pairs through the queue instead of
        // clustering them at the top.
        createdAt: new Date(
          now - Math.floor(rand(p * 2 + half + 900) * 13) * 86_400_000 -
            (p * 5 + half * 3) * 3_600_000
        ),
      });
    }
  }

  // 188 more spread across statuses with a realistic amount
  // distribution and dates across ~14 days.
  for (let i = 0; i < 188; i++) {
    const chargeId = `ch_${2000 + i}`;
    const amount = realisticAmount(i);
    const below = amount < 50_000;
    const chargeAmount = amount + ((i * 137) % 20_000);
    const email = `${pick(FIRST, i)}.${pick(LAST, i * 3 + 1)}${i}@example.com`;
    const status = pick([...statuses], i);
    const recommended =
      status === "recommended" ||
      ((status === "approved" || status === "rejected" || status === "settled" || status === "failed") &&
        !below);
    const committed =
      status === "approved" ||
      status === "rejected" ||
      status === "settled" ||
      status === "failed";
    chargeRows.push({
      id: chargeId,
      customerEmail: email,
      amountCents: chargeAmount,
    });
    refundRows.push({
      chargeId,
      customerEmail: email,
      cardLast4: String(1000 + ((i * 397) % 9000)),
      billingAddress: `${10 + i} ${pick(STREETS, i)}, ${pick(CITIES, i * 5 + 2)}`,
      amountCents: amount,
      currency: "USD",
      reasonCode: pick(REASONS, Math.floor(rand(i + 500) * REASONS.length)),
      requestedBy: i % 3 === 0 ? agent2.id : agent.id,
      recommendedBy: recommended ? (i % 3 === 0 ? agent.id : agent2.id) : null,
      committedBy: committed ? approver.id : null,
      status,
      idempotencyKey: `idem_${chargeId}`,
      createdAt: new Date(
        now - Math.floor(rand(i + 700) * 14) * 86_400_000 - (i % 24) * 3_600_000
      ),
    });
  }

  await db.insert(schema.charges).values(chargeRows);
  await db.insert(schema.refundRequests).values(refundRows);

  console.log(
    `seeded ${seededUsers.length} users, ${chargeRows.length} charges, ${refundRows.length} refund requests`
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
