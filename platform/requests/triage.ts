import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CrLane } from "../db/schema";

export type TriageResult = {
  lane: CrLane;
  touchedPaths: string[];
  reasoning: string;
};

/**
 * Path signals: phrases in a request that indicate which part of the
 * tree the change would touch. Anything resolving to `/platform/**`
 * is a platform change — auth, rbac, audit, masking, thresholds, and
 * the shared UI system are all platform surface.
 */
const PLATFORM_SIGNALS: Array<{ pattern: RegExp; path: string }> = [
  { pattern: /approv\w* (threshold|role|assign)/i, path: "platform/rbac" },
  { pattern: /self.approv/i, path: "platform/rbac" },
  { pattern: /\brole\b|\brbac\b|\bpermission/i, path: "platform/rbac" },
  { pattern: /\baudit\b|\blog retention\b/i, path: "platform/audit" },
  { pattern: /\bmask|\bunmask|\bpii\b|\bredact/i, path: "platform/mask" },
  { pattern: /\bauth\b|\blogin\b|\bsign.?in\b|\bsso\b|\boidc\b/i, path: "platform/auth" },
  { pattern: /\bschema\b|\bmigration\b|\bdatabase trigger\b/i, path: "platform/db" },
  { pattern: /design token|typography|color palette|platform ui/i, path: "platform/ui" },
  { pattern: /\bplatform\b/i, path: "platform" },
];

const APP_SIGNALS: Array<{ pattern: RegExp; path: string }> = [
  { pattern: /refund/i, path: "apps/refunds" },
  { pattern: /queue|filter|column|sort|export|csv|field|reason/i, path: "apps/refunds" },
];

export function classifyRequest(request: string): TriageResult {
  const platformHits = PLATFORM_SIGNALS.filter((s) => s.pattern.test(request));
  const appHits = APP_SIGNALS.filter((s) => s.pattern.test(request));

  const touchedPaths = [
    ...new Set([
      ...platformHits.map((h) => h.path),
      ...appHits.map((h) => h.path),
    ]),
  ];

  const lane: CrLane = platformHits.length > 0 ? "platform" : "app";

  const lines = [
    `Request: ${JSON.stringify(request)}`,
    ``,
    `Touched paths:`,
    ...(touchedPaths.length > 0
      ? touchedPaths.map((p) => `- /${p}`)
      : ["- /apps/refunds (default app surface; no path signals matched)"]),
    ``,
    lane === "platform"
      ? `Lane: platform. The request touches /platform/** (${[
          ...new Set(platformHits.map((h) => `/${h.path}`)),
        ].join(", ")}). Platform changes require a human-authored spec at ` +
        `.devin/specs/{id}.md before any code is written, run the full ` +
        `invariant suite, and need CODEOWNERS review on /platform.`
      : `Lane: app. Nothing in the request resolves to /platform/**; the ` +
        `change is scoped to /apps/** and runs under the app playbook ` +
        `(pnpm validate:cr, PR on green). Gate 1 still fails any ` +
        `/platform/ diff in this lane.`,
  ];

  return { lane, touchedPaths, reasoning: lines.join("\n") };
}

/** Write the triage reasoning to .devin/triage.md for the audit trail. */
export function writeTriageFile(id: string, result: TriageResult): void {
  const dir = join(process.cwd(), ".devin");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "triage.md"),
    `# Triage — request ${id}\n\n${result.reasoning}\n`
  );
}
