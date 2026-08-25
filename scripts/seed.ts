import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../kernel/db/schema";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/internal_tools";

const REASONS = [
  "duplicate_charge",
  "customer_request",
  "fraudulent",
  "product_unsatisfactory",
  "subscription_canceled",
  "billing_error",
];

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
        createdAt: new Date(now - (p * 2 + half) * 3_600_000),
      });
    }
  }

  // 188 more spread across statuses, roughly half above/below $500.
  for (let i = 0; i < 188; i++) {
    const chargeId = `ch_${2000 + i}`;
    const below = i % 2 === 0;
    const amount = below
      ? 500 + ((i * 731) % 49_000) // $5.00 – $495.00
      : 50_000 + ((i * 977) % 400_000); // $500.00 – $4,500.00
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
      reasonCode: pick(REASONS, i),
      requestedBy: i % 3 === 0 ? agent2.id : agent.id,
      recommendedBy: recommended ? (i % 3 === 0 ? agent.id : agent2.id) : null,
      committedBy: committed ? approver.id : null,
      status,
      idempotencyKey: `idem_${chargeId}`,
      createdAt: new Date(now - ((i * 13) % 45) * 86_400_000 - (i % 24) * 3_600_000),
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
