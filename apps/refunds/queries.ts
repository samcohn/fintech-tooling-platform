import { desc, eq, aliasedTable } from "drizzle-orm";
import { db } from "@kernel/db/client";
import { refundRequests, users } from "@kernel/db/schema";
import { redactAll } from "@kernel/mask/redact";
import { canCommit, approvalThresholdCents, type Transition } from "@kernel/rbac";
import type { Actor } from "@kernel/auth";
import { canTransition } from "./machine";
import { redactedFields } from "./pii";

export type RefundDto = {
  id: string;
  charge_id: string;
  customer_email: string;
  card_last4: string;
  billing_address: string;
  amount_cents: number;
  currency: string;
  reason_code: string;
  status: string;
  recommended_by: string | null;
  recommended_by_name: string | null;
  created_at: string;
  /** Server-resolved: which transitions this actor may commit. */
  actions: Transition[];
  /** Server-resolved reason when no action is available. */
  unavailable_reason: string | null;
};

const ALL: Transition[] = ["recommend", "approve", "reject", "settle", "fail"];

export async function listRefunds(
  actor: Actor,
  opts: { status?: string; onlyRecommended?: boolean } = {}
): Promise<{ rows: RefundDto[]; thresholdCents: number }> {
  const recommender = aliasedTable(users, "recommender");
  const base = db
    .select({ r: refundRequests, recommenderName: recommender.name })
    .from(refundRequests)
    .leftJoin(recommender, eq(refundRequests.recommendedBy, recommender.id))
    .orderBy(desc(refundRequests.createdAt))
    .limit(500);

  const raw = await base;

  const filtered = raw.filter(({ r }) => {
    if (opts.onlyRecommended && r.status !== "recommended") return false;
    if (opts.status && r.status !== opts.status) return false;
    return true;
  });

  const dtos = filtered.map(({ r, recommenderName }) => {
    const actions = ALL.filter(
      (t) =>
        canTransition(r.status, t) &&
        canCommit(actor, t, {
          amountCents: r.amountCents,
          recommendedBy: r.recommendedBy,
        }) &&
        // An agent below threshold approves directly; above it, the UI
        // shows recommend, never approve. Redundant with rbac but keeps
        // the action list unambiguous.
        !(t === "recommend" && r.status !== "pending")
    );
    let unavailableReason: string | null = null;
    if (actions.length === 0) {
      if (r.status === "recommended" && r.recommendedBy === actor.id) {
        unavailableReason = "own recommendation";
      } else if (r.status === "recommended") {
        unavailableReason = "awaiting approver";
      } else if (["rejected", "settled", "failed"].includes(r.status)) {
        unavailableReason = "closed";
      }
    }
    return {
      id: r.id,
      charge_id: r.chargeId,
      customer_email: r.customerEmail,
      card_last4: r.cardLast4,
      billing_address: r.billingAddress,
      amount_cents: r.amountCents,
      currency: r.currency,
      reason_code: r.reasonCode,
      status: r.status,
      recommended_by: r.recommendedBy,
      recommended_by_name: recommenderName,
      created_at: r.createdAt.toISOString(),
      actions,
      unavailable_reason: unavailableReason,
    };
  });

  return {
    rows: redactAll(dtos, redactedFields),
    thresholdCents: approvalThresholdCents(),
  };
}
