import { NextRequest } from "next/server";
import { formatDateKey, normalizeDateKey } from "@/features/booking/date-utils";
import type { BookingDraftSegment } from "@/features/booking/types";
import { badRequest, notFound, okJson } from "@/server/api/responses";
import { createBookingGroupForBranch } from "@/server/repositories/booking-write-repository";
import { getPublicBookingContextBySlug } from "@/server/repositories/public-booking-repository";

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutes(value: string, amount: number) {
  return formatTime(parseTime(value) + amount);
}

function normalizePublicPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return digits.slice(1);
  }

  return digits.length > 10 ? digits.slice(-10) : digits;
}

function formatPublicPhone(value: string) {
  const digits = normalizePublicPhone(value);
  const first = digits.slice(0, 3);
  const second = digits.slice(3, 6);
  const third = digits.slice(6, 8);
  const fourth = digits.slice(8, 10);

  return `+7${first ? ` ${first}` : ""}${second ? ` ${second}` : ""}${third ? `-${third}` : ""}${fourth ? `-${fourth}` : ""}`;
}

function overlaps(input: {
  startTime: string;
  endTime: string;
  againstStart: string;
  againstEnd: string;
}) {
  return (
    parseTime(input.startTime) < parseTime(input.againstEnd) &&
    parseTime(input.againstStart) < parseTime(input.endTime)
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const dateKey = normalizeDateKey(request.nextUrl.searchParams.get("date"));

  if (!dateKey) {
    return badRequest("Некорректная дата.");
  }

  const publicContext = await getPublicBookingContextBySlug(slug, dateKey);

  if (!publicContext) {
    return notFound("Онлайн-запись не найдена.");
  }

  return okJson({ context: publicContext });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        date?: unknown;
        startTime?: unknown;
        slotCount?: unknown;
        postId?: unknown;
        name?: unknown;
        phone?: unknown;
        comment?: unknown;
      }
    | null;

  const dateKey = normalizeDateKey(typeof body?.date === "string" ? body.date : null);
  const startTime = typeof body?.startTime === "string" ? body.startTime.trim() : "";
  const slotCount = body?.slotCount === 2 ? 2 : 1;
  const selectedPostId =
    typeof body?.postId === "string" && body.postId.trim().length > 0
      ? body.postId.trim()
      : null;
  const clientName = typeof body?.name === "string" ? body.name.trim() : "";
  const phoneDigits = normalizePublicPhone(typeof body?.phone === "string" ? body.phone : "");
  const comment = typeof body?.comment === "string" ? body.comment.trim() : "";

  if (!dateKey || !/^\d{2}:\d{2}$/.test(startTime) || !clientName || phoneDigits.length !== 10) {
    return badRequest("Некорректные данные записи.");
  }

  if (dateKey < formatDateKey(new Date())) {
    return badRequest("Нельзя создать запись на прошедшую дату.");
  }

  const publicContext = await getPublicBookingContextBySlug(slug, dateKey);

  if (!publicContext) {
    return notFound("Онлайн-запись не найдена.");
  }

  if (!publicContext.onlineEnabled) {
    return badRequest("Онлайн-запись сейчас недоступна.", 403);
  }

  if (publicContext.posts.length === 0) {
    return badRequest("Свободные места для записи не настроены.", 409);
  }

  if (slotCount === 2 && !publicContext.allowMultipleWindows) {
    return badRequest("Можно выбрать только одно окно записи.");
  }

  const endTime = addMinutes(startTime, publicContext.slotWindowMinutes * slotCount);

  if (
    parseTime(startTime) < parseTime(publicContext.workStart) ||
    parseTime(endTime) > parseTime(publicContext.workEnd)
  ) {
    return badRequest("Выбранный слот недоступен.");
  }

  const candidatePosts = selectedPostId && publicContext.allowPostChoice
    ? publicContext.posts.filter((post) => post.id === selectedPostId)
    : publicContext.posts;

  if (selectedPostId && publicContext.allowPostChoice && candidatePosts.length === 0) {
    return badRequest("Выбранное место недоступно.");
  }

  const chosenPost = candidatePosts.find((post) => {
    const hasOverlap = publicContext.entries.some(
      (entry) =>
        entry.postId === post.id &&
        overlaps({
          startTime,
          endTime,
          againstStart: entry.startTime,
          againstEnd: entry.endTime,
        }),
    );

    return !hasOverlap;
  });

  if (!chosenPost) {
    return badRequest("Выбранный слот уже занят.");
  }

  const segments = [
    {
      id: `public-${Date.now()}`,
      postId: chosenPost.id,
      postName: chosenPost.label,
      start: startTime,
      end: endTime,
    } satisfies BookingDraftSegment,
  ];

  const entries = await createBookingGroupForBranch(publicContext.branchId, {
    date: dateKey,
    note: comment,
    segments,
    createdByEmployeeId: null,
    serviceLabel: "Онлайн-запись",
    clientName,
    clientPhone: formatPublicPhone(phoneDigits),
  });

  return okJson({
    entries,
    booking: entries[0] ?? null,
    chosenPostLabel: chosenPost.label,
  });
}
