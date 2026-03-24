import { describe, expect, it } from "vitest";
import { createTownLayout } from "./town-map";

describe("town map layout", () => {
  it("creates one unique plot per day", () => {
    const layout = createTownLayout("2026-03", 31);
    expect(layout.plots).toHaveLength(31);

    const unique = new Set(layout.plots.map((plot) => `${plot.col}-${plot.row}`));
    expect(unique.size).toBe(31);
  });

  it("follows calendar-like weekday placement", () => {
    const layout = createTownLayout("2026-06", 30); // 2026-06-01 is Monday in Asia/Seoul
    const day1 = layout.plots.find((plot) => plot.day === 1);
    const day7 = layout.plots.find((plot) => plot.day === 7);
    const day8 = layout.plots.find((plot) => plot.day === 8);

    expect(day1).toMatchObject({ row: 0, col: 1 });
    expect(day7).toMatchObject({ row: 1, col: 0 });
    expect(day8).toMatchObject({ row: 1, col: 1 });
  });

  it("keeps map dimensions and roads stable", () => {
    const layout = createTownLayout("2026-09", 30);
    expect(layout.cols).toBe(7);
    expect(layout.rows).toBe(6);
    expect(layout.roadCols.length).toBe(6);
    expect(layout.roadRows.length).toBe(5);
  });
});
