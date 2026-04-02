import { describe, expect, it } from "vitest";
import { createDefaultRoutineSeed, MORNING_ROUTINE_ID, NIGHT_ROUTINE_ID } from "./game-seeds";
import { buildDailyBuildingForDate, createFloorFromSession, rebuildSessionAggregates } from "./session-aggregates";
import { RoutineSession } from "./game-types";

const seed = createDefaultRoutineSeed();

const buildSession = (overrides: Partial<RoutineSession>): RoutineSession => ({
  id: "session-default",
  routineId: MORNING_ROUTINE_ID,
  dateKey: "2026-03-31",
  startedAt: "2026-03-31T08:30:00.000Z",
  endedAt: "2026-03-31T08:40:00.000Z",
  triggerSource: "manual",
  status: "reviewed",
  resultGrade: "Clear",
  baseScore: 500,
  timeBonus: 200,
  comboBonus: 100,
  clearBonus: 150,
  cleanRunBonus: 120,
  firstSessionBonus: 100,
  focusBonus: 80,
  streakBonus: 0,
  totalScore: 1150,
  normalizedScore: 0.82,
  completedStepCount: 5,
  skippedStepCount: 0,
  pausedCount: 0,
  wasGraceApplied: false,
  ...overrides
});

describe("session aggregates", () => {
  it("creates floor tiers from clear+ grades and skips partial", () => {
    const routine = seed.routinesById[MORNING_ROUTINE_ID];

    expect(createFloorFromSession({ routine, session: buildSession({ id: "clear-session", resultGrade: "Clear" }) })?.qualityTier).toBe(
      "standard"
    );
    expect(createFloorFromSession({ routine, session: buildSession({ id: "great-session", resultGrade: "Great" }) })?.qualityTier).toBe(
      "refined"
    );
    expect(
      createFloorFromSession({ routine, session: buildSession({ id: "perfect-session", resultGrade: "Perfect" }) })?.qualityTier
    ).toBe("signature");
    expect(createFloorFromSession({ routine, session: buildSession({ id: "partial-session", resultGrade: "Partial" }) })).toBeNull();
  });

  it("builds a daily building with ordered floors and streak snapshot", () => {
    const morningFloor = createFloorFromSession({
      routine: seed.routinesById[MORNING_ROUTINE_ID],
      session: buildSession({
        id: "session-morning",
        startedAt: "2026-03-31T07:00:00.000Z",
        endedAt: "2026-03-31T07:10:00.000Z",
        resultGrade: "Great"
      })
    });
    const nightFloor = createFloorFromSession({
      routine: seed.routinesById[NIGHT_ROUTINE_ID],
      session: buildSession({
        id: "session-night",
        routineId: NIGHT_ROUTINE_ID,
        startedAt: "2026-03-31T13:00:00.000Z",
        endedAt: "2026-03-31T13:12:00.000Z",
        totalScore: 920,
        normalizedScore: 0.9,
        resultGrade: "Perfect"
      })
    });

    const building = buildDailyBuildingForDate({
      dateKey: "2026-03-31",
      sessions: [
        buildSession({
          id: "prev-day",
          dateKey: "2026-03-30",
          startedAt: "2026-03-30T07:00:00.000Z",
          endedAt: "2026-03-30T07:10:00.000Z",
          resultGrade: "Clear"
        }),
        buildSession({
          id: "session-morning",
          startedAt: "2026-03-31T07:00:00.000Z",
          endedAt: "2026-03-31T07:10:00.000Z",
          resultGrade: "Great"
        }),
        buildSession({
          id: "session-night",
          routineId: NIGHT_ROUTINE_ID,
          startedAt: "2026-03-31T13:00:00.000Z",
          endedAt: "2026-03-31T13:12:00.000Z",
          totalScore: 920,
          normalizedScore: 0.9,
          resultGrade: "Perfect"
        })
      ],
      floorsBySessionId: {
        "session-morning": morningFloor!,
        "session-night": nightFloor!
      },
      streakLengthsBySessionId: {
        "session-morning": 2,
        "session-night": 1
      }
    });

    expect(building).toEqual({
      dateKey: "2026-03-31",
      sessionIds: ["session-morning", "session-night"],
      floorIds: ["floor-session-morning", "floor-session-night"],
      roofType: "none",
      ornamentIds: [],
      totalScore: 2070,
      successfulSessionCount: 2,
      averageNormalizedScore: 0.86,
      streakSnapshot: {
        [MORNING_ROUTINE_ID]: 2,
        [NIGHT_ROUTINE_ID]: 1
      }
    });
  });

  it("rebuilds floors and daily buildings from completed and reviewed sessions", () => {
    const sessionsById = {
      "session-review": buildSession({
        id: "session-review",
        startedAt: "2026-03-31T07:00:00.000Z",
        endedAt: "2026-03-31T07:05:00.000Z",
        resultGrade: "Perfect"
      }),
      "session-complete": buildSession({
        id: "session-complete",
        routineId: NIGHT_ROUTINE_ID,
        startedAt: "2026-03-31T22:00:00.000Z",
        endedAt: "2026-03-31T22:08:00.000Z",
        status: "completed",
        totalScore: 930,
        normalizedScore: 0.88,
        resultGrade: "Great"
      }),
      "session-partial": buildSession({
        id: "session-partial",
        startedAt: "2026-03-31T09:00:00.000Z",
        endedAt: "2026-03-31T09:04:00.000Z",
        resultGrade: "Partial",
        totalScore: 120,
        normalizedScore: 0.2
      })
    };

    const aggregates = rebuildSessionAggregates({
      sessionsById,
      routinesById: seed.routinesById
    });

    expect(Object.keys(aggregates.floorsById)).toEqual(["floor-session-review", "floor-session-complete"]);
    expect(aggregates.dailyBuildingsByDate["2026-03-31"]?.successfulSessionCount).toBe(2);
    expect(aggregates.dailyBuildingsByDate["2026-03-31"]?.floorIds).toEqual(["floor-session-review", "floor-session-complete"]);
  });
});
