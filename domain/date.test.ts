import { describe, expect, it } from "vitest";
import { addDays, addMonths, getDaysInMonth, isDateKey, isMonthKey } from "./date";

const withTimeZone = (timeZone: string, run: () => void) => {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;

  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
      return;
    }

    process.env.TZ = previous;
  }
};

describe("date utils", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
  });

  it("adds months safely", () => {
    expect(addMonths("2026-03", 1)).toBe("2026-04");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("returns days in month", () => {
    expect(getDaysInMonth("2026-02")).toBe(28);
  });

  it("keeps month math stable outside Asia/Seoul", () => {
    withTimeZone("America/Los_Angeles", () => {
      expect(getDaysInMonth("2026-03")).toBe(31);
      expect(addMonths("2026-03", -1)).toBe("2026-02");
      expect(addMonths("2026-03", 1)).toBe("2026-04");
    });
  });

  it("keeps day math stable across DST changes", () => {
    withTimeZone("America/Los_Angeles", () => {
      expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
      expect(addDays("2026-11-02", -1)).toBe("2026-11-01");
    });
  });

  it("validates imported date and month keys", () => {
    expect(isDateKey("2026-03-24")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("not-a-date")).toBe(false);
    expect(isMonthKey("2026-03")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-3")).toBe(false);
  });
});
