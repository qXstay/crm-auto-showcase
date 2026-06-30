"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { getRequiredPermissionForPath } from "@/shared/permissions/config";
import {
  clearDemoAuthCache,
  hasDemoPermission,
  setDemoAuthContextCache,
} from "@/features/auth/storage";
import {
  fetchAuthMe,
  logoutCurrentSession,
  switchCurrentBranch,
} from "@/features/auth/repository";
import type { DemoAuthContext } from "@/features/auth/types";
import { prefetchPrimaryRoutes } from "@/features/navigation/primary-routes";
import { clearAllCachedClientResources } from "@/lib/client-resource-cache";

const SETTINGS_ROUTE_BY_PERMISSION: Array<[string, string]> = [
  ["settings.services", "/settings/services"],
  ["settings.clients", "/settings/clients"],
  ["settings.storage", "/settings/storage"],
];
const AUTH_RECHECK_INTERVAL_MS = 30_000;

function resolveOrderHref(permissionIds: string[]) {
  if (permissionIds.includes("order.create")) {
    return "/orders/new";
  }

  return permissionIds.includes("order.view") ? "/orders/list" : null;
}

function resolveSettingsHref(permissionIds: string[]) {
  return SETTINGS_ROUTE_BY_PERMISSION.find(([permissionId]) =>
    permissionIds.includes(permissionId),
  )?.[1] ?? null;
}

export function DashboardShell({
  children,
  initialAuthContext,
  initialHasAccess,
}: {
  children: ReactNode;
  initialAuthContext: DemoAuthContext | null;
  initialHasAccess: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [authContext, setAuthContext] = useState<DemoAuthContext | null | undefined>(
    initialAuthContext,
  );
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const lastAuthCheckCompletedAtRef = useRef(0);

  useEffect(() => {
    if (!initialAuthContext) {
      return;
    }

    setDemoAuthContextCache(initialAuthContext);
  }, [initialAuthContext]);

  useEffect(() => {
    const now = Date.now();

    if (
      lastAuthCheckCompletedAtRef.current > 0 &&
      now - lastAuthCheckCompletedAtRef.current < AUTH_RECHECK_INTERVAL_MS
    ) {
      return;
    }

    let cancelled = false;

    fetchAuthMe()
      .then((nextContext) => {
        if (!cancelled) {
          if (nextContext) {
            setAuthContext(nextContext);
            return;
          }

          clearAllCachedClientResources();
          clearDemoAuthCache();
          setAuthContext(null);
          router.replace("/login");
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearAllCachedClientResources();
          clearDemoAuthCache();
          setAuthContext(null);
          router.replace("/login");
        }
      })
      .finally(() => {
        if (!cancelled) {
          lastAuthCheckCompletedAtRef.current = Date.now();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!authContext) {
      return;
    }

    prefetchPrimaryRoutes(router, authContext.permissionIds);
  }, [authContext, router]);

  const requiredPermission = useMemo(
    () => getRequiredPermissionForPath(pathname),
    [pathname],
  );
  const orderHref = useMemo(
    () => (authContext ? resolveOrderHref(authContext.permissionIds) : null),
    [authContext],
  );
  const settingsHref = useMemo(
    () => (authContext ? resolveSettingsHref(authContext.permissionIds) : null),
    [authContext],
  );
  const hasAccess =
    authContext === undefined
      ? initialHasAccess
      : !requiredPermission || hasDemoPermission(authContext, requiredPermission);

  async function handleLogout() {
    await logoutCurrentSession().catch(() => undefined);
    clearDemoAuthCache();
    clearAllCachedClientResources();
    setAuthContext(null);
    router.replace("/login");
  }

  async function handleSwitchBranch(branchId: string) {
    if (!authContext || switchingBranch || branchId === authContext.currentBranch.id) {
      return;
    }

    setSwitchingBranch(true);

    try {
      const nextContext = await switchCurrentBranch(branchId);
      clearAllCachedClientResources();
      lastAuthCheckCompletedAtRef.current = Date.now();
      setAuthContext(nextContext);
      router.refresh();
    } finally {
      setSwitchingBranch(false);
    }
  }

  if (authContext === undefined) {
    return <div className="min-h-screen bg-[color:var(--background)]" />;
  }

  if (!authContext) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--background)] text-[color:var(--foreground)] lg:flex-row">
      <Sidebar
        currentBranchId={authContext.currentBranch.id}
        currentBranchLabel={authContext.currentBranch.displayName}
        permissionIds={authContext.permissionIds}
        orderHref={orderHref}
        settingsHref={settingsHref}
        availableBranches={authContext.availableBranches.map((branch) => ({
          id: branch.id,
          displayName: branch.displayName,
        }))}
        onSwitchBranch={handleSwitchBranch}
        onLogout={handleLogout}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <main
          key={authContext.currentBranch.id}
          className="flex-1 px-3 pb-[calc(72px+env(safe-area-inset-bottom))] pt-3 sm:px-4 lg:px-5 lg:py-4 lg:pb-4"
        >
          {hasAccess ? (
            children
          ) : (
            <section className="max-w-[640px] border border-[color:var(--border)] bg-white px-4 py-6 text-[15px] leading-6">
              <div className="text-[18px] font-medium text-[color:var(--foreground)]">
                Нет доступа
              </div>
              <div className="mt-2 text-[color:var(--muted)]">
                У текущего сотрудника нет прав для этого раздела.
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
