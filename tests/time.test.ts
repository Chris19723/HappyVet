import { describe, it, expect } from "vitest";
import { getDayRangeInTimeZone, getMonthRangeInTimeZone } from "@shared/time";

const MX = "America/Mexico_City"; // UTC-6, no DST since 2022

describe("getDayRangeInTimeZone", () => {
  it("anchors the day to the clinic timezone, not UTC", () => {
    // Midday Sept 4 in Mexico.
    const now = new Date("2026-09-04T12:00:00Z");
    const { start, end } = getDayRangeInTimeZone(now, MX);
    // Local midnight Sept 4 in Mexico (UTC-6) is 06:00Z.
    expect(start.toISOString()).toBe("2026-09-04T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-05T06:00:00.000Z");
  });

  it("does NOT count a late-evening appointment as the next day (the reported bug)", () => {
    // A Sept 3 22:33 appointment in Mexico is stored as Sept 4 04:33 UTC.
    const appt = new Date("2026-09-04T04:33:00Z");
    // 'Now' is sometime on Sept 4 in Mexico.
    const { start, end } = getDayRangeInTimeZone(new Date("2026-09-04T15:00:00Z"), MX);
    const inToday = appt >= start && appt < end;
    expect(inToday).toBe(false); // it belongs to Sept 3, not today
  });

  it("counts an appointment made this morning in Mexico as today", () => {
    const appt = new Date("2026-09-04T16:00:00Z"); // 10:00 Mexico, Sept 4
    const { start, end } = getDayRangeInTimeZone(new Date("2026-09-04T17:00:00Z"), MX);
    expect(appt >= start && appt < end).toBe(true);
  });

  it("matches plain UTC midnights when the timezone is UTC", () => {
    const { start, end } = getDayRangeInTimeZone(new Date("2026-09-04T12:00:00Z"), "UTC");
    expect(start.toISOString()).toBe("2026-09-04T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });
});

describe("getMonthRangeInTimeZone", () => {
  it("bounds the month in the clinic timezone", () => {
    const { start, end } = getMonthRangeInTimeZone(new Date("2026-09-15T12:00:00Z"), MX);
    expect(start.toISOString()).toBe("2026-09-01T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-01T06:00:00.000Z");
  });
});
