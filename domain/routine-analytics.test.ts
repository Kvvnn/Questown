import { describe, expect, it } from "vitest";
import { getRoutineAnalyticsEvents, getRoutineAnalyticsSnapshot } from "./routine-analytics";
import { AiSuggestion, DailyBuilding, Floor, RoutineMigrationMeta, RoutineSession, SurpriseQuest } from "./game-types";

describe("routine analytics", () => {
  it("builds a stable snapshot from routine-native source data", () => {
    const sessionsById: Record<string, RoutineSession> = {
      "session-1": {
        id: "session-1",
        routineId: "routine-morning-reset",
        dateKey: "2026-03-30",
        startedAt: "2026-03-30T08:00:00.000Z",
        endedAt: "2026-03-30T08:10:00.000Z",
        triggerSource: "manual",
        status: "reviewed",
        resultGrade: "Perfect",
        baseScore: 100,
        timeBonus: 40,
        comboBonus: 50,
        clearBonus: 150,
        cleanRunBonus: 120,
        firstSessionBonus: 100,
        focusBonus: 80,
        streakBonus: 0,
        totalScore: 640,
        normalizedScore: 1,
        completedStepCount: 5,
        skippedStepCount: 0,
        pausedCount: 0,
        wasGraceApplied: false
      },
      "session-2": {
        id: "session-2",
        routineId: "routine-night-shutdown",
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T12:00:00.000Z",
        endedAt: "2026-03-31T12:10:00.000Z",
        triggerSource: "time",
        status: "reviewed",
        resultGrade: "Partial",
        baseScore: 80,
        timeBonus: 0,
        comboBonus: 0,
        clearBonus: 0,
        cleanRunBonus: 0,
        firstSessionBonus: 0,
        focusBonus: 0,
        streakBonus: 0,
        totalScore: 80,
        normalizedScore: 0.2,
        completedStepCount: 2,
        skippedStepCount: 3,
        pausedCount: 1,
        wasGraceApplied: false
      }
    };
    const dailyBuildingsByDate: Record<string, DailyBuilding> = {
      "2026-03-30": {
        dateKey: "2026-03-30",
        sessionIds: ["session-1"],
        floorIds: ["floor-session-1"],
        roofType: "high",
        ornamentIds: [],
        totalScore: 640,
        successfulSessionCount: 1,
        averageNormalizedScore: 1,
        streakSnapshot: {},
        reviewSummaryId: "review-2026-03-30",
        finalizedAt: "2026-03-30T23:00:00.000Z"
      }
    };
    const floorsById: Record<string, Floor> = {
      "floor-session-1": {
        id: "floor-session-1",
        sessionId: "session-1",
        dateKey: "2026-03-30",
        routineCategory: "morning_reset",
        visualStyleKey: "floor:test",
        qualityTier: "signature",
        ornamentIds: []
      }
    };
    const surpriseQuestsById: Record<string, SurpriseQuest> = {
      "quest-1": {
        id: "quest-1",
        dateKey: "2026-03-30",
        title: "물 한 컵 마시기",
        contextType: "health",
        difficulty: 1,
        rewardType: "score",
        status: "completed",
        completedAt: "2026-03-30T08:15:00.000Z"
      },
      "quest-2": {
        id: "quest-2",
        dateKey: "2026-03-31",
        title: "문 열고 환기하기",
        contextType: "home",
        difficulty: 1,
        rewardType: "ornament",
        status: "skipped"
      }
    };
    const aiSuggestionsById: Record<string, AiSuggestion> = {
      "ai-1": {
        id: "ai-1",
        type: "duration_tune",
        targetDateKey: "2026-03-31",
        targetRoutineId: "routine-morning-reset",
        targetSessionId: "session-1",
        generatedAt: "2026-03-31T00:00:00.000Z",
        reasoningSummary: "시간을 조금 더 주세요.",
        confidence: 0.7,
        status: "applied",
        source: "ai",
        resolvedAt: "2026-03-31T09:00:00.000Z",
        payload: {
          kind: "duration_tune",
          routineId: "routine-morning-reset",
          stepId: "step-1",
          stepTitle: "세수",
          currentDurationSec: 300,
          proposedDurationSec: 360,
          deltaSec: 60,
          frictionSignals: ["overtime"]
        }
      },
      "ai-2": {
        id: "ai-2",
        type: "routine_recommendation",
        targetDateKey: "2026-03-31",
        targetRoutineId: "routine-night-shutdown",
        generatedAt: "2026-03-31T00:00:00.000Z",
        reasoningSummary: "오늘은 쉬어가세요.",
        confidence: 0.4,
        status: "dismissed",
        source: "fallback",
        resolvedAt: "2026-03-31T10:00:00.000Z",
        payload: {
          kind: "routine_recommendation",
          routineId: "routine-night-shutdown",
          directorNote: "지금은 보류합니다.",
          launchContext: {
            routineId: "routine-night-shutdown",
            triggerSource: "manual",
            entrySource: "launcher_hero",
            reasonKey: "manual_fallback"
          }
        }
      }
    };

    const snapshot = getRoutineAnalyticsSnapshot({
      currentGameDateKey: "2026-03-31",
      sessionsById,
      dailyBuildingsByDate,
      floorsById,
      surpriseQuestsById,
      aiSuggestionsById
    });

    expect(snapshot.completedSessionsLast7).toBe(2);
    expect(snapshot.clearRateLast14).toBe(50);
    expect(snapshot.finalizedReviewRateLast14).toBe(100);
    expect(snapshot.totalFloors).toBe(1);
    expect(snapshot.currentMonthFloorCount).toBe(1);
    expect(snapshot.surpriseQuestCompletionRate).toBe(50);
    expect(snapshot.aiSuggestionAcceptanceRate).toBe(100);
    expect(snapshot.fallbackSuggestionResolutionCount).toBe(1);
  });

  it("derives analytics events from source records and migration meta", () => {
    const events = getRoutineAnalyticsEvents({
      sessionsById: {
        "session-1": {
          id: "session-1",
          routineId: "routine-morning-reset",
          dateKey: "2026-03-31",
          startedAt: "2026-03-31T08:00:00.000Z",
          endedAt: "2026-03-31T08:10:00.000Z",
          triggerSource: "manual",
          status: "reviewed",
          resultGrade: "Clear",
          baseScore: 100,
          timeBonus: 0,
          comboBonus: 0,
          clearBonus: 150,
          cleanRunBonus: 0,
          firstSessionBonus: 0,
          focusBonus: 0,
          streakBonus: 0,
          totalScore: 250,
          normalizedScore: 0.55,
          completedStepCount: 1,
          skippedStepCount: 0,
          pausedCount: 0,
          wasGraceApplied: false
        }
      },
      dailyBuildingsByDate: {
        "2026-03-31": {
          dateKey: "2026-03-31",
          sessionIds: ["session-1"],
          floorIds: ["floor-session-1"],
          roofType: "mid",
          ornamentIds: [],
          totalScore: 250,
          successfulSessionCount: 1,
          averageNormalizedScore: 0.55,
          streakSnapshot: {},
          finalizedAt: "2026-03-31T22:00:00.000Z"
        }
      },
      surpriseQuestsById: {
        "quest-1": {
          id: "quest-1",
          dateKey: "2026-03-31",
          title: "물 마시기",
          contextType: "health",
          difficulty: 1,
          rewardType: "score",
          status: "completed",
          completedAt: "2026-03-31T09:00:00.000Z"
        }
      },
      aiSuggestionsById: {
        "ai-1": {
          id: "ai-1",
          type: "duration_tune",
          generatedAt: "2026-03-31T00:00:00.000Z",
          reasoningSummary: "늘려봅시다.",
          confidence: 0.7,
          status: "applied",
          source: "ai",
          resolvedAt: "2026-03-31T10:00:00.000Z",
          payload: {
            kind: "duration_tune",
            routineId: "routine-morning-reset",
            stepId: "step-1",
            stepTitle: "세수",
            currentDurationSec: 300,
            proposedDurationSec: 360,
            deltaSec: 60,
            frictionSignals: ["overtime"]
          }
        }
      },
      migrationMetaBySourceFingerprint: {
        "migration-1": {
          sourceKind: "legacy_backup",
          sourceFingerprint: "migration-1",
          importedAt: "2026-03-31T07:00:00.000Z",
          importedDateCount: 2,
          importedCompletedQuestCount: 4,
          unmappedQuestCount: 1,
          warningCount: 1
        } satisfies RoutineMigrationMeta
      }
    });

    expect(events.map((event) => event.type)).toEqual([
      "day_review_finalized",
      "ai_suggestion_resolved",
      "surprise_quest_completed",
      "session_completed",
      "backup_import_applied"
    ]);
    expect(events[1]?.suggestionSource).toBe("ai");
  });
});
