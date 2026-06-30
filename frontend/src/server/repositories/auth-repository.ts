import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { verifyPasswordOrPin } from "@/server/auth/password";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
  writeSessionCookie,
} from "@/server/auth/session";
import { getServerAuthContext, getServerSessionRecord } from "@/server/auth/context";
import { logAuditEvent } from "@/server/services/audit";
import { isDemoMaybeResetOnLoginEnabled, maybeResetDemoData } from "@/server/demo/reset";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return digits.slice(1);
  }

  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function lookupLoginEmployee(loginOrPhone: string) {
  const normalizedPhone = normalizePhone(loginOrPhone);
  const employee = await prisma.employee.findFirst({
    where: {
      firedAt: null,
      OR: [
        { phone: { contains: normalizedPhone } },
        { user: { login: loginOrPhone.trim() } },
      ],
    },
    include: {
      user: true,
    },
  });

  if (!employee || !employee.user || !employee.user.isActive) {
    return null;
  }

  return employee;
}

export async function signInEmployee(input: {
  loginOrPhone: string;
  pin?: string;
  password?: string;
  demoEntry?: boolean;
}) {
  if (input.demoEntry && isDemoMaybeResetOnLoginEnabled()) {
    await maybeResetDemoData({ reason: "quick_access" });
  }

  let employee = await lookupLoginEmployee(input.loginOrPhone);

  if (!employee && input.demoEntry) {
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      employee = await lookupLoginEmployee(input.loginOrPhone);
      if (employee) {
        break;
      }
    }
  }

  if (!employee || !employee.user) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const secret = input.password?.trim() || input.pin?.trim() || "";

  if (!secret) {
    return {
      ok: true as const,
      previewOnly: true as const,
      employee: {
        id: employee.id,
        phone: employee.phone,
        firstName: employee.firstName,
        lastName: employee.lastName,
      },
    };
  }

  const passwordOk = await verifyPasswordOrPin(employee.user.passwordHash, secret);
  const pinOk = await verifyPasswordOrPin(employee.user.pinHash, secret);

  if (!passwordOk && !pinOk) {
    return { ok: false as const, reason: "invalid_credentials" as const };
  }

  const defaultBranchAccess =
    (await prisma.employeeBranchAccess.findFirst({
      where: { employeeId: employee.id, isDefault: true, canSwitchInto: true },
    })) ??
    (await prisma.employeeBranchAccess.findFirst({
      where: { employeeId: employee.id, canSwitchInto: true },
    }));

  if (!defaultBranchAccess) {
    return { ok: false as const, reason: "no_branch_access" as const };
  }

  const token = createSessionToken();
  const expiresAt = createSessionExpiry();

  const session = await prisma.session.create({
    data: {
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      userId: employee.userId!,
      employeeId: employee.id,
      roleIdSnapshot: employee.roleId,
      currentBranchId: defaultBranchAccess.branchId,
      expiresAt,
    },
  });

  await prisma.user.update({
    where: { id: employee.userId! },
    data: { lastLoginAt: new Date() },
  });

  await writeSessionCookie(token, expiresAt);

  await logAuditEvent({
    eventType: "auth.login",
    actorUserId: employee.userId,
    actorEmployeeId: employee.id,
    branchId: defaultBranchAccess.branchId,
    entityType: "session",
    entityId: session.id,
    payload: { loginOrPhone: input.loginOrPhone },
  });

  return {
    ok: true as const,
    previewOnly: false as const,
    context: await getServerAuthContext(),
  };
}

export async function signOutCurrentSession() {
  const session = await getServerSessionRecord();

  if (!session) {
    return null;
  }

  await prisma.session.delete({ where: { id: session.id } });

  await logAuditEvent({
    eventType: "auth.logout",
    actorUserId: session.userId,
    actorEmployeeId: session.employeeId,
    branchId: session.currentBranchId,
    entityType: "session",
    entityId: session.id,
    payload: {},
  });

  return session;
}

export async function switchCurrentBranch(branchId: string) {
  const session = await getServerSessionRecord();

  if (!session) {
    return { ok: false as const, reason: "unauthorized" as const };
  }

  const access = session.employee.branchAccesses.find(
    (item) => item.branchId === branchId && item.canSwitchInto,
  );

  if (!access) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { currentBranchId: branchId, lastSeenAt: new Date() },
  });

  await logAuditEvent({
    eventType: "auth.switch_branch",
    actorUserId: session.userId,
    actorEmployeeId: session.employeeId,
    branchId,
    entityType: "branch",
    entityId: branchId,
    payload: { previousBranchId: session.currentBranchId },
  });

  return {
    ok: true as const,
    context: await getServerAuthContext(),
  };
}
