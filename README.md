# Fintech Internal Tools Platform

An internal-tooling platform with one production-grade microapp (a
refund request console) built on a shared `/platform` layer, plus a
change-request workflow that routes non-engineer requests to Devin.

Built as an evaluation prototype, scoped to roughly two hours.

## What's here

**Refund queue** (`/refunds`) — keyboard-first console for support
agents. Agents commit refunds under the threshold directly and only
recommend the ones above it. Customer PII is masked by default; every
unmask is audited.

**Approvals** (`/refunds/approvals`) — approver queue for recommended
refunds. No actor can commit their own recommendation.

**KYC** (`/kyc`) — a stub app, present only to exercise access control
at the platform layer. Users outside the group don't reach it, and the
refusal is audited.

**Change requests** (`/platform/requests`) — non-engineers describe a
change in plain English. Requests are triaged into an app lane or a
platform lane and dispatched to Devin with the matching playbook.

**Audit log** (`/platform/audit`) — read-only view of the append-only
log, filterable by actor and action. Refund transitions, unmasks, access
denials and change-request submissions share one table; there is no
second log. Compliance-only, and the log has no update or delete path.

## Change request lanes

| | App lane | Platform lane |
|---|---|---|
| Scope | `/apps/**` | `/platform/**` |
| Precondition | none | human-authored spec |
| Checks | `pnpm validate:cr` | full invariant suite |
| Review | on-call engineer | CODEOWNERS on `/platform` |
| Merges unattended | yes, on green | no |

Triage classifies the request and writes its reasoning to
`.devin/triage.md`. Any diff touching `/platform` fails the app lane's
boundary check and reclassifies. A request that can't be satisfied
under either lane writes `.devin/blocked.md` and opens no PR.

## Run it locally

Prerequisites: Node 20+, pnpm 9, Docker.

```sh
git clone https://github.com/samcohn/fintech-tooling-platform.git
cd fintech-tooling-platform
pnpm install

# 1. Start PostgreSQL
docker run -d --name pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=internal_tools -p 5432:5432 postgres:16

# 2. Configure environment
cp .env.example .env   # set NEXTAUTH_SECRET to any string

# 3. Create schema and seed
pnpm db:migrate
pnpm db:seed
pnpm demo:stage-requests   # stages the example change requests

# 4. Start the app
pnpm dev                   # http://localhost:3000
```

`pnpm db:seed` truncates the demo tables, so re-run
`pnpm demo:stage-requests` after any reseed.

## Sign in

Any seeded email, no password. Demo credentials provider; production
swaps in OIDC.

| Email | Role | Access |
|---|---|---|
| `agent@demo.co` | agent | Refunds |
| `agent2@demo.co` | agent | Refunds |
| `approver@demo.co` | approver | Refunds, approvals |
| `compliance@demo.co` | compliance | Refunds, KYC, audit log |

To see the access boundary: sign in as `agent@demo.co` and open `/kyc`
or `/platform/audit`. Both are compliance-only, and both refusals are
themselves audited.

There is no account switcher and no sign-out: identity is a session
cookie, so use a second browser profile or a private window to hold two
roles at once.

## Optional environment variables

| Variable | Effect if unset |
|---|---|
| `DEVIN_API_KEY` | change requests dry-run instead of spawning sessions |
| `SLACK_WEBHOOK_INTERNAL_TOOLS` | app-lane notices go to `.devin/slack-outbox.md` |
| `SLACK_WEBHOOK_PLATFORM` | platform-lane notices go to `.devin/slack-outbox.md` |
| `REFUND_APPROVAL_THRESHOLD_CENTS` | defaults to 50000 |
| `REFUND_APPROVER_ROLES` | no role restriction; set e.g. `agent,approver` to require an approver role in addition to the amount threshold |
| `DEMO_REPLAY` | submissions always dispatch; set `true` so text matching `demo/staged-requests.json` replays the staged final state (with a 1.2s triaging beat) instead of spawning a session |

## Keyboard shortcuts

`j`/`k` navigate · `a` approve or recommend · `r` reject · `u` unmask
(audited) · `Enter` detail · `Esc` close · `?` overlay

## Layout

```
/platform               shared layer
  auth/                 Auth.js, session, server-side role resolution
  rbac/                 role policy, approval-threshold primitive, app access
  audit/                append-only log + Postgres trigger
  mask/                 PII field masking, audited unmask
  ui/                   table, filter bar, action rail, design tokens
  requests/             change request surface, triage, Slack routing
  devin/                Devin API client, playbook loader
/apps
  refunds/              the microapp
  kyc/                  stub, access-boundary only
/playbooks
  app-change.md
  platform-change.md
/scripts/validate-cr.ts the gates
```

## Authorization

Resolved server-side; the UI is never the source of truth.

- Below `REFUND_APPROVAL_THRESHOLD_CENTS`, an agent commits directly.
  At or above, an agent may only recommend and an approver commits.
- Approvers can also be assigned by role, independent of amount. Both
  modes compose.
- No actor commits their own recommendation, at any amount.
- The threshold comes from server config, never from request input.
- Access is resolved at the platform layer before an app route runs.
  Denials are written to the audit log.

## Database-enforced invariants

- `audit_log` rejects UPDATE and DELETE via trigger.
- Refunds carry an idempotency key with a UNIQUE constraint; a charge
  cannot be refunded twice.
- Money is stored in integer cents. Total refunds against a charge
  cannot exceed the original amount.

## Gates

`pnpm validate:cr` runs six checks: platform boundary, audit coverage,
PII containment, audit immutability, authorization invariants, money
invariants. App-lane sessions must exit 0 before opening a PR.

## Tests

`pnpm test` covers self-approval rejection, threshold boundary,
role-based approver assignment, the audit trigger rejecting UPDATE and
DELETE at the database level, unmask emitting exactly one audit row,
and access denial writing an audit row.

## Limitations

- The platform layer was designed against one real app. Which parts
  generalize is untested.
- Triage misclassification into the platform lane fails silently; only
  the reverse is caught by the gates.
- Gates encode the invariants that were anticipated, and were written
  alongside the tests that exercise them.
- Identity is generic OIDC, not a specific Entra tenant.
