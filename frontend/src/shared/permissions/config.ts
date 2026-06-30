export const APP_ROUTE_PERMISSION_MAP: Array<[string, string]> = [
  ["/analytics", "analytics.view"],
  ["/settings/roles", "settings.roles"],
  ["/settings/employees", "settings.employees"],
  ["/settings/services", "settings.services"],
  ["/settings/payroll", "settings.services"],
  ["/settings/clients", "settings.clients"],
  ["/settings/storage", "settings.storage"],
  ["/settings/accounts", "settings.accounts"],
  ["/settings/booking", "settings.booking"],
  ["/settings/main", "settings.main"],
  ["/shift", "shift.view"],
  ["/booking", "booking.view"],
  ["/storage", "storage.view"],
  ["/clients", "client.view"],
  ["/orders/list", "order.view"],
  ["/orders/view", "order.view"],
  ["/orders/new", "order.create"],
  ["/orders", "order.create"],
];

export function getRequiredPermissionForPath(pathname: string | null | undefined) {
  if (!pathname) {
    return null;
  }

  return (
    APP_ROUTE_PERMISSION_MAP.find(([prefix]) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`),
    )?.[1] ?? null
  );
}
