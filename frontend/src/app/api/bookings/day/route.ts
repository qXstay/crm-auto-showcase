import { okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { listDayBookingsForBranch } from "@/server/repositories/booking-read-repository";

export async function GET(request: Request) {
  const auth = await requireApiPermission("booking.view");

  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const dateKey = url.searchParams.get("date");

  return okJson(await listDayBookingsForBranch(auth.context.currentBranch.id, dateKey));
}
