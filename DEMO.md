# Demo script

## 1. The app (5 min)

Sign in as `agent@demo.co`. Walk the refund queue: dense rows, keyboard
review (`j`/`k`/`a`/`r`/`Enter`), masked PII with audited unmask.

- Select a **$400** request → the agent sees **approve** directly.
- Select a **$750** request → the agent sees **recommend**, not approve.
  The boundary is visible, not hidden.
- Recommend it, sign in as `approver@demo.co`, approve it from the
  Approvals queue. Point out the recommender's name on the row and that
  self-approval is blocked at the route as well as the UI.

## 2. The gates — success (2 min)

```sh
pnpm demo:gate-pass
```

All six gates pass: platform boundary, audit coverage per transition, PII
containment, audit immutability (DB-level trigger), authorization
invariants (including fuzzing the request body with `threshold`/`role`
keys), money invariants (DB-level unique + sum constraints).

## 3. The gates — failure (2 min)

Submit, as the compliance lead: *"let agents approve their own refunds
up to $2,000."* A completely reasonable-sounding business ask — that can
only be satisfied by editing the platform's self-approval policy.

```sh
pnpm demo:gate-fail
```

Gate 1 (platform boundary) fails, exit is non-zero, and per the playbook
the session opens **no PR** — it writes its reasoning to
`.devin/blocked.md` and stops. In Power Apps, that same request is a
dropdown someone changes on a Tuesday afternoon.

## 4. The change-request loop (3 min)

Open **Request a change**, submit a benign request as any signed-in user
(e.g. "add a chargeback reason code and show it in the queue"). With
`DEVIN_API_KEY` set, a real Devin session starts against the playbook;
the request lands in the same `audit_log` as unmask events — "who asked
for this change" is queryable next to "who unmasked this email".

## 5. Slack (1 min, talk track)

Non-engineers don't even need the form: with the Devin Slack app
installed, an ops lead tags `@Devin` in a channel — "add a chargeback
reason field to the refunds app" — and the same playbook-governed loop
runs: branch, gates, PR or a written refusal. The integration is the
Slack app install plus pinning `playbooks/app-change.md` as
knowledge; no code on our side.
