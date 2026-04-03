import { describe, expect, it } from "vitest";
import { TownMonth } from "./game-types";
import { createTownLayout, getDistrictProgress, getMonthlyMonumentTier, getTownMonthProgress } from "./town-map";

const createTownMonth = (
  monthKey: string,
  plotSnapshots: TownMonth["plotSnapshots"]
): TownMonth => ({
  monthKey,
  seasonTheme: "spring",
  plotSnapshots,
  landmarkIds: [],
  totalFloorCount: plotSnapshots.reduce((sum, snapshot) => sum + snapshot.floorCount, 0),
  generatedAt: "2026-03-31T00:00:00.000Z"
});

describe("town map layout", () => {
  it("creates one unique plot per day", () => {
    const layout = createTownLayout("2026-03", 31);
    expect(layout.plots).toHaveLength(31);

    const unique = new Set(layout.plots.map((plot) => `${plot.col}-${plot.row}`));
    expect(unique.size).toBe(31);
  });

  it("follows calendar-like weekday placement", () => {
    const layout = createTownLayout("2026-06", 30);
    const day1 = layout.plots.find((plot) => plot.day === 1);
    const day7 = layout.plots.find((plot) => plot.day === 7);
    const day8 = layout.plots.find((plot) => plot.day === 8);

    expect(day1).toMatchObject({ row: 0, col: 1, district: "주거지" });
    expect(day7).toMatchObject({ row: 1, col: 0, district: "상점가" });
    expect(day8).toMatchObject({ row: 1, col: 1, district: "상점가" });
  });

  it("assigns deterministic reward slots that never overlap plots", () => {
    const layout = createTownLayout("2026-09", 30);
    const usedPlots = new Set(layout.plots.map((plot) => `${plot.col}-${plot.row}`));

    expect(layout.scenery.filter((tile) => tile.kind === "monthly_monument")).toHaveLength(1);
    expect(layout.scenery.filter((tile) => tile.kind === "district_landmark")).toHaveLength(layout.districts.length);
    expect(layout.scenery.filter((tile) => tile.kind === "district_gate")).toHaveLength(
      layout.districts.filter((district) => district.isCore).length
    );

    layout.scenery.forEach((tile) => {
      expect(usedPlots.has(`${tile.col}-${tile.row}`)).toBe(false);
    });

    const first = createTownLayout("2026-09", 30);
    const second = createTownLayout("2026-09", 30);
    expect(first.scenery).toEqual(second.scenery);
  });

  it("keeps map dimensions and render roads stable", () => {
    const layout = createTownLayout("2026-09", 30);
    expect(layout.cols).toBe(7);
    expect(layout.rows).toBe(6);
    expect(layout.roadCols.length).toBe(6);
    expect(layout.roadRows.length).toBe(5);
    expect(layout.roads).toEqual([
      { key: "2026-09-avenue-main", orientation: "vertical", col: 3 },
      { key: "2026-09-road-row-0", orientation: "horizontal", row: 0 },
      { key: "2026-09-road-row-1", orientation: "horizontal", row: 1 },
      { key: "2026-09-road-row-2", orientation: "horizontal", row: 2 },
      { key: "2026-09-road-row-3", orientation: "horizontal", row: 3 },
      { key: "2026-09-road-row-4", orientation: "horizontal", row: 4 }
    ]);
  });
});

describe("town month progression", () => {
  it("uses floor targets for partial extension districts", () => {
    const layout = createTownLayout("2026-06", 30);
    const month = createTownMonth(
      "2026-06",
      layout.plots
        .filter((plot) => plot.district === "축제 확장지")
        .map((plot) => ({
          dateKey: plot.date,
          floorCount: 1,
          roofType: "none" as const,
          ornamentIds: []
        }))
    );

    const progress = getDistrictProgress(layout, "축제 확장지", month);

    expect(progress.activePlotCount).toBe(3);
    expect(progress.targetMain).toBe(3);
    expect(progress.completedMain).toBe(3);
    expect(progress.unlocked).toBe(true);
  });

  it("unlocks core districts at the exact floor threshold", () => {
    const layout = createTownLayout("2026-06", 30);
    const residentialPlots = layout.plots.filter((plot) => plot.district === "주거지");
    const month = createTownMonth(
      "2026-06",
      residentialPlots.map((plot, index) => ({
        dateKey: plot.date,
        floorCount: index < 3 ? 1 : index === 3 ? 5 : 0,
        roofType: "none" as const,
        ornamentIds: []
      }))
    );

    const progress = getDistrictProgress(layout, "주거지", month);
    expect(progress.activePlotCount).toBe(6);
    expect(progress.targetMain).toBe(12);
    expect(progress.completedMain).toBe(8);
    expect(progress.unlocked).toBe(false);

    const unlockedMonth = createTownMonth(
      "2026-06",
      residentialPlots.map((plot, index) => ({
        dateKey: plot.date,
        floorCount: index < 6 ? 2 : 0,
        roofType: "none" as const,
        ornamentIds: []
      }))
    );

    expect(getDistrictProgress(layout, "주거지", unlockedMonth).unlocked).toBe(true);
  });

  it("counts only core districts toward the monthly monument tier", () => {
    const layout = createTownLayout("2026-06", 30);
    const plotSnapshots = layout.plots.map((plot) => {
      const unlockedCoreDistricts = new Set(["주거지", "상점가", "문화지구", "랜드마크 지구"]);
      const floorCount = unlockedCoreDistricts.has(plot.district) ? 2 : plot.district === "축제 확장지" ? 1 : 0;

      return {
        dateKey: plot.date,
        floorCount,
        roofType: "none" as const,
        ornamentIds: []
      };
    });
    const monthProgress = getTownMonthProgress(layout, createTownMonth("2026-06", plotSnapshots));

    expect(monthProgress.coreUnlockedCount).toBe(4);
    expect(monthProgress.districtProgressByName["축제 확장지"].unlocked).toBe(true);
    expect(monthProgress.monumentTier).toBe(4);
    expect(getMonthlyMonumentTier(monthProgress)).toBe(4);
    expect(getMonthlyMonumentTier(2)).toBe(2);
  });
});
