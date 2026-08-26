import { redirect } from "next/navigation";
import { getActor } from "@kernel/auth";
import { listRefunds } from "@apps/refunds/queries";
import { QueueClient } from "@apps/refunds/QueueClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const actor = await getActor();
  if (!actor) redirect("/api/auth/signin");
  const { rows, thresholdCents } = await listRefunds(actor, {
    onlyRecommended: true,
  });
  return (
    <main className="k-page">
      <h1>Approver queue</h1>
      <p className="k-sub">
        Pending recommendations. Self-approval is blocked at the route level
        as well as here.
      </p>
      <QueueClient
        initialRows={rows}
        thresholdCents={thresholdCents}
        queue="approvals"
      />
    </main>
  );
}
