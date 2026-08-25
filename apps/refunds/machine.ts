import type { RefundStatus } from "@kernel/db/schema";
import type { Transition } from "@kernel/rbac";

export const transitions: Record<
  Transition,
  { from: RefundStatus[]; to: RefundStatus }
> = {
  recommend: { from: ["pending"], to: "recommended" },
  approve: { from: ["pending", "recommended"], to: "approved" },
  reject: { from: ["pending", "recommended"], to: "rejected" },
  settle: { from: ["approved"], to: "settled" },
  fail: { from: ["approved"], to: "failed" },
};

export function canTransition(
  from: RefundStatus,
  transition: Transition
): boolean {
  return transitions[transition].from.includes(from);
}
