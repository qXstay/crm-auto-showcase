import type { Prisma } from "@/server/db/prisma-client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";

type AuditInput = {
  eventType: string;
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  branchId?: string | null;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
};

export async function logAuditEvent(input: AuditInput) {
  await prisma.auditEvent.create({
    data: {
      id: randomUUID(),
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      actorEmployeeId: input.actorEmployeeId ?? null,
      branchId: input.branchId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      payloadJson: (input.payload ?? {}) as Prisma.InputJsonValue,
    },
  });
}
