import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["agent", "approver"]);

export const refundStatusEnum = pgEnum("refund_status", [
  "pending",
  "recommended",
  "approved",
  "rejected",
  "settled",
  "failed",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull(),
});

export const charges = pgTable("charges", {
  id: text("id").primaryKey(),
  customerEmail: text("customer_email").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
});

export const refundRequests = pgTable(
  "refund_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chargeId: text("charge_id")
      .notNull()
      .references(() => charges.id),
    customerEmail: text("customer_email").notNull(),
    cardLast4: text("card_last4").notNull(),
    billingAddress: text("billing_address").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    reasonCode: text("reason_code").notNull(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    recommendedBy: uuid("recommended_by").references(() => users.id),
    committedBy: uuid("committed_by").references(() => users.id),
    status: refundStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("refund_idempotency_key_uq").on(t.idempotencyKey)]
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type RefundRequest = typeof refundRequests.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
export type RefundStatus = RefundRequest["status"];
export type Role = User["role"];
