import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CrLane, CrStatus } from "../db/schema";

export type StagedRequest = {
  requester: string;
  text: string;
  lane: CrLane;
  status: CrStatus;
  reasoning: string;
  prUrl?: string;
  blockedReason?: string;
  spec?: boolean;
  blockedMd?: boolean;
};

const STAGED_PATH = join(process.cwd(), "demo", "staged-requests.json");

export function loadStagedRequests(): StagedRequest[] {
  if (!existsSync(STAGED_PATH)) return [];
  return JSON.parse(readFileSync(STAGED_PATH, "utf8")) as StagedRequest[];
}

/** Lowercased, trimmed, punctuation stripped, whitespace collapsed. */
export function normalizeRequestText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function replayEnabled(): boolean {
  return process.env.DEMO_REPLAY === "true";
}

/** Find the staged record whose text matches, or null. */
export function findStagedMatch(text: string): StagedRequest | null {
  const norm = normalizeRequestText(text);
  return (
    loadStagedRequests().find(
      (s) => normalizeRequestText(s.text) === norm
    ) ?? null
  );
}
