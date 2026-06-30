import { notFound } from "next/navigation";
import { formatDateKey, normalizeDateKey } from "@/features/booking/date-utils";
import { PublicBookingScreen } from "@/features/booking/components/public-booking-screen";
import { getPublicBookingContextBySlug } from "@/server/repositories/public-booking-repository";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ date?: string | string[] }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialDate =
    normalizeDateKey(typeof resolvedSearchParams.date === "string" ? resolvedSearchParams.date : null) ??
    formatDateKey(new Date());
  const publicContext = await getPublicBookingContextBySlug(slug, initialDate);

  if (!publicContext) {
    notFound();
  }

  return (
    <PublicBookingScreen
      slug={slug}
      initialDate={initialDate}
      initialContext={publicContext}
    />
  );
}
