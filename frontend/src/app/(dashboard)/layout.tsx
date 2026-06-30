import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getServerAuthContext, hasServerPermission } from "@/server/auth/context";
import { getRequiredPermissionForPath } from "@/shared/permissions/config";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pegas-pathname");
  const authContext = await getServerAuthContext();

  if (!authContext) {
    redirect("/login");
  }

  const requiredPermission = getRequiredPermissionForPath(pathname);
  const hasAccess = hasServerPermission(authContext, requiredPermission);

  return (
    <DashboardShell initialAuthContext={authContext} initialHasAccess={hasAccess}>
      {children}
    </DashboardShell>
  );
}
