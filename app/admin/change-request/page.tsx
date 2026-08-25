import { redirect } from "next/navigation";
import { getActor } from "@kernel/auth";
import { ChangeRequestForm } from "@platform/devin/ChangeRequestForm";

export const dynamic = "force-dynamic";

export default async function ChangeRequestPage() {
  const actor = await getActor();
  if (!actor) redirect("/api/auth/signin");
  return (
    <main className="k-page">
      <h1>Request a change to an internal tool</h1>
      <ChangeRequestForm />
    </main>
  );
}
