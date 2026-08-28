export type DevinSessionResult =
  | { triggered: true; sessionId: string; url: string }
  | { triggered: false; reason: string };

/**
 * Trigger a Devin session via the Devin API. Without DEVIN_API_KEY the
 * request is recorded and audited but no session starts (dry run), so
 * the demo works offline.
 */
export async function triggerDevinSession(
  prompt: string
): Promise<DevinSessionResult> {
  const apiKey = process.env.DEVIN_API_KEY;
  if (!apiKey) {
    return { triggered: false, reason: "DEVIN_API_KEY not configured (dry run)" };
  }
  const res = await fetch("https://api.devin.ai/v1/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    return { triggered: false, reason: `Devin API error ${res.status}` };
  }
  const data = (await res.json()) as { session_id: string; url: string };
  return { triggered: true, sessionId: data.session_id, url: data.url };
}
