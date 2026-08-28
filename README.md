# Internal tools platform

A demo of an enterprise internal-tooling platform: one production-grade
microapp (a refund request console) built on a reusable `/platform`
layer, plus the loop by which non-engineers safely change it:

> change request → triage (app vs. platform lane) → playbook → Devin →
> validation gates → PR → engineer review (CODEOWNERS) → merge.

## What the app does

**Refund queue** (`/refunds`) — a keyboard-first console where support
agents work refund requests. Agents can approve small refunds directly
and only *recommend* large ones; approvers commit those. Customer PII
is masked by default, and every unmask is audited.

**Approvals** (`/refunds/approvals`) — the approver's queue of
recommended refunds awaiting a decision. No one can ever approve their
own recommendation.

**Change requests** (`/platform/requests` and the sidebar's "Request a
change") — non-engineers describe a change in natural language. The
request is triaged into an *app* lane (Devin builds it against a
playbook, runs the validation gates, and opens a PR) or a *platform*
lane (blocked from automation; routed to engineers). Every step is
audited and can notify Slack.

Everything money- or policy-shaped is enforced server-side and in
PostgreSQL — the UI is never the source of truth:

- Append-only audit log (a DB trigger rejects UPDATE/DELETE).
- Approval threshold and self-approval rules resolved on the server.
- Idempotency keys and integer-cent money invariants in the schema.

## Run it locally

Prerequisites: Node 20+, [pnpm](https://pnpm.io) 9, and Docker.

```sh
git clone https://github.com/samcohn/fintech-tooling-platform.git
cd fintech-tooling-platform
pnpm install

# 1. Start PostgreSQL
docker run -d --name pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=internal_tools -p 5432:5432 postgres:16

# 2. Configure environment
cp .env.example .env   # set NEXTAUTH_SECRET to any string

# 3. Create schema and seed demo data
pnpm db:migrate
pnpm db:seed
pnpm demo:stage-requests   # stages 3 example change requests

# 4. Start the app
pnpm dev                   # http://localhost:3000
```

Note: `pnpm db:seed` truncates the demo tables, so re-run
`pnpm demo:stage-requests` after any reseed.

Sign in with any seeded email — no password (demo credentials
provider; production swaps in an OIDC provider):

| Email | Role |
|---|---|
| `agent@demo.co` | agent |
| `agent2@demo.co` | agent |
| `approver@demo.co` | approver |
| `compliance@demo.co` | compliance |

Optional `.env` extras: `DEVIN_API_KEY` makes change requests spawn
real Devin sessions (otherwise they dry-run);
`SLACK_WEBHOOK_INTERNAL_TOOLS` / `SLACK_WEBHOOK_PLATFORM` route lane
notifications to Slack (otherwise they land in
`.devin/slack-outbox.md`).

### Keyboard shortcuts

`j`/`k` navigate rows · `a` approve/recommend · `r` reject ·
`u` unmask (audited) · `Enter` open detail · `Esc` close ·
`?` shortcut overlay.

## Layout

```
/platform               built once, never modified by app work
  auth/                 Auth.js, session, server-side role resolution
  rbac/                 role policy, approval-threshold primitive
  audit/                append-only log + Postgres trigger
  mask/                 PII field masking, audited unmask
  ui/                   table, filter bar, action rail, design tokens
  devin/                change request form, playbook loader, API client
/apps/refunds           the one microapp
/playbooks              standing prompts attached to recurring tasks
/scripts/validate-cr.ts the gates
```

## Policy

- Under $500 an agent commits directly; at or above, an agent may only
  recommend and an approver commits.
- No actor ever commits their own recommendation, at any amount.
- The threshold is server config (`REFUND_APPROVAL_THRESHOLD_CENTS`),
  never request input.

## Gates

`pnpm validate:cr` — platform boundary, audit coverage, PII containment,
audit immutability, authorization invariants, money invariants. A Devin
change-request session must exit 0 here before opening a PR; if the
request requires touching `/platform`, it stops, writes
`.devin/blocked.md`, and opens no PR.

## Tests

`pnpm test` — self-approval rejection, threshold boundary, the audit
trigger rejecting UPDATE/DELETE at the database level, and unmask
emitting exactly one audit row.
