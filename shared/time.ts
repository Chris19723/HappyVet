// Timezone-aware day/month ranges.
//
// Timestamps are stored in UTC, but the app runs in the cloud where the server
// timezone is UTC. "Today" on the dashboard must be anchored to the CLINIC's
// timezone, not the server's — otherwise a late-evening appointment in Mexico
// (UTC-6) is stored past midnight UTC and wrongly counted as the next day.
//
// These helpers compute the [start, end) UTC instants that bound a calendar day
// or month AS SEEN IN a given IANA timezone (e.g. "America/Mexico_City").

function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  // en-US with hour12:false can emit "24" for midnight; normalize to 0.
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

// Offset (ms) of `timeZone` from UTC at the given instant. Positive when the
// zone is ahead of UTC.
function offsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

// The UTC instant for a wall-clock time in `timeZone`. Month/day overflow is
// normalized by Date.UTC (e.g. day = 32 rolls into the next month), so callers
// can pass day + 1 to get the next day.
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const off = offsetMs(guess, timeZone);
  return new Date(guess.getTime() - off);
}

// [start, end) UTC instants for the calendar day that `now` falls on in `timeZone`.
export function getDayRangeInTimeZone(
  now: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const { year, month, day } = getZonedParts(now, timeZone);
  const start = zonedWallTimeToUtc(year, month, day, 0, 0, 0, timeZone);
  const end = zonedWallTimeToUtc(year, month, day + 1, 0, 0, 0, timeZone);
  return { start, end };
}

// [start, end) UTC instants for the calendar month that `now` falls on in `timeZone`.
export function getMonthRangeInTimeZone(
  now: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const { year, month } = getZonedParts(now, timeZone);
  const start = zonedWallTimeToUtc(year, month, 1, 0, 0, 0, timeZone);
  const end = zonedWallTimeToUtc(year, month + 1, 1, 0, 0, 0, timeZone);
  return { start, end };
}
