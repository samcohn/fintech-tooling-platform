# Internal tools platform

One app on a reusable kernel, plus the loop by which non-engineers
change it: change request → playbook → Devin → validation gates → PR →
engineer review → merge.

## Layout

```
/kernel                 built once, never modified by app work
  auth/                 Auth.js, session, server-side role resolution
  rbac/                 role policy, approval-threshold primitive
  audit/                append-only log + Postgres trigger
  mask/                 PII field masking, audited unmask
  ui/                   table, filter bar, action rail, design tokens
/apps/refunds           the one microapp
/platform/devin         change request form, playbook loader, API client
/playbooks              standing prompts attached to recurring tasks
/scripts/validate-cr.ts the gates
```

## Run

```sh
docker run -d --name pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=internal_tools -p 5432:5432 postgres:16
cp .env.example .env   # set NEXTAUTH_SECRET
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Sign in as `agent@demo.co`, `agent2@demo.co`, `approver@demo.co`, or
`compliance@demo.co` (demo credentials provider — any of the seeded
emails, no password; production swaps in an OIDC provider).

## Policy

- Under $500 an agent commits directly; at or above, an agent may only
  recommend and an approver commits.
- No actor ever commits their own recommendation, at any amount.
- The threshold is server config (`REFUND_APPROVAL_THRESHOLD_CENTS`),
  never request input.

## Gates

`pnpm validate:cr` — kernel boundary, audit coverage, PII containment,
audit immutability, authorization invariants, money invariants. A Devin
change-request session must exit 0 here before opening a PR; if the
request requires touching `/kernel`, it stops, writes
`.devin/blocked.md`, and opens no PR.

## Tests

`pnpm test` — self-approval rejection, threshold boundary, the audit
trigger rejecting UPDATE/DELETE at the database level, and unmask
emitting exactly one audit row.
