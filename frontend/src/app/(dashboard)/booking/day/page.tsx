import { BookingCalendarScreen } from "@/features/booking/components/booking-calendar-screen";
import { normalizeDateKey } from "@/features/booking/date-utils";
import { buildBookingPostsFromSettings } from "@/features/settings-booking/storage";
import { hasServerPermission, requireServerAuthContext } from "@/server/auth/context";
import { listBookingsForBranch } from "@/server/repositories/booking-read-repository";
import { listClientsForBranch } from "@/server/repositories/client-read-repository";
import { getBookingSettingsForBranch } from "@/server/repositories/branch-settings-repository";

export default async function BookingDayPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string | string[] }>;
}) {
  const authContext = await requireServerAuthContext();

  if (!hasServerPermission(authContext, "booking.view")) {
    return null;
  }

  const currentBranchId = authContext.currentBranch.id;
  const canViewClients = hasServerPermission(authContext, "client.view");
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialDate = normalizeDateKey(
    typeof resolvedSearchParams.date === "string" ? resolvedSearchParams.date : null,
  );
  const [initialEntries, initialClientsStore, bookingSettings] = await Promise.all([
    listBookingsForBranch(currentBranchId),
    canViewClients ? listClientsForBranch(currentBranchId) : Promise.resolve({ clients: [] }),
    getBookingSettingsForBranch(currentBranchId),
  ]);

  return (
    <BookingCalendarScreen
      initialDate={initialDate ?? undefined}
      initialEntries={initialEntries.entries}
      initialClients={initialClientsStore.clients}
      initialPosts={buildBookingPostsFromSettings(bookingSettings)}
      slotWindowMinutes={bookingSettings.slotWindowMinutes}
      allowMultipleWindows={bookingSettings.allowMultipleWindows}
      initialNowIso={new Date().toISOString()}
      currentEmployeeId={authContext.employee.id}
      canCreateBooking={hasServerPermission(authContext, "booking.create")}
      canDeleteOwnBookings={hasServerPermission(authContext, "booking.delete_own")}
      canDeleteAllBookings={hasServerPermission(authContext, "booking.delete_all")}
      canViewClients={canViewClients}
      canCreateClient={hasServerPermission(authContext, "client.create")}
    />
  );
}
