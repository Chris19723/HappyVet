import { describe, it, expect } from "vitest";
import {
  getDayRangeInTimeZone,
  getMonthRangeInTimeZone,
  getWeekRangeInTimeZone,
  getRangeFromDayStringsInTimeZone,
} from "@shared/time";

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

describe("getWeekRangeInTimeZone", () => {
  it("starts on Monday and spans 7 days, in the clinic timezone", () => {
    const { start, end } = getWeekRangeInTimeZone(new Date("2026-09-04T12:00:00Z"), MX);
    // Local Monday midnight in Mexico (UTC-6) is 06:00Z, and 06:00Z Monday has UTC weekday 1.
    expect(start.getUTCDay()).toBe(1);
    expect(start.toISOString().endsWith("T06:00:00.000Z")).toBe(true);
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("contains the reference day", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const { start, end } = getWeekRangeInTimeZone(now, MX);
    expect(now >= start && now < end).toBe(true);
  });
});

describe("getRangeFromDayStringsInTimeZone", () => {
  it("covers the inclusive range with the whole last day", () => {
    const range = getRangeFromDayStringsInTimeZone("2026-09-01", "2026-09-15", MX);
    expect(range).not.toBeNull();
    expect(range!.start.toISOString()).toBe("2026-09-01T06:00:00.000Z");
    // End is the start of the day AFTER the 15th, so the 15th is fully included.
    expect(range!.end.toISOString()).toBe("2026-09-16T06:00:00.000Z");
  });

  it("accepts a single-day range", () => {
    const range = getRangeFromDayStringsInTimeZone("2026-09-04", "2026-09-04", MX);
    expect(range!.start.toISOString()).toBe("2026-09-04T06:00:00.000Z");
    expect(range!.end.toISOString()).toBe("2026-09-05T06:00:00.000Z");
  });

  it("rejects a reversed or malformed range", () => {
    expect(getRangeFromDayStringsInTimeZone("2026-09-15", "2026-09-01", MX)).toBeNull();
    expect(getRangeFromDayStringsInTimeZone("nope", "2026-09-01", MX)).toBeNull();
  });
});
