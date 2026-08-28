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
  Three rows, all requested by Casey Compliance: app / PR open (with PR
  link), platform / Merged, platform / Blocked. The page has no filters
  and no date range — it is always the full all-time history, newest
  first. Click any row for its classification reasoning.
- **Window C**: third pre-authed window as `approver@demo.co` (Priya
  Approver) on `http://localhost:3000/refunds/approvals`, for the
  approval and the role-based approval shot. Needed because the app has
  no account switcher.
- **Slack**: two windows side by side, `#internal-tools` and
  `#platform` (messages posted by the staging script, §4).
- **Editor**: repo tree expanded two levels; have
  `.devin/specs/{id}.md` and the merged PR (CODEOWNERS approval +
  passing checks) ready to show. `{id}` is printed by
  `pnpm demo:stage-requests` — the platform/merged line.
- **Audit log**: `http://localhost:3000/platform/audit`, in Window B.
  Compliance-only — as Avery it renders the refusal and audits it. Two
  filters (actor, action) plus **Clear filters**; both default to "All",
  so the unfiltered all-time view is what loads. 500 rows max, newest
  first.

## 4. Slack

With the webhook variables set in `.env` **before** running
`pnpm demo:stage-requests`, the script posts real messages with real
timestamps: app-lane notices to `#internal-tools`, platform-lane
notices to `#platform`. Without them, notices go to
`.devin/slack-outbox.md` (do not show that on camera).

The messages tag `@oncall` (app) and `@platform-owner` (platform) as
**literal text** — the webhook sends a plain `text` payload, so Slack
renders them unlinked, not as mentions. No message names Priya. If you
need a real highlighted mention, `platform/requests/slack.ts` has to
emit `<@U…>` for a user or `<!subteam^S…>` for a group, using real
Slack IDs. Otherwise don't zoom in on the tag, or say "the platform
owner" rather than implying a notification fired.

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
3. `Let agents approve their own refunds up to $2,000` →
   platform lane, **Blocked**. Click the row: the panel shows the
   blocked reason and the full `blocked.md` contents.

All three are staged as `compliance@demo.co`, so type all three from
Window B as Casey. Replay attaches your submission to the staged row
without reassigning it — the Requester column always shows the staged
requester, whoever is signed in.

Matching is normalized (case, whitespace, punctuation don't matter), so
`$2,000`, `$2000` and `2,000` all match — but spelled-out numbers do
not. Type the digits. Any other text behaves normally — with no
`DEVIN_API_KEY` it dry-runs.

Then, in a terminal, `pnpm demo:gate-fail` — the Blocked row is the
outcome, the gate output is why.

## 6. The app walk (Window A)

Sign in as `agent@demo.co`. Walk the refund queue: dense rows, keyboard
review (`j`/`k`/`a`/`r`/`Enter`), masked PII with audited unmask.

- Select the **$499.00** row → the agent sees **approve** directly.
- Select the **$750.00** row → the agent sees **recommend**, not
  approve. The boundary is visible, not hidden.
- Recommend it, then switch to Priya Approver and approve it from the
  Approvals queue. Point out the recommender's name on the row and that
  self-approval is blocked at the route as well as the UI.

There is **no account switcher and no sign-out link** — the sidebar
footer prints the current identity as static text. Switching identity is
a swap to a third pre-authed window (`approver@demo.co`), set up before
recording. Don't try to change users mid-shot.

Priya is the approver in the refunds app *and* the notional platform
reviewer for the merged spec. Nothing on screen renders her as the
reviewer — the PR and CODEOWNERS both show `@platform-owner` — so
either name the double role out loud, or attribute the review to a
fourth person in voiceover only and never put a name on screen.

## 7. Access boundary shot

As `agent@demo.co`, open `http://localhost:3000/kyc` — the refusal
renders at the platform layer and writes an `access_denied` audit row
with null before/after. As `compliance@demo.co`, `/kyc` shows the three
cases.

## 8. The audit shot (Part Three)

`pnpm db:seed` truncates `audit_log`, so immediately after a reseed the
only entries are the six change-request rows written by the staging
script. `refund.*`, `unmask` and `access_denied` rows exist **only if
you performed those actions in this take** — so Part One (recommend,
approve, an unmask, `/kyc` as Avery) has to happen before Part Three,
or the "who moved money, who looked at customer data, who tried to open
a tool they weren't in" line has nothing behind it.

Filter to Avery to make the point, then **Clear filters** for the
full history. Click any row for before/after JSON.

## 9. Reset between takes

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
