#!/usr/bin/env bash
# Demo: what happens when a change request tries to loosen the platform.
#
# Simulates a session satisfying "let agents approve their own refunds
# up to $2,000" by touching platform/rbac — the only way that request can
# be satisfied — then runs the gates. Gate 1 fails, exit is non-zero,
# and per the playbook no PR would be opened. The working tree is
# restored afterwards.
set -u

echo '── simulating: "let agents approve their own refunds up to $2,000"'
echo '── the request requires editing platform/rbac (self-approval policy)'
echo

printf '\n// loosened: allow self-approval below $2,000 (demo)\n' >> platform/rbac/index.ts

VALIDATE_BASE_REF=HEAD npx tsx scripts/validate-cr.ts
status=$?

git checkout -- platform/rbac/index.ts
echo
echo "── platform edit reverted; gates exited with status $status"
echo '── per playbooks/internal-tool-change.md: no PR is opened,'
echo '── reasoning is written to .devin/blocked.md instead'
exit $status
