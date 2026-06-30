export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function normalizeDateKey(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = parseDateKey(value);
  return formatDateKey(parsed) === value ? value : null;
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function normalizeMonthKey(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = parseMonthKey(value);
  return formatMonthKey(parsed) === value ? value : null;
}

export function parseMonthKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1, 12, 0, 0, 0);
}

export function addDays(dateKey: string, amount: number) {
  const nextDate = parseDateKey(dateKey);
  nextDate.setDate(nextDate.getDate() + amount);
  return formatDateKey(nextDate);
}

export function addMonths(dateKey: string, amount: number) {
  const currentDate = parseDateKey(dateKey);
  const nextDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + amount,
    1,
    12,
    0,
    0,
    0,
  );

  return formatDateKey(nextDate);
}

export function addMonthsToMonthKey(monthKey: string, amount: number) {
  const currentDate = parseMonthKey(monthKey);
  const nextDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + amount,
    1,
    12,
    0,
    0,
    0,
  );

  return formatMonthKey(nextDate);
}
