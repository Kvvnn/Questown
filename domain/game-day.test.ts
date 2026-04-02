import { describe, expect, it } from "vitest";
import { getGameDayWindow, toGameDateKey, toGameMonthKey } from "./game-day";

describe("game day helpers", () => {
  it("uses 05:00 KST as the game day boundary", () => {
    expect(toGameDateKey(new Date("2026-04-01T04:59:00+09:00"))).toBe("2026-03-31");
    expect(toGameDateKey(new Date("2026-04-01T05:00:00+09:00"))).toBe("2026-04-01");
  });

  it("returns the correct game month key around the boundary", () => {
    expect(toGameMonthKey(new Date("2026-04-01T04:59:00+09:00"))).toBe("2026-03");
    expect(toGameMonthKey(new Date("2026-04-01T05:00:00+09:00"))).toBe("2026-04");
  });

  it("builds a 24-hour window from 05:00 KST to the next 05:00", () => {
    const window = getGameDayWindow(new Date("2026-04-01T08:00:00+09:00"));

    expect(window.dateKey).toBe("2026-04-01");
    expect(window.nextDateKey).toBe("2026-04-02");
    expect(window.startAt.toISOString()).toBe("2026-03-31T20:00:00.000Z");
    expect(window.endAt.toISOString()).toBe("2026-04-01T20:00:00.000Z");
  });
});
