import { describe, expect, it } from "vitest";
import { getDayFromDate, getPreferredTownDate, moveDateInMonth, toDateFromDay } from "./town-navigation";

describe("town navigation", () => {
  it("extracts day only when month matches", () => {
    expect(getDayFromDate("2026-03-14", "2026-03")).toBe(14);
    expect(getDayFromDate("2026-04-14", "2026-03")).toBeNull();
  });

  it("moves by keyboard direction with clamp", () => {
    expect(moveDateInMonth("2026-03-14", "2026-03", 31, "left")).toBe("2026-03-13");
    expect(moveDateInMonth("2026-03-14", "2026-03", 31, "up")).toBe("2026-03-07");
    expect(moveDateInMonth("2026-03-03", "2026-03", 31, "up")).toBe("2026-03-01");
    expect(moveDateInMonth("2026-03-30", "2026-03", 31, "down")).toBe("2026-03-31");
  });

  it("supports home/end and fallback from empty selection", () => {
    expect(moveDateInMonth(undefined, "2026-03", 31, "home")).toBe("2026-03-01");
    expect(moveDateInMonth(undefined, "2026-03", 31, "end")).toBe("2026-03-31");
    expect(toDateFromDay("2026-03", 5)).toBe("2026-03-05");
  });

  it("prefers a valid selected date before other fallbacks", () => {
    expect(
      getPreferredTownDate({
        monthKey: "2026-03",
        dayCount: 31,
        currentDate: "2026-03-14",
        selectedDate: "2026-03-20",
        availableDates: ["2026-03-03", "2026-03-08"]
      })
    ).toBe("2026-03-20");
  });

  it("clamps selected or current dates when the target month is shorter", () => {
    expect(
      getPreferredTownDate({
        monthKey: "2026-02",
        dayCount: 28,
        currentDate: "2026-02-14",
        selectedDate: "2026-02-31",
        availableDates: ["2026-02-03", "2026-02-08"]
      })
    ).toBe("2026-02-28");

    expect(
      getPreferredTownDate({
        monthKey: "2026-02",
        dayCount: 28,
        currentDate: "2026-02-31",
        selectedDate: "2026-01-20",
        availableDates: ["2026-02-03", "2026-02-08"]
      })
    ).toBe("2026-02-28");
  });

  it("falls back to the current date, then the first recorded date, then day one", () => {
    expect(
      getPreferredTownDate({
        monthKey: "2026-03",
        dayCount: 31,
        currentDate: "2026-03-14",
        selectedDate: "2026-02-20",
        availableDates: ["2026-03-03", "2026-03-08"]
      })
    ).toBe("2026-03-14");

    expect(
      getPreferredTownDate({
        monthKey: "2026-03",
        dayCount: 31,
        currentDate: "2026-04-14",
        selectedDate: "2026-02-20",
        availableDates: ["2026-03-08", "2026-03-03"]
      })
    ).toBe("2026-03-03");

    expect(
      getPreferredTownDate({
        monthKey: "2026-03",
        dayCount: 31,
        currentDate: "2026-04-14",
        selectedDate: "2026-02-20",
        availableDates: []
      })
    ).toBe("2026-03-01");
  });
});
