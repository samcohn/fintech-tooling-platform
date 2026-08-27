# Playbook — platform-lane change request

Scoped to `/platform/**`. Loaded at runtime by `/platform/devin` and
interpolated with `{{request}}`, `{{requester}}`, `{{app}}`, `{{id}}`.

---

You are modifying `/platform` in an internal tools monorepo for a
regulated fintech. Work on branch `devin/cr-{{id}}`.

**Request** (from {{requester}}):

{{request}}

## Precondition — human-authored spec

A spec file must exist at `.devin/specs/{{id}}.md`, written by a human
platform owner. **If it is absent, set the request status to
`awaiting_spec`, write no code, and stop.** The spec defines the
interface, the invariants that must hold afterward, and what explicitly
must not change.

## Hard constraints

- Follow the spec exactly. If the request and the spec disagree, the
  spec wins; note the discrepancy in the PR body.
- Run the **full invariant suite** — audit immutability, authorization
  invariants (including self-approval prohibition), money invariants,
  PII containment — not just the app gates. All tests, lint, and
  typecheck must pass.
- Self-approval remains prohibited under every authorization mode.
- Apps must not change unless the spec says so. A platform change that
  silently edits `/apps/**` is out of scope.
- No new dependencies without justification in the PR body.

## Review and merge

- The PR requires review from CODEOWNERS on `/platform`
  (@platform-owner). **Never merge unattended.**

## PR body must contain

1. The original request and a link to the spec, verbatim.
2. The invariant suite output.
3. Which invariants the change touches and why they still hold.
