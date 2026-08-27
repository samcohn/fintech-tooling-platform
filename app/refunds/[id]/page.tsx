import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getActor } from "@platform/auth";
import { db } from "@platform/db/client";
import { refundRequests } from "@platform/db/schema";
import { Masked } from "@platform/mask/Masked";
import { Money, StatusBadge } from "@platform/ui";

export const dynamic = "force-dynamic";

export default async function RefundDetail({
  params,
}: {
  params: { id: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/api/auth/signin");
  const row = await db.query.refundRequests.findFirst({
    where: eq(refundRequests.id, params.id),
  });
  if (!row) notFound();
  return (
    <main className="k-page">
      <h1 className="k-title">
        Refund {row.chargeId} <StatusBadge status={row.status} />
      </h1>
      <table className="k-table" style={{ maxWidth: 560 }}>
        <tbody>
          <tr>
            <td>Amount</td>
            <td className="num">
              <Money cents={row.amountCents} currency={row.currency} />
            </td>
          </tr>
          <tr>
            <td>Reason</td>
            <td>
              {row.reasonCode.charAt(0).toUpperCase() +
                row.reasonCode.slice(1).replace(/_/g, " ")}
            </td>
          </tr>
          <tr>
            <td>Customer email</td>
            <td>
              <Masked
                entityType="refund_request"
                entityId={row.id}
                field="customer_email"
              />
            </td>
          </tr>
          <tr>
            <td>Card</td>
            <td className="ident">•••• {row.cardLast4}</td>
          </tr>
          <tr>
            <td>Billing address</td>
            <td>
              <Masked
                entityType="refund_request"
                entityId={row.id}
                field="billing_address"
              />
            </td>
          </tr>
          <tr>
            <td>Idempotency key</td>
            <td className="ident">{row.idempotencyKey}</td>
          </tr>
          <tr>
            <td>Created</td>
            <td>{row.createdAt.toISOString()}</td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}
