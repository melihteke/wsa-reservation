import { describe, expect, it } from "vitest";
import { addDays, bookingDays, DEFAULT_SETTINGS as S, durationOptions, formatMinutes, peakUsage, startSlots, zonedParts, zonedToUtc } from "./rules";

const ams = (iso: string) => new Date(iso);

describe("time zone helpers", () => {
  it("converts Amsterdam wall-clock time to UTC in summer and winter", () => {
    expect(zonedToUtc("2026-07-01", "10:00", S.time_zone).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "10:00", S.time_zone).toISOString()).toBe("2026-12-01T09:00:00.000Z");
    // DST ends on 25 Oct 2026; 12:00 is CET (UTC+1).
    expect(zonedToUtc("2026-10-25", "12:00", S.time_zone).toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });

  it("reads the local date around midnight", () => {
    expect(zonedParts(ams("2026-07-01T22:30:00Z"), S.time_zone).date).toBe("2026-07-02");
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("booking window", () => {
  it("offers today and tomorrow", () => {
    expect(bookingDays(ams("2026-07-01T21:59:00Z"), S)).toEqual(["2026-07-01", "2026-07-02"]);
  });

  it("offers every half hour that still fits before closing", () => {
    const slots = startSlots("2026-07-02", ams("2026-07-01T10:00:00Z"), S);
    expect(slots[0]).toBe("09:00");
    expect(slots.at(-1)).toBe("20:30");
    expect(slots).toHaveLength(24);
  });

  it("starts today's slots at the current half hour", () => {
    // 14:10 local -> the 14:00 slot is still bookable, like in the database.
    expect(startSlots("2026-07-01", ams("2026-07-01T12:10:00Z"), S)[0]).toBe("14:00");
    // Before opening, the first slot is the opening time.
    expect(startSlots("2026-07-01", ams("2026-07-01T05:00:00Z"), S)[0]).toBe("09:00");
    // After closing, nothing is left.
    expect(startSlots("2026-07-01", ams("2026-07-01T19:45:00Z"), S)).toEqual([]);
  });

  it("caps duration at 3 hours and at closing time", () => {
    expect(durationOptions("10:00", S)).toEqual([30, 60, 90, 120, 150, 180]);
    expect(durationOptions("19:30", S)).toEqual([30, 60, 90]);
  });
});

describe("peakUsage", () => {
  const r = (a: string, b: string) => ({ start_at: `2026-07-02T${a}:00Z`, end_at: `2026-07-02T${b}:00Z` });
  const w = (a: string, b: string) => [new Date(`2026-07-02T${a}:00Z`), new Date(`2026-07-02T${b}:00Z`)] as const;

  it("counts the busiest moment, not every overlap", () => {
    const list = [r("10:00", "11:00"), r("11:00", "12:00")];
    expect(peakUsage(list, ...w("10:00", "12:00"))).toBe(1);
    expect(peakUsage([...list, r("10:00", "12:00")], ...w("10:30", "11:30"))).toBe(2);
    expect(peakUsage(list, ...w("12:00", "13:00"))).toBe(0);
  });
});

it("formats durations", () => {
  expect(formatMinutes(90, "uur")).toBe("1 uur 30 min");
  expect(formatMinutes(30)).toBe("30 min");
  expect(formatMinutes(180)).toBe("3 h");
});
