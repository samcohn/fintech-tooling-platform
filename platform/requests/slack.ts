import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ChangeRequest, CrLane } from "../db/schema";

/**
 * Slack surface for the requests queue.
 *
 * Routing is by lane, and the two lanes are visibly different in
 * channel, tagged person, and precondition:
 *
 *   app      -> #internal-tools, tags @oncall, includes gate result
 *               and PR link.
 *   platform -> #platform, tags @platform-owner by name, explains the
 *               lane and that a human-authored spec is required before
 *               any code is written.
 *   blocked  -> the same channel as its lane, names the failing
 *               invariant, never includes a PR link.
 *
 * Delivery: if a webhook is configured for the channel
 * (SLACK_WEBHOOK_INTERNAL_TOOLS / SLACK_WEBHOOK_PLATFORM), the message
 * is posted to Slack. Otherwise it is appended to
 * .devin/slack-outbox.md so the exact message content is still
 * visible in the demo.
 */

const CHANNELS: Record<CrLane, string> = {
  app: "#internal-tools",
  platform: "#platform",
};

const WEBHOOKS: Record<CrLane, string | undefined> = {
  app: process.env.SLACK_WEBHOOK_INTERNAL_TOOLS,
  platform: process.env.SLACK_WEBHOOK_PLATFORM,
};

export type SlackMessage = { channel: string; text: string };

async function deliver(msg: SlackMessage, lane: CrLane): Promise<void> {
  const webhook = WEBHOOKS[lane];
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.text }),
    });
    return;
  }
  const dir = join(process.cwd(), ".devin");
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, "slack-outbox.md"),
    `\n---\n\n**${msg.channel}**\n\n${msg.text}\n`
  );
}

export async function notifyTriaged(
  cr: ChangeRequest,
  requesterName: string
): Promise<void> {
  const lane = cr.lane ?? "app";
  const lines: string[] = [];
  if (lane === "platform") {
    lines.push(
      `@platform-owner — platform-lane change request from ${requesterName}:`,
      `> ${cr.request}`,
      `This touches \`/platform/**\`, so it is a platform change: it runs the full invariant suite and requires your CODEOWNERS review.`,
      `No code will be written until a human-authored spec exists at \`.devin/specs/${cr.id}.md\`` +
        (cr.status === "awaiting_spec"
          ? " — status is `awaiting_spec` until then."
          : ".")
    );
  } else {
    lines.push(
      `@oncall — app-lane change request from ${requesterName}:`,
      `> ${cr.request}`,
      `Scoped to \`/apps/**\`; Devin is on it and will run \`pnpm validate:cr\` before opening a PR.`
    );
  }
  await deliver({ channel: CHANNELS[lane], text: lines.join("\n") }, lane);
}

export async function notifyStatusChanged(
  cr: ChangeRequest,
  requesterName: string
): Promise<void> {
  const lane = cr.lane ?? "app";
  const lines: string[] = [];
  if (cr.status === "blocked") {
    lines.push(
      `${lane === "platform" ? "@platform-owner" : "@oncall"} — request from ${requesterName} is blocked:`,
      `> ${cr.request}`,
      `Failing invariant: ${cr.blockedReason ?? "unspecified"}. No PR was opened.`
    );
  } else {
    lines.push(
      `${lane === "platform" ? "@platform-owner" : "@oncall"} — request from ${requesterName} is now \`${cr.status}\`:`,
      `> ${cr.request}`
    );
    if (cr.status === "pr_open" && cr.prUrl) {
      lines.push(`Gates passed. PR: ${cr.prUrl}`);
    }
    if (cr.status === "merged" && cr.prUrl) {
      lines.push(`Merged after CODEOWNERS review: ${cr.prUrl}`);
    }
  }
  await deliver({ channel: CHANNELS[lane], text: lines.join("\n") }, lane);
}
