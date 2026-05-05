/**
 * Business-hours evaluation. Convert an epoch ms to local
 * day-of-week + minute-of-day in the brand's IANA timezone, then
 * look up the matching weekly-schedule entry. DST is handled by
 * Intl.DateTimeFormat — we never have to do offset arithmetic.
 */

export type BusinessHoursWindow = { open: number; close: number };
export type BusinessHoursConfig = {
  timezone: string;
  weeklySchedule: Array<BusinessHoursWindow | null>;
  offHoursMessage: string;
};

/**
 * Returns true when `nowMs` falls within the brand's open-hours
 * window. Returns true (treat as always-open) when:
 *   - config is undefined / null
 *   - the timezone is invalid (failing closed would silently
 *     break legitimate brands; we'd rather skip the auto-reply)
 *   - weeklySchedule is malformed (length != 7)
 *
 * The pattern: when in doubt, don't send an off-hours auto-reply.
 * False negatives are fine (visitor talks to humans during the
 * day); false positives are catastrophic (visitor at 2pm gets
 * "we're closed" because of a config bug).
 */
export function isWithinBusinessHours(
  config: BusinessHoursConfig | null | undefined,
  nowMs: number,
): boolean {
  if (!config) return true;
  if (!config.weeklySchedule || config.weeklySchedule.length !== 7) {
    return true;
  }

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: config.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(nowMs));
  } catch {
    // Invalid timezone string — fail open.
    return true;
  }

  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "";
  // monday=0..sunday=6 — matches our weeklySchedule index. We use
  // monday=0 (ISO 8601) rather than Sunday-first because every other
  // weekly UI in the codebase already does so.
  const weekdayIndex = (
    {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    } as Record<string, number>
  )[weekdayShort];
  if (weekdayIndex === undefined) return true;

  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";
  // Intl returns "24" for midnight on some Node versions — clamp.
  const hour = Math.min(23, Math.max(0, Number(hourStr) % 24));
  const minute = Math.min(59, Math.max(0, Number(minuteStr)));
  const minuteOfDay = hour * 60 + minute;

  const window = config.weeklySchedule[weekdayIndex];
  if (!window) return false; // closed all day
  return minuteOfDay >= window.open && minuteOfDay < window.close;
}
