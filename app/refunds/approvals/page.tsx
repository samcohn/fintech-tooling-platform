import { redirect } from "next/navigation";
import { getActor } from "@platform/auth";
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
      <QueueClient
        initialRows={rows}
        thresholdCents={thresholdCents}
        queue="approvals"
      />
    </main>
  );
}
