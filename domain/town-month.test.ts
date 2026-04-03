import { describe, expect, it } from "vitest";
import { buildBuildingOrnamentIds, buildTownMonthSnapshot, getTownSeasonTheme } from "./town-month";
import { DailyBuilding, Floor, SurpriseQuest } from "./game-types";

const buildFloor = (id: string, dateKey: string): Floor => ({
  id,
  sessionId: `session-${id}`,
  dateKey,
  routineCategory: "morning_reset",
  visualStyleKey: `floor:${id}`,
  qualityTier: "standard",
  ornamentIds: []
});

const buildBuilding = ({
  dateKey,
  floorIds,
  ...overrides
}: Partial<DailyBuilding> & Pick<DailyBuilding, "dateKey" | "floorIds">): DailyBuilding => ({
  dateKey,
  sessionIds: floorIds.map((floorId) => `session-${floorId}`),
  floorIds,
  roofType: "none",
  ornamentIds: [],
  totalScore: 1000,
  successfulSessionCount: floorIds.length,
  averageNormalizedScore: 0.8,
  streakSnapshot: {},
  ...overrides
});

const buildQuest = ({
  id,
  dateKey,
  ...overrides
}: Partial<SurpriseQuest> & Pick<SurpriseQuest, "id" | "dateKey">): SurpriseQuest => ({
  id,
  dateKey,
  title: id,
  contextType: "generic",
  difficulty: 1,
  rewardType: "ornament",
  status: "completed",
  ...overrides
});

describe("town month snapshot", () => {
  it("maps floors, finalized roofs, and completed ornament rewards into plot snapshots", () => {
    const floorsById = {
      "floor-a": buildFloor("floor-a", "2026-03-02"),
      "floor-b": buildFloor("floor-b", "2026-03-02"),
      "floor-c": buildFloor("floor-c", "2026-03-03")
    };
    const dailyBuildingsByDate = {
      "2026-03-02": buildBuilding({
        dateKey: "2026-03-02",
        floorIds: ["floor-a", "floor-b"],
        roofType: "high",
        finalizedAt: "2026-03-02T22:00:00.000Z"
      }),
      "2026-03-03": buildBuilding({
        dateKey: "2026-03-03",
        floorIds: ["floor-c"],
        roofType: "gold"
      })
    };
    const surpriseQuestsById = {
      "ornament-02": buildQuest({
        id: "ornament-02",
        dateKey: "2026-03-02",
        title: "현관 장식",
        status: "completed"
      }),
      "ornament-03-proposed": buildQuest({
        id: "ornament-03-proposed",
        dateKey: "2026-03-03",
        title: "미완료 장식",
        status: "proposed"
      })
    };

    const month = buildTownMonthSnapshot({
      monthKey: "2026-03",
      dailyBuildingsByDate,
      floorsById,
      surpriseQuestsById,
      currentGameDateKey: "2026-03-31",
      generatedAt: "2026-03-31T00:00:00.000Z"
    });

    expect(month.totalFloorCount).toBe(3);
    expect(month.plotSnapshots).toEqual([
      {
        dateKey: "2026-03-02",
        floorCount: 2,
        roofType: "high",
        ornamentIds: ["ornament-02"]
      },
      {
        dateKey: "2026-03-03",
        floorCount: 1,
        roofType: "none",
        ornamentIds: []
      }
    ]);
  });

  it("computes season themes and landmark tiers from the month shape", () => {
    expect(getTownSeasonTheme("2026-03")).toBe("spring");
    expect(getTownSeasonTheme("2026-07")).toBe("summer");
    expect(getTownSeasonTheme("2026-10")).toBe("autumn");
    expect(getTownSeasonTheme("2026-12")).toBe("winter");
  });

  it("builds stable ornament ids from completed ornament quests only", () => {
    const surpriseQuestsById = {
      completed: buildQuest({ id: "completed", dateKey: "2026-03-31", status: "completed" }),
      skipped: buildQuest({ id: "skipped", dateKey: "2026-03-31", status: "skipped" }),
      score: buildQuest({ id: "score", dateKey: "2026-03-31", rewardType: "score", status: "completed" })
    };

    expect(
      buildBuildingOrnamentIds({
        dateKey: "2026-03-31",
        surpriseQuestsById,
        existingOrnamentIds: ["completed"]
      })
    ).toEqual(["completed"]);
  });
});
