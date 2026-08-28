import { redirect } from "next/navigation";
import { getActor } from "@platform/auth";
import { resolveAppAccess } from "@platform/rbac/access";
import { KYC_CASES } from "@apps/kyc";

export const dynamic = "force-dynamic";

export default async function KycPage() {
  const actor = await getActor();
  if (!actor) redirect("/api/auth/signin");

  const allowed = await resolveAppAccess(actor, "kyc");
  if (!allowed) {
    return (
      <main className="k-page">
        <header className="k-pagehead">
          <h1 className="k-title">KYC</h1>
        </header>
        <p className="k-empty">
          Your role does not include KYC access. This refusal has been
          recorded in the audit log.
        </p>
      </main>
    );
  }

  return (
    <main className="k-page">
      <header className="k-pagehead">
        <h1 className="k-title">KYC</h1>
        <div className="k-pagehead-meta">{KYC_CASES.length} cases</div>
      </header>
      <table className="k-table">
        <thead>
          <tr>
            <th>Case</th>
            <th>Subject</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {KYC_CASES.map((c) => (
            <tr key={c.id}>
              <td className="ident">{c.id}</td>
              <td>{c.subject}</td>
              <td>{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
