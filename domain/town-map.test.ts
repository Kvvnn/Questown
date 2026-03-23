import { describe, expect, it } from "vitest";
import { createTownLayout } from "./town-map";

describe("town map layout", () => {
  it("creates one unique plot per day", () => {
    const layout = createTownLayout("2026-03", 31);
    expect(layout.plots).toHaveLength(31);

    const unique = new Set(layout.plots.map((plot) => `${plot.col}-${plot.row}`));
    expect(unique.size).toBe(31);
  });

  it("is deterministic for same month", () => {
    const a = createTownLayout("2026-05", 31);
    const b = createTownLayout("2026-05", 31);

    expect(a.plots.map((p) => `${p.day}:${p.col}-${p.row}`)).toEqual(
      b.plots.map((p) => `${p.day}:${p.col}-${p.row}`)
    );
  });

  it("changes layout across months", () => {
    const a = createTownLayout("2026-05", 31);
    const b = createTownLayout("2026-06", 30);

    expect(a.plots[0]?.col).not.toBe(b.plots[0]?.col);
  });
});
