import { redirect } from "next/navigation";
import { getActor } from "@platform/auth";
import { resolveAppAccess } from "@platform/rbac/access";
import { listAuditEntries } from "@platform/audit";
import { AuditClient } from "@platform/audit/AuditClient";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const actor = await getActor();
  if (!actor) redirect("/api/auth/signin");

  const allowed = await resolveAppAccess(actor, "audit");
  if (!allowed) {
    return (
      <main className="k-page">
        <header className="k-pagehead">
          <h1 className="k-title">Audit log</h1>
        </header>
        <p className="k-empty">
          Your role does not include audit access. This refusal has been
          recorded in the audit log.
        </p>
      </main>
    );
  }

  const rows = await listAuditEntries();
  return (
    <main className="k-page">
      <header className="k-pagehead">
        <h1 className="k-title">Audit log</h1>
        <div className="k-pagehead-meta">
          {rows.length} most recent {rows.length === 1 ? "entry" : "entries"}
        </div>
      </header>
      <AuditClient
        rows={rows.map((r) => ({
          id: r.id,
          actorEmail: r.actorEmail,
          actorName: r.actorName,
          actorRole: r.actorRole,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          before: r.before,
          after: r.after,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
