import { redirect } from "next/navigation";
import { getActor } from "@kernel/auth";
import { listRefunds } from "@apps/refunds/queries";
import { QueueClient } from "@apps/refunds/QueueClient";

export const dynamic = "force-dynamic";

export default async function RefundsPage() {
  const actor = await getActor();
  if (!actor) redirect("/api/auth/signin");
  const { rows, thresholdCents } = await listRefunds(actor);
  return (
    <main className="k-page">
      <h1>Refund requests</h1>
      <QueueClient
        initialRows={rows}
        thresholdCents={thresholdCents}
        queue="all"
      />
    </main>
  );
}
