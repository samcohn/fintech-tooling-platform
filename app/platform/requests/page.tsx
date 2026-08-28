import { redirect } from "next/navigation";
import { getActor } from "@platform/auth";
import { listChangeRequests } from "@platform/requests/service";
import { RequestsClient } from "@platform/requests/RequestsClient";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const actor = await getActor();
  if (!actor) redirect("/api/auth/signin");
  const rows = await listChangeRequests();
  return (
    <main className="k-page">
      <header className="k-pagehead">
        <h1 className="k-title">Change requests</h1>
        <div className="k-pagehead-meta">
          {rows.length} request{rows.length === 1 ? "" : "s"}
        </div>
      </header>
      <RequestsClient
        initialRows={rows.map((r) => ({
          id: r.id,
          request: r.request,
          requesterName: r.requesterName,
          submittedAt: r.submittedAt.toISOString(),
          lane: r.lane,
          status: r.status,
          prUrl: r.prUrl,
          blockedReason: r.blockedReason,
          classificationReasoning: r.classificationReasoning,
          blockedMd: r.blockedMd,
        }))}
      />
    </main>
  );
}
