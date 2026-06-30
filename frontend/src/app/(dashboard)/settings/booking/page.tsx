import { headers } from "next/headers";
import { BookingSettingsScreen } from "@/features/settings-booking/components/booking-settings-screen";

function resolveRequestOrigin(requestHeaders: Headers) {
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";

  return `${proto}://${host}`;
}

export default async function BookingSettingsPage() {
  const requestHeaders = await headers();
  const origin = resolveRequestOrigin(requestHeaders);

  return <BookingSettingsScreen publicBookingLink={`${origin}/book`} />;
}
