import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getActor } from "@platform/auth";
import {
  createChangeRequest,
  listChangeRequests,
} from "@platform/requests/service";

const bodySchema = z.object({
  request: z.string().min(10).max(4000),
});

export async function GET() {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return NextResponse.json(await listChangeRequests());
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const row = await createChangeRequest(actor, parsed.data.request);
  return NextResponse.json({
    ...row,
    requesterName: actor.name,
    submittedAt: row.submittedAt.toISOString(),
  });
}
