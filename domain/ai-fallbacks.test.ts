import { describe, expect, it } from "vitest";
import {
  buildDurationTuneFallbackResponse,
  buildLauncherFallbackResponse,
  buildReviewFallbackResponse
} from "./ai-fallbacks";
import { MORNING_ROUTINE_ID, createDefaultRoutineSeed } from "./game-seeds";
import { DailyBuilding, RoutineSession, SessionStepResult } from "./game-types";

const buildCompletedSession = ({
  id,
  routineId = MORNING_ROUTINE_ID
}: {
  id: string;
  routineId?: string;
}): RoutineSession => ({
  id,
  routineId,
  dateKey: "2026-03-31",
  startedAt: "2026-03-31T08:30:00.000+09:00",
  endedAt: "2026-03-31T08:50:00.000+09:00",
  triggerSource: "manual",
  status: "reviewed",
  resultGrade: "Great",
  baseScore: 500,
  timeBonus: 150,
  comboBonus: 120,
  clearBonus: 150,
  cleanRunBonus: 0,
  firstSessionBonus: 0,
  focusBonus: 80,
  streakBonus: 0,
  totalScore: 1000,
  normalizedScore: 0.86,
  completedStepCount: 5,
  skippedStepCount: 0,
  pausedCount: 1,
  wasGraceApplied: true
});

const buildStepResult = ({
  sessionId,
  stepId,
  order,
  targetDurationSec,
  overtimeSec = 0,
  pauseCount = 0,
  status = "success"
}: {
  sessionId: string;
  stepId: string;
  order: number;
  targetDurationSec: number;
  overtimeSec?: number;
  pauseCount?: number;
  status?: SessionStepResult["status"];
}): SessionStepResult => ({
  id: `${sessionId}-${stepId}`,
  sessionId,
  stepId,
  order,
  status,
  startedAt: "2026-03-31T08:30:00.000+09:00",
  endedAt: "2026-03-31T08:31:00.000+09:00",
  elapsedSec: targetDurationSec + overtimeSec,
  targetDurationSec,
  overtimeSec,
  pauseCount,
  comboIndexAfterStep: 1,
  scoreEarned: 100
});

describe("ai fallbacks", () => {
  it("builds a deterministic launcher routine suggestion and surprise quest", () => {
    const seed = createDefaultRoutineSeed();
    const response = buildLauncherFallbackResponse({
      kind: "launcher",
      nowIso: "2026-03-31T08:30:00+09:00",
      localTimeOffsetMinutes: 540,
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      dailyBuildingsByDate: {},
      surpriseQuestsById: {}
    });

    expect(response.routineSuggestion?.type).toBe("routine_recommendation");
    expect(response.routineSuggestion?.payload.kind).toBe("routine_recommendation");
    expect(response.routineSuggestion?.targetRoutineId).toBe(MORNING_ROUTINE_ID);
    expect(response.surpriseQuestSuggestion?.payload.kind).toBe("surprise_quest");
    expect(
      response.surpriseQuestSuggestion?.payload.kind === "surprise_quest"
        ? response.surpriseQuestSuggestion.payload.quest.dateKey
        : undefined
    ).toBe("2026-03-31");
  });

  it("uses the caller local offset instead of a fixed KST fallback context", () => {
    const seed = createDefaultRoutineSeed();
    const response = buildLauncherFallbackResponse({
      kind: "launcher",
      nowIso: "2026-03-31T08:30:00-07:00",
      localTimeOffsetMinutes: -420,
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      dailyBuildingsByDate: {},
      surpriseQuestsById: {}
    });

    expect(response.routineSuggestion?.targetRoutineId).toBe(MORNING_ROUTINE_ID);
    expect(
      response.surpriseQuestSuggestion?.payload.kind === "surprise_quest"
        ? response.surpriseQuestSuggestion.payload.quest.dateKey
        : undefined
    ).toBe("2026-03-31");
  });

  it("does not generate ornament surprise quests before today's building exists", () => {
    const seed = createDefaultRoutineSeed();
    const response = buildLauncherFallbackResponse({
      kind: "launcher",
      nowIso: "2026-04-02T08:30:00+09:00",
      localTimeOffsetMinutes: 540,
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      dailyBuildingsByDate: {},
      surpriseQuestsById: {}
    });

    expect(response.surpriseQuestSuggestion?.payload.kind).toBe("surprise_quest");
    expect(
      response.surpriseQuestSuggestion?.payload.kind === "surprise_quest"
        ? response.surpriseQuestSuggestion.payload.quest.rewardType
        : undefined
    ).not.toBe("ornament");
  });

  it("allows ornament surprise quests only after today's building exists", () => {
    const seed = createDefaultRoutineSeed();
    const response = buildLauncherFallbackResponse({
      kind: "launcher",
      nowIso: "2026-04-02T08:30:00+09:00",
      localTimeOffsetMinutes: 540,
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      dailyBuildingsByDate: {
        "2026-04-02": {
          dateKey: "2026-04-02",
          sessionIds: ["session-1"],
          floorIds: ["floor-1"],
          roofType: "none",
          ornamentIds: [],
          totalScore: 200,
          successfulSessionCount: 1,
          averageNormalizedScore: 0.8,
          streakSnapshot: {}
        }
      },
      surpriseQuestsById: {}
    });

    expect(response.surpriseQuestSuggestion?.payload.kind).toBe("surprise_quest");
    expect(
      response.surpriseQuestSuggestion?.payload.kind === "surprise_quest"
        ? response.surpriseQuestSuggestion.payload.quest.rewardType
        : undefined
    ).toBe("ornament");
  });

  it("proposes a duration tune only after repeated friction signals", () => {
    const seed = createDefaultRoutineSeed();
    const washStep = seed.stepsByRoutineId[MORNING_ROUTINE_ID][1];
    const sessionsById = {
      "session-1": buildCompletedSession({ id: "session-1" }),
      "session-2": buildCompletedSession({ id: "session-2" }),
      "session-3": buildCompletedSession({ id: "session-3" })
    };
    const stepResultsBySessionId = {
      "session-1": [
        buildStepResult({
          sessionId: "session-1",
          stepId: washStep.id,
          order: washStep.order,
          targetDurationSec: washStep.recommendedDurationSec,
          overtimeSec: 120,
          pauseCount: 1,
          status: "grace_completed"
        })
      ],
      "session-2": [
        buildStepResult({
          sessionId: "session-2",
          stepId: washStep.id,
          order: washStep.order,
          targetDurationSec: washStep.recommendedDurationSec,
          overtimeSec: 90,
          pauseCount: 1
        })
      ],
      "session-3": [
        buildStepResult({
          sessionId: "session-3",
          stepId: washStep.id,
          order: washStep.order,
          targetDurationSec: washStep.recommendedDurationSec,
          overtimeSec: 0
        })
      ]
    };

    const response = buildDurationTuneFallbackResponse({
      kind: "duration_tune",
      nowIso: "2026-03-31T09:00:00+09:00",
      localTimeOffsetMinutes: 540,
      sessionId: "session-3",
      routinesById: seed.routinesById,
      stepsByRoutineId: seed.stepsByRoutineId,
      sessionsById,
      stepResultsBySessionId
    });

    expect(response.suggestion?.type).toBe("duration_tune");
    expect(response.suggestion?.payload.kind).toBe("duration_tune");
    expect(
      response.suggestion?.payload.kind === "duration_tune" ? response.suggestion.payload.stepId : undefined
    ).toBe(washStep.id);
    expect(
      response.suggestion?.payload.kind === "duration_tune" ? response.suggestion.payload.proposedDurationSec : 0
    ).toBeGreaterThan(washStep.recommendedDurationSec);
  });

  it("wraps the fallback day review in a source-aware suggestion", () => {
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
        [MORNING_ROUTINE_ID]: 2
      }
    };
    const response = buildReviewFallbackResponse({
      kind: "review",
      nowIso: "2026-03-31T23:30:00+09:00",
      localTimeOffsetMinutes: 540,
      dateKey: "2026-03-31",
      building,
      routinesById: seed.routinesById,
      stepsByRoutineId: seed.stepsByRoutineId,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {
        "session-1": buildCompletedSession({ id: "session-1" })
      },
      stepResultsBySessionId: {
        "session-1": []
      },
      dismissedRemainingRoutineIds: []
    });

    expect(response.suggestion).not.toBeNull();
    const suggestion = response.suggestion;
    if (!suggestion) {
      throw new Error("expected fallback review suggestion");
    }

    expect(suggestion.type).toBe("review_commentary");
    expect(suggestion.payload.kind).toBe("review_commentary");
    expect(suggestion.payload.kind === "review_commentary" ? suggestion.payload.summary.source : undefined).toBe("fallback");
    expect(
      suggestion.payload.kind === "review_commentary" ? suggestion.payload.summary.sourceSuggestionId : undefined
    ).toBe(suggestion.id);
  });
});
