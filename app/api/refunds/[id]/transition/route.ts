import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getActor } from "@platform/auth";
import { redactRecord } from "@platform/mask/redact";
import { applyTransition } from "@apps/refunds/service";
import { piiFields } from "@apps/refunds/pii";

// Only the transition name is read from the request. Thresholds, roles,
// and permissions are resolved server-side; extra keys are ignored.
const bodySchema = z.object({
  transition: z.enum(["recommend", "approve", "reject", "settle", "fail"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const result = await applyTransition(actor, params.id, parsed.data.transition);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const dto = redactRecord(
    {
      id: result.request.id,
      status: result.request.status,
      customer_email: result.request.customerEmail,
      card_last4: result.request.cardLast4,
      billing_address: result.request.billingAddress,
    },
    piiFields
  );
  return NextResponse.json({ request: dto });
}
