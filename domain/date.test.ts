import { describe, expect, it } from "vitest";
import { addDays, addMonths, getDaysInMonth } from "./date";

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
});
