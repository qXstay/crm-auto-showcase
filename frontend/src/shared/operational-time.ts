export const PEGAS_OPERATIONAL_TIME_ZONE = "Asia/Yekaterinburg";

export function formatOperationalDateKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
  }).format(date);
}

export function formatOperationalTimeLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
  }).format(date);
}
