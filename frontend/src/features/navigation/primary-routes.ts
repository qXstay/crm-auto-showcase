"use client";

type RouterPrefetcher = {
  prefetch: (href: string) => void;
};

export function getPrimaryPrefetchRoutes(permissionIds: string[]) {
  const routes = new Set<string>();

  if (permissionIds.includes("shift.view")) {
    routes.add("/shift");
  }

  if (permissionIds.includes("order.create")) {
    routes.add("/orders/new");
  }

  if (permissionIds.includes("order.view")) {
    routes.add("/orders/list");
  }

  if (permissionIds.includes("analytics.view")) {
    routes.add("/analytics");
  }

  if (permissionIds.includes("booking.view")) {
    routes.add("/booking/day");
  }

  if (permissionIds.includes("client.view")) {
    routes.add("/clients");
  }

  return [...routes];
}

export function prefetchPrimaryRoutes(router: RouterPrefetcher, permissionIds: string[]) {
  getPrimaryPrefetchRoutes(permissionIds).forEach((href) => {
    router.prefetch(href);
  });
}
