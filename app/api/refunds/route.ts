import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@kernel/auth";
import { listRefunds } from "@apps/refunds/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const onlyRecommended =
    req.nextUrl.searchParams.get("queue") === "approvals";
  const data = await listRefunds(actor, { status, onlyRecommended });
  return NextResponse.json(data);
}
