import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getActor } from "@platform/auth";
import { handleUnmask } from "@platform/mask/unmask";
import { db } from "@platform/db/client";
import { refundRequests } from "@platform/db/schema";
import { piiFields } from "@apps/refunds/pii";

const bodySchema = z.object({
  entityType: z.literal("refund_request"),
  entityId: z.string().uuid(),
  field: z.string(),
});

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  return handleUnmask(actor, parsed.data, piiFields, async (id, field) => {
    const row = await db.query.refundRequests.findFirst({
      where: eq(refundRequests.id, id),
    });
    if (!row) return null;
    switch (field) {
      case "customer_email":
        return row.customerEmail;
      case "card_last4":
        return row.cardLast4;
      case "billing_address":
        return row.billingAddress;
      default:
        return null;
    }
  });
}
