"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { fetchAuthMe } from "@/features/auth/repository";
import { SETTINGS_SECTIONS } from "@/features/services-admin/mock-data";

type SettingsSectionsTabsProps = {
  activeSection?:
    | "Основные"
    | "Бронирование"
    | "Права доступа"
    | "Услуги"
    | "Зарплата"
    | "Клиенты"
    | "Хранение"
    | "Счета";
};

const SETTINGS_SECTION_LINKS: Partial<
  Record<(typeof SETTINGS_SECTIONS)[number], string>
> = {
  Услуги: "/settings/services",
  Зарплата: "/settings/payroll",
  Клиенты: "/settings/clients",
  Хранение: "/settings/storage",
};

const SETTINGS_SECTION_PERMISSIONS: Partial<
  Record<(typeof SETTINGS_SECTIONS)[number], string>
> = {
  Услуги: "settings.services",
  Зарплата: "settings.services",
  Клиенты: "settings.clients",
  Хранение: "settings.storage",
};

export function SettingsSectionsTabs({
  activeSection = "Услуги",
}: SettingsSectionsTabsProps) {
  const router = useRouter();
  const activeTabRef = useRef<HTMLElement | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [permissionIds, setPermissionIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchAuthMe()
      .then((context) => {
        if (!cancelled) {
          setPermissionIds(context?.permissionIds ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPermissionIds((current) => current ?? []);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const applyMatchState = () => setIsCompactViewport(mediaQuery.matches);

    applyMatchState();
    mediaQuery.addEventListener("change", applyMatchState);

    return () => mediaQuery.removeEventListener("change", applyMatchState);
  }, []);

  useEffect(() => {
    if (!isCompactViewport || !activeTabRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      activeTabRef.current?.scrollIntoView({
        inline: "center",
        block: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeSection, isCompactViewport]);

  return (
    <div className="overflow-x-auto border-b border-[color:var(--border)] px-4 py-4">
      <nav className="flex min-w-max gap-x-7 gap-y-2 text-[14px] leading-5">
        {SETTINGS_SECTIONS.filter((section) => {
          if (section === activeSection) {
            return true;
          }

          const permissionId = SETTINGS_SECTION_PERMISSIONS[section];

          return !permissionId || permissionIds?.includes(permissionId);
        }).map((section) => {
          const active = section === activeSection;
          const href = SETTINGS_SECTION_LINKS[section];

          if (!href || active) {
            return (
              <span
                key={section}
                ref={(node) => {
                  if (active) {
                    activeTabRef.current = node;
                  }
                }}
                className={clsx(
                  "cursor-default whitespace-nowrap",
                  active
                    ? "font-medium text-[color:var(--primary)]"
                    : "text-[color:var(--foreground)]",
                )}
              >
                {section}
              </span>
            );
          }

          return (
            <Link
              key={section}
              href={href}
              ref={(node) => {
                if (active) {
                  activeTabRef.current = node;
                }
              }}
              scroll={!isCompactViewport}
              onClick={(event) => {
                if (!isCompactViewport) {
                  return;
                }

                event.preventDefault();
                router.push(href, { scroll: false });
              }}
              className="whitespace-nowrap text-[color:var(--foreground)] transition-colors hover:text-[color:var(--primary)]"
            >
              {section}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
