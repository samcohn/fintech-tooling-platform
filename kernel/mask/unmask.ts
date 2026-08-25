import { NextResponse } from "next/server";
import { db } from "../db/client";
import { writeAudit } from "../audit";
import type { Actor } from "../auth";
import type { PiiManifest } from "./redact";

export type UnmaskRequest = {
  entityType: string;
  entityId: string;
  field: string;
};

export type FieldLoader = (
  entityId: string,
  field: string
) => Promise<string | null>;

/**
 * Shared unmask handler. Validates the field against the consuming
 * app's PII manifest, writes exactly one audit row naming the actor and
 * the field, then returns the raw value.
 */
export async function handleUnmask(
  actor: Actor,
  body: UnmaskRequest,
  manifest: PiiManifest,
  loadField: FieldLoader
): Promise<NextResponse> {
  if (!manifest.includes(body.field)) {
    return NextResponse.json(
      { error: `field ${body.field} is not a declared PII field` },
      { status: 400 }
    );
  }
  const value = await loadField(body.entityId, body.field);
  if (value === null) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await writeAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: `unmask.${body.field}`,
    entityType: body.entityType,
    entityId: body.entityId,
    after: { field: body.field },
  });
  return NextResponse.json({ value });
}
