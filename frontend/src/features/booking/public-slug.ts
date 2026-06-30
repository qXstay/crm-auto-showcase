export function normalizePublicBookingSlugSegment(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim().toLowerCase();

  if (!trimmed || trimmed.includes("://") || /[/?#]/.test(trimmed)) {
    return "";
  }

  return trimmed
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolvePublicBookingSlug(input: {
  storedValue?: string | null;
  branchCode?: string | null;
}) {
  return (
    normalizePublicBookingSlugSegment(input.storedValue) ||
    normalizePublicBookingSlugSegment(input.branchCode) ||
    "booking"
  );
}
