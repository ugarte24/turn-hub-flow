/** Calendar date (YYYY-MM-DD) in America/La_Paz — do not use toISOString (UTC). */
export function todayLaPaz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
