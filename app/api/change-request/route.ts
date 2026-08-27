import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getActor } from "@platform/auth";
import { writeAudit } from "@platform/audit";
import { db } from "@platform/db/client";
import { loadPlaybook, interpolate } from "@platform/devin/playbook";
import { triggerDevinSession } from "@platform/devin/client";

const bodySchema = z.object({
  request: z.string().min(10).max(4000),
  app: z.enum(["refunds"]),
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
  const id = randomUUID().slice(0, 8);
  const prompt = interpolate(loadPlaybook("internal-tool-change"), {
    request: parsed.data.request,
    requester: `${actor.name} <${actor.email}>`,
    app: parsed.data.app,
    id,
  });

  const result = await triggerDevinSession(prompt);

  // "Who asked for this change" lands in the same audit_log as
  // "who unmasked this email".
  await writeAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "change_request.submitted",
    entityType: "change_request",
    entityId: id,
    after: {
      app: parsed.data.app,
      request: parsed.data.request,
      devin: result,
    },
  });

  return NextResponse.json({ id, devin: result });
}
