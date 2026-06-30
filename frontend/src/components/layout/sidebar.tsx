"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3,
  Calendar,
  Cog,
  LayoutDashboard,
  type LucideIcon,
  PackageSearch,
  Users,
  Wrench,
} from "lucide-react";

type SidebarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  /** Show in mobile bottom tab bar */
  mobileTab?: boolean;
};

type SidebarProps = {
  currentBranchId?: string;
  currentBranchLabel?: string;
  permissionIds?: string[];
  orderHref?: string | null;
  settingsHref?: string | null;
  availableBranches?: Array<{ id: string; displayName: string }>;
  onSwitchBranch?: (branchId: string) => void;
  onLogout?: () => void;
};

function isItemActive(href: string, pathname: string, disabled?: boolean) {
  if (disabled) return false;
  return (
    (href.startsWith("/orders") && pathname.startsWith("/orders")) ||
    (href.startsWith("/booking") && pathname.startsWith("/booking")) ||
    (href.startsWith("/settings") && pathname.startsWith("/settings")) ||
    pathname === href ||
    (href !== "/shift" && pathname.startsWith(`${href}/`))
  );
}

export function Sidebar({
  currentBranchId,
  currentBranchLabel,
  permissionIds = [],
  orderHref,
  settingsHref,
  availableBranches,
  onSwitchBranch,
  onLogout,
}: SidebarProps = {}) {
  const pathname = usePathname();
  const hasPermission = (permissionId: string) => permissionIds.includes(permissionId);

  const visibleItems: SidebarItem[] = [
    hasPermission("shift.view")
      ? { href: "/shift", label: "Смена", icon: LayoutDashboard, mobileTab: true }
      : null,
    orderHref
      ? { href: orderHref, label: "Заказы", icon: Wrench, mobileTab: true }
      : null,
    hasPermission("booking.view")
      ? { href: "/booking/day", label: "Запись", icon: Calendar, mobileTab: true }
      : null,
    hasPermission("client.view")
      ? { href: "/clients", label: "Клиенты", icon: Users, mobileTab: true }
      : null,
    hasPermission("storage.view")
      ? { href: "/storage", label: "Хранение", icon: PackageSearch }
      : null,
    hasPermission("analytics.view")
      ? { href: "/analytics", label: "Аналитика", icon: BarChart3 }
      : null,
    settingsHref
      ? { href: settingsHref, label: "Настройки", icon: Cog, mobileTab: true }
      : null,
  ].filter((item): item is SidebarItem => Boolean(item));

  const mobileTabItems = visibleItems.filter((item) => item.mobileTab);

  return (
    <>
      {/* ── Desktop sidebar (lg+) — structure unchanged ─────────────────── */}
      <aside className="hidden lg:sticky lg:top-0 lg:z-40 lg:flex lg:h-[100dvh] lg:w-[156px] lg:shrink-0 lg:flex-col lg:overflow-hidden lg:border-r lg:border-[color:var(--border)] lg:bg-[#f6f7fb] lg:px-3 lg:py-3.5">
        {/* Logo */}
        <div className="mb-3 px-1">
          <Image
            src="/brand/logo.webp"
            alt="Auto CRM"
            width={96}
            height={48}
            className="h-8 w-auto object-contain"
            priority
          />
        </div>

        {/* Nav */}
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
          {visibleItems.map(({ href, label, icon: Icon, disabled }) => {
            const active = isItemActive(href, pathname, disabled);
            const cls = clsx(
              "flex shrink-0 items-center gap-3 rounded-md border px-3 py-2.5 text-[14px] leading-4 transition-colors",
              active
                ? "border-[#d8dce8] bg-white font-medium text-[color:var(--foreground)]"
                : "border-transparent text-[color:var(--foreground)] hover:bg-white/70",
              disabled && "cursor-not-allowed border-transparent text-[color:var(--muted)] opacity-55 hover:bg-transparent",
            );
            if (disabled) {
              return (
                <span key={href} className={cls}>
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
              );
            }
            return (
              <Link key={href} href={href} prefetch={true} className={cls}>
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Branch + logout */}
        {currentBranchLabel ? (
          <div className="mt-auto shrink-0 border-t border-[color:var(--border)] px-1 pt-3">
            <div className="rounded-md border border-[color:var(--border)] bg-white px-2.5 py-3">
              <div className="text-[11px] text-[color:var(--muted)]">
                Филиал
              </div>
              {availableBranches && availableBranches.length > 1 && onSwitchBranch ? (
                <select
                  className="mt-1.5 h-9 w-full rounded-md border border-[color:var(--border)] bg-white px-2.5 text-[13px] leading-4 text-[color:var(--foreground)] outline-none"
                  value={currentBranchId}
                  onChange={(e) => onSwitchBranch(e.target.value)}
                >
                  {availableBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.displayName}</option>
                  ))}
                </select>
              ) : (
                <div className="mt-1.5 text-[13px] leading-4 text-[color:var(--foreground)]">
                  {currentBranchLabel}
                </div>
              )}
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="mt-2.5 inline-flex h-8 items-center rounded-md px-2 text-[13px] leading-4 text-[color:var(--foreground)] transition-colors hover:bg-[#f3f4f8]"
                >
                  Выйти
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>

      {/* ── Mobile top bar (< lg): logo + branch + logout ───────────────── */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-[color:var(--border)] bg-[#f6f7fb] px-3 py-2 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Image
            src="/brand/logo.webp"
            alt="Auto CRM"
            width={72}
            height={36}
            className="h-7 w-auto shrink-0 object-contain"
            priority
          />
          {currentBranchLabel ? (
            availableBranches && availableBranches.length > 1 && onSwitchBranch ? (
              <select
                className="h-8 min-w-0 max-w-[180px] rounded-md border border-[color:var(--border)] bg-white px-2 text-[13px] text-[color:var(--foreground)] outline-none"
                value={currentBranchId}
                onChange={(e) => onSwitchBranch(e.target.value)}
              >
                {availableBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.displayName}</option>
                ))}
              </select>
            ) : (
              <span className="truncate text-[13px] text-[color:var(--foreground)]">
                {currentBranchLabel}
              </span>
            )
          ) : null}
        </div>
        {onLogout ? (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--border)] bg-white px-2.5 text-[13px] text-[color:var(--foreground)] transition-colors hover:bg-[#f3f4f8]"
          >
            Выйти
          </button>
        ) : null}
      </div>

      {/* ── Mobile bottom tab bar (< lg) ────────────────────────────────── */}
      <nav
        aria-label="Навигация"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-[color:var(--border)] bg-white lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {mobileTabItems.map(({ href, label, icon: Icon, disabled }) => {
          const active = isItemActive(href, pathname, disabled);

          if (disabled) {
            return (
              <span
                key={href}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[color:var(--muted)] opacity-40"
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] leading-none">{label}</span>
              </span>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              className={clsx(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors",
                active
                  ? "text-[color:var(--primary)]"
                  : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
              )}
            >
              <Icon className={clsx("h-5 w-5 transition-transform", active && "scale-110")} />
              <span
                className={clsx(
                  "text-[10px] leading-none transition-all",
                  active ? "font-semibold" : "font-normal",
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
