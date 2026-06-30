import { BookingMonthScreen } from "@/features/booking/components/booking-month-screen";
import { normalizeDateKey, normalizeMonthKey } from "@/features/booking/date-utils";
import { hasServerPermission, requireServerAuthContext } from "@/server/auth/context";
import { listBookingsForBranch } from "@/server/repositories/booking-read-repository";

export default async function BookingMonthPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string | string[]; date?: string | string[] }>;
}) {
  const authContext = await requireServerAuthContext();

  if (!hasServerPermission(authContext, "booking.view")) {
    return null;
  }

  const currentBranchId = authContext.currentBranch.id;
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialMonth = normalizeMonthKey(
    typeof resolvedSearchParams.month === "string" ? resolvedSearchParams.month : null,
  );
  const initialDate = normalizeDateKey(
    typeof resolvedSearchParams.date === "string" ? resolvedSearchParams.date : null,
  );
  const initialEntries = (await listBookingsForBranch(currentBranchId)).entries;

  return (
    <BookingMonthScreen
      initialEntries={initialEntries}
      initialDate={initialDate ?? undefined}
      initialMonth={initialMonth ?? undefined}
    />
  );
}
