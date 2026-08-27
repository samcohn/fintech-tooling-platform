import { describe, it, expect, afterEach } from "vitest";
import {
  canCommit,
  approvalThresholdCents,
  requiredApproverRoles,
} from "./index";

const THRESHOLD = approvalThresholdCents();

const agent = { id: "u-agent", role: "agent" as const };
const approver = { id: "u-approver", role: "approver" as const };

describe("canCommit", () => {
  it("rejects self-approval at any amount", () => {
    expect(
      canCommit(agent, "approve", { amountCents: 1, recommendedBy: agent.id })
    ).toBe(false);
    expect(
      canCommit(approver, "approve", {
        amountCents: 1,
        recommendedBy: approver.id,
      })
    ).toBe(false);
    expect(
      canCommit(approver, "approve", {
        amountCents: 10_000_000,
        recommendedBy: approver.id,
      })
    ).toBe(false);
  });

  it("enforces the threshold exactly at the boundary", () => {
    expect(
      canCommit(agent, "approve", {
        amountCents: THRESHOLD - 1,
        recommendedBy: null,
      })
    ).toBe(true);
    expect(
      canCommit(agent, "approve", {
        amountCents: THRESHOLD,
        recommendedBy: null,
      })
    ).toBe(false);
    expect(
      canCommit(approver, "approve", {
        amountCents: THRESHOLD,
        recommendedBy: null,
      })
    ).toBe(true);
  });

  it("always allows recommend", () => {
    expect(
      canCommit(agent, "recommend", {
        amountCents: 10_000_000,
        recommendedBy: null,
      })
    ).toBe(true);
  });

  it("allows an approver to commit another actor's recommendation", () => {
    expect(
      canCommit(approver, "approve", {
        amountCents: THRESHOLD * 2,
        recommendedBy: agent.id,
      })
    ).toBe(true);
  });
});

describe("role-based approver assignment", () => {
  afterEach(() => {
    delete process.env.REFUND_APPROVER_ROLES;
  });

  it("is disabled when REFUND_APPROVER_ROLES is unset", () => {
    expect(requiredApproverRoles()).toBeNull();
  });

  it("restricts approvals to the configured role at any amount", () => {
    process.env.REFUND_APPROVER_ROLES = "approver";
    expect(
      canCommit(agent, "approve", { amountCents: 1, recommendedBy: null })
    ).toBe(false);
    expect(
      canCommit(approver, "approve", { amountCents: 1, recommendedBy: null })
    ).toBe(true);
  });

  it("composes with the amount threshold", () => {
    process.env.REFUND_APPROVER_ROLES = "agent,approver";
    // Role rule passes for the agent, but the threshold still applies.
    expect(
      canCommit(agent, "approve", {
        amountCents: THRESHOLD,
        recommendedBy: null,
      })
    ).toBe(false);
    expect(
      canCommit(agent, "approve", {
        amountCents: THRESHOLD - 1,
        recommendedBy: null,
      })
    ).toBe(true);
  });

  it("never permits self-approval, even for the configured role", () => {
    process.env.REFUND_APPROVER_ROLES = "approver";
    expect(
      canCommit(approver, "approve", {
        amountCents: 1,
        recommendedBy: approver.id,
      })
    ).toBe(false);
  });
});
