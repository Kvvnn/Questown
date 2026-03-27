import { describe, expect, it } from "vitest";
import { ensureDailyRecord } from "./date";
import {
  createTownLayout,
  getDistrictProgress,
  getMonthlyMonumentTier,
  getTownMonthProgress
} from "./town-map";
import { DailyRecord } from "./types";

const createRecord = (
  date: string,
  {
    completedMain = 0,
    totalMain = completedMain
  }: {
    completedMain?: number;
    totalMain?: number;
  } = {}
): DailyRecord => ({
  ...ensureDailyRecord(date),
  completedCount: completedMain,
  totalCount: totalMain,
  completedByType: {
    daily: 0,
    main: completedMain,
    sub: 0
  },
  totalByType: {
    daily: 0,
    main: totalMain,
    sub: 0
  }
});

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
  it("scales district targetMain by active plot count for partial weeks", () => {
    const layout = createTownLayout("2026-06", 30);
    const recordsByDate = Object.fromEntries(
      layout.plots
        .filter((plot) => plot.district === "축제 확장지")
        .map((plot) => [plot.date, createRecord(plot.date, { completedMain: 1, totalMain: 1 })])
    );

    const progress = getDistrictProgress(layout, "축제 확장지", recordsByDate, 5);

    expect(progress.activePlotCount).toBe(3);
    expect(progress.targetMain).toBe(3);
    expect(progress.completedMain).toBe(3);
    expect(progress.unlocked).toBe(true);
  });

  it("unlocks districts at the exact target threshold", () => {
    const layout = createTownLayout("2026-06", 30);
    const residentialPlots = layout.plots.filter((plot) => plot.district === "주거지");
    const recordsByDate = Object.fromEntries(
      residentialPlots.map((plot, index) => [
        plot.date,
        createRecord(plot.date, { completedMain: index < 4 ? 1 : 0, totalMain: 1 })
      ])
    );

    const progress = getDistrictProgress(layout, "주거지", recordsByDate, 4);
    expect(progress.activePlotCount).toBe(6);
    expect(progress.targetMain).toBe(4);
    expect(progress.completedMain).toBe(4);
    expect(progress.unlocked).toBe(true);
  });

  it("counts only core districts toward the monthly monument tier", () => {
    const layout = createTownLayout("2026-06", 30);
    const recordsByDate: Record<string, DailyRecord> = {};

    const unlockDistrict = (districtName: string, completedMain: number) => {
      const plots = layout.plots.filter((plot) => plot.district === districtName);
      plots.forEach((plot, index) => {
        recordsByDate[plot.date] = createRecord(plot.date, {
          completedMain: index < completedMain ? 1 : 0,
          totalMain: 1
        });
      });
    };

    unlockDistrict("주거지", 4);
    unlockDistrict("상점가", 4);
    unlockDistrict("문화지구", 4);
    unlockDistrict("랜드마크 지구", 4);
    unlockDistrict("축제 확장지", 2);

    const monthProgress = getTownMonthProgress(layout, recordsByDate, 4);

    expect(monthProgress.coreUnlockedCount).toBe(4);
    expect(monthProgress.districtProgressByName["축제 확장지"].unlocked).toBe(true);
    expect(monthProgress.monumentTier).toBe(4);
    expect(getMonthlyMonumentTier(monthProgress)).toBe(4);
    expect(getMonthlyMonumentTier(2)).toBe(2);
  });
});
