import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getActor } from "@kernel/auth";
import { db } from "@kernel/db/client";
import { refundRequests } from "@kernel/db/schema";
import { Masked } from "@kernel/mask/Masked";
import { Money, StatusBadge } from "@kernel/ui";

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
      <h1>
        Refund {row.chargeId} <StatusBadge status={row.status} />
      </h1>
      <table className="k-table" style={{ maxWidth: 560 }}>
        <tbody>
          <tr>
            <td>amount</td>
            <td className="num">
              <Money cents={row.amountCents} currency={row.currency} />
            </td>
          </tr>
          <tr>
            <td>reason</td>
            <td>{row.reasonCode}</td>
          </tr>
          <tr>
            <td>customer email</td>
            <td>
              <Masked
                entityType="refund_request"
                entityId={row.id}
                field="customer_email"
              />
            </td>
          </tr>
          <tr>
            <td>card last4</td>
            <td>
              <Masked
                entityType="refund_request"
                entityId={row.id}
                field="card_last4"
              />
            </td>
          </tr>
          <tr>
            <td>billing address</td>
            <td>
              <Masked
                entityType="refund_request"
                entityId={row.id}
                field="billing_address"
              />
            </td>
          </tr>
          <tr>
            <td>idempotency key</td>
            <td>{row.idempotencyKey}</td>
          </tr>
          <tr>
            <td>created</td>
            <td>{row.createdAt.toISOString()}</td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}
