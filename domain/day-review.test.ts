import { describe, expect, it } from "vitest";
import { buildFallbackReviewSummary, computeDailyRoofType, finalizeDayReview } from "./day-review";
import { MORNING_ROUTINE_ID, NIGHT_ROUTINE_ID, createDefaultRoutineSeed } from "./game-seeds";
import { DailyBuilding, RoutineSession, SessionStepResult } from "./game-types";

const buildSession = ({
  id,
  routineId,
  resultGrade,
  normalizedScore,
  dateKey = "2026-03-31",
  totalScore = 1000
}: {
  id: string;
  routineId: string;
  resultGrade: RoutineSession["resultGrade"];
  normalizedScore: number;
  dateKey?: string;
  totalScore?: number;
}): RoutineSession => ({
  id,
  routineId,
  dateKey,
  startedAt: `${dateKey}T08:00:00.000+09:00`,
  endedAt: `${dateKey}T08:20:00.000+09:00`,
  triggerSource: "manual",
  status: "reviewed",
  resultGrade,
  baseScore: 500,
  timeBonus: 200,
  comboBonus: 150,
  clearBonus: 150,
  cleanRunBonus: 120,
  firstSessionBonus: 0,
  focusBonus: 80,
  streakBonus: 0,
  totalScore,
  normalizedScore,
  completedStepCount: 5,
  skippedStepCount: 0,
  pausedCount: 0,
  wasGraceApplied: false
});

const buildStepResults = ({
  sessionId,
  stepIds,
  skippedStepId
}: {
  sessionId: string;
  stepIds: string[];
  skippedStepId?: string;
}): SessionStepResult[] =>
  stepIds.map((stepId, index) => ({
    id: `${sessionId}-result-${index + 1}`,
    sessionId,
    stepId,
    order: index + 1,
    status: stepId === skippedStepId ? "skipped" : "success",
    startedAt: "2026-03-31T08:00:00.000+09:00",
    endedAt: "2026-03-31T08:01:00.000+09:00",
    elapsedSec: 60,
    targetDurationSec: 60,
    overtimeSec: 0,
    pauseCount: 0,
    comboIndexAfterStep: stepId === skippedStepId ? 0 : index + 1,
    scoreEarned: stepId === skippedStepId ? 0 : 140
  }));

describe("day review helpers", () => {
  it("computes gold roof only for excellent multi-session days without required skips", () => {
    const seed = createDefaultRoutineSeed();
    const morningSteps = seed.stepsByRoutineId[MORNING_ROUTINE_ID].map((step) => step.id);
    const nightSteps = seed.stepsByRoutineId[NIGHT_ROUTINE_ID].map((step) => step.id);
    const successfulSessions = [
      buildSession({ id: "session-1", routineId: MORNING_ROUTINE_ID, resultGrade: "Perfect", normalizedScore: 0.99 }),
      buildSession({ id: "session-2", routineId: NIGHT_ROUTINE_ID, resultGrade: "Great", normalizedScore: 0.96 })
    ];

    expect(
      computeDailyRoofType({
        successfulSessions,
        stepResultsBySessionId: {
          "session-1": buildStepResults({ sessionId: "session-1", stepIds: morningSteps }),
          "session-2": buildStepResults({ sessionId: "session-2", stepIds: nightSteps })
        },
        stepsByRoutineId: seed.stepsByRoutineId
      })
    ).toBe("gold");

    expect(
      computeDailyRoofType({
        successfulSessions,
        stepResultsBySessionId: {
          "session-1": buildStepResults({ sessionId: "session-1", stepIds: morningSteps, skippedStepId: morningSteps[0] }),
          "session-2": buildStepResults({ sessionId: "session-2", stepIds: nightSteps })
        },
        stepsByRoutineId: seed.stepsByRoutineId
      })
    ).toBe("high");
  });

  it("builds fallback summary and tomorrow hint deterministically", () => {
    const seed = createDefaultRoutineSeed();
    const building: DailyBuilding = {
      dateKey: "2026-03-31",
      sessionIds: ["session-1"],
      floorIds: ["floor-session-1"],
      roofType: "none",
      ornamentIds: [],
      totalScore: 1020,
      successfulSessionCount: 1,
      averageNormalizedScore: 0.92,
      streakSnapshot: {
        [MORNING_ROUTINE_ID]: 2
      }
    };
    const sessionsById = {
      "session-1": buildSession({ id: "session-1", routineId: MORNING_ROUTINE_ID, resultGrade: "Perfect", normalizedScore: 0.92 }),
      "session-2": buildSession({ id: "session-2", routineId: NIGHT_ROUTINE_ID, resultGrade: "Partial", normalizedScore: 0.2, totalScore: 120 })
    };

    const summary = buildFallbackReviewSummary({
      dateKey: "2026-03-31",
      building,
      sessionsById,
      routinesById: seed.routinesById,
      stepResultsBySessionId: {
        "session-1": buildStepResults({ sessionId: "session-1", stepIds: seed.stepsByRoutineId[MORNING_ROUTINE_ID].map((step) => step.id) }),
        "session-2": buildStepResults({ sessionId: "session-2", stepIds: seed.stepsByRoutineId[NIGHT_ROUTINE_ID].map((step) => step.id) })
      },
      stepsByRoutineId: seed.stepsByRoutineId,
      triggersByRoutineId: seed.triggersByRoutineId,
      dismissedRemainingRoutineIds: [NIGHT_ROUTINE_ID],
      now: new Date("2026-03-31T23:00:00+09:00")
    });

    expect(summary.id).toBe("review-2026-03-31");
    expect(summary.source).toBe("fallback");
    expect(summary.headline.length).toBeGreaterThan(0);
    expect(summary.frictionPoints).toContain("Night Shutdown 보류");
    expect(summary.tomorrowHints[0]).toContain("다음 게임 날짜 첫 추천");
  });

  it("finalizes a building by writing roof and review summary metadata", () => {
    const seed = createDefaultRoutineSeed();
    const building: DailyBuilding = {
      dateKey: "2026-03-31",
      sessionIds: ["session-1"],
      floorIds: ["floor-session-1"],
      roofType: "none",
      ornamentIds: [],
      totalScore: 980,
      successfulSessionCount: 1,
      averageNormalizedScore: 0.91,
      streakSnapshot: {
        [MORNING_ROUTINE_ID]: 3
      }
    };

    const finalized = finalizeDayReview({
      dateKey: "2026-03-31",
      building,
      sessionsById: {
        "session-1": buildSession({ id: "session-1", routineId: MORNING_ROUTINE_ID, resultGrade: "Perfect", normalizedScore: 0.91 })
      },
      routinesById: seed.routinesById,
      stepResultsBySessionId: {
        "session-1": buildStepResults({ sessionId: "session-1", stepIds: seed.stepsByRoutineId[MORNING_ROUTINE_ID].map((step) => step.id) })
      },
      stepsByRoutineId: seed.stepsByRoutineId,
      triggersByRoutineId: seed.triggersByRoutineId,
      dismissedRemainingRoutineIds: [],
      now: new Date("2026-03-31T23:30:00+09:00")
    });

    expect(finalized.building.roofType).toBe("high");
    expect(finalized.building.reviewSummaryId).toBe("review-2026-03-31");
    expect(finalized.building.finalizedAt).toBe("2026-03-31T14:30:00.000Z");
    expect(finalized.reviewSummary.headline.length).toBeGreaterThan(0);
  });
});
