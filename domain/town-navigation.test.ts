import { describe, expect, it } from "vitest";
import { getDayFromDate, moveDateInMonth, toDateFromDay } from "./town-navigation";

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
});
