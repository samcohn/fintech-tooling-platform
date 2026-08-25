import { describe, it, expect } from "vitest";
import { canCommit, approvalThresholdCents } from "./index";

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
