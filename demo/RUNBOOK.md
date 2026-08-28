# Demo runbook

Everything below runs on your machine. The recording never depends on a
live Devin session — the three scripted requests replay from staged
records.

## 1. One-time setup

Prerequisites: Node 20+, pnpm 9, Docker.

```sh
git clone https://github.com/samcohn/fintech-tooling-platform.git
cd fintech-tooling-platform
git checkout devin/1787629172-internal-platform   # or merge PR #1 and use main
pnpm install

# Postgres
docker run -d --name pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=internal_tools -p 5432:5432 postgres:16

# Environment
cp .env.example .env
```

Edit `.env`:

- `NEXTAUTH_SECRET` — any string.
- `DEMO_REPLAY=true` — required for the scripted submissions.
- `REFUND_APPROVER_ROLES=agent,approver` — makes the role-based rule
  active for the post-merge shot without breaking the agent's below-
  threshold Approve.
- `SLACK_WEBHOOK_INTERNAL_TOOLS` / `SLACK_WEBHOOK_PLATFORM` — real
  webhook URLs for `#internal-tools` and `#platform` if you want the
  staging script to post real Slack messages (see §4).
- Leave `DEVIN_API_KEY` unset for the demo — matching text never
  dispatches, but non-matching text would.

## 2. Stage the data

```sh
pnpm db:migrate
pnpm db:seed                # refunds + users (truncates demo tables)
pnpm demo:stage-requests    # the 3 staged change requests + spec + blocked.md
```

Re-run `pnpm demo:stage-requests` after **any** reseed — `pnpm db:seed`
wipes the change-request table.

```sh
pnpm dev                    # http://localhost:3000
```

## 3. Window setup (pre-flight)

- **Window A**: sign in as `agent@demo.co` (email only, no password),
  open `http://localhost:3000/refunds`. Top of the queue: $750.00
  pending (Recommend), $499.00 pending (Approve), a recommended row.
  The "All" tab shows the two `ch_0999` rows, one Settled.
- **Window B**: private/incognito window, sign in as
  `compliance@demo.co`, open `http://localhost:3000/platform/requests`.
  Three rows: app / PR open (with PR link), platform / Merged,
  platform / Blocked.
- **Slack**: two windows side by side, `#internal-tools` and
  `#platform` (messages posted by the staging script, §4).
- **Editor**: repo tree expanded two levels; have
  `.devin/specs/{id}.md` and the merged PR (CODEOWNERS approval +
  passing checks) ready to show. `{id}` is printed by
  `pnpm demo:stage-requests` — the platform/merged line.
- **Audit log**: filtered to `agent@demo.co`.

## 4. Slack

With the webhook variables set in `.env` **before** running
`pnpm demo:stage-requests`, the script posts real messages with real
timestamps: app-lane notices to `#internal-tools`, platform-lane
notices to `#platform`. Without them, notices go to
`.devin/slack-outbox.md` (do not show that on camera).

To create webhooks: Slack → Apps → Incoming Webhooks → add one per
channel, paste the two URLs into `.env`, then re-run the staging
script.

## 5. The scripted submissions (exact text)

With `DEMO_REPLAY=true`, typing any of these into the request form
shows `triaging` for ~1.2s and then resolves to the staged state — no
Devin session is created, no duplicate row appears:

1. `Add a column showing prior refund count` → app lane, **PR open**
   with live PR link.
2. `We need approvers assigned by role, not just by amount` →
   platform lane, **Merged**.
3. `Let agents approve their own refunds up to two thousand dollars` →
   platform lane, **Blocked**. Click the row: the panel shows the
   blocked reason and the full `blocked.md` contents.

Matching is normalized (case, whitespace, punctuation don't matter).
Any other text behaves normally — with no `DEVIN_API_KEY` it dry-runs.

## 6. Access boundary shot

As `agent@demo.co`, open `http://localhost:3000/kyc` — the refusal
renders at the platform layer and writes an `access_denied` audit row
with null before/after. As `compliance@demo.co`, `/kyc` shows the three
cases.

## 7. Reset between takes

```sh
pnpm db:seed && pnpm demo:stage-requests
```

Sign-ins survive a reseed only if user IDs are re-created identically —
they are not, so sign out/in again after reseeding.

## Troubleshooting

- **Row hangs on triaging / duplicate row created**: `DEMO_REPLAY` is
  not `true` in `.env`, or the dev server was started before it was
  set — restart `pnpm dev`.
- **Requests queue empty**: you reseeded without re-running
  `pnpm demo:stage-requests`.
- **`ECONNREFUSED :5432`**: Postgres isn't running — `docker start pg`.
- **Blocked panel missing blocked.md**: the file lives at
  `.devin/blocked/{id}.md` and is written by the staging script — run
  it from the repo root.
