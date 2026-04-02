import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { MORNING_ROUTINE_ID, createDefaultRoutineSeed } from "../domain/game-seeds";
import { RoutineLauncherContent, RoutineLauncherContentProps } from "./routine-launcher";

const noop = () => {};

const buildProps = (): RoutineLauncherContentProps => {
  const seed = createDefaultRoutineSeed();

  return {
    activeView: "launcher",
    selectedRoutineId: MORNING_ROUTINE_ID,
    activeSessionId: undefined,
    routinesById: seed.routinesById,
    stepsByRoutineId: seed.stepsByRoutineId,
    triggersByRoutineId: seed.triggersByRoutineId,
    sessionsById: {},
    sessionRuntimeBySessionId: {},
    stepResultsBySessionId: {},
    dailyBuildingsByDate: {},
    floorsById: {},
    dismissedRemainingRoutineIdsByDate: {},
    surpriseQuestsById: {},
    reviewSummariesById: {},
    openRoutinePrelaunch: noop,
    openTodayReview: noop,
    returnToLauncher: noop,
    openActiveSession: noop,
    startRoutineSession: vi.fn(() => ({ ok: true, sessionId: "session-phase2" })),
    pauseActiveSession: vi.fn(() => ({ ok: true })),
    resumeActiveSession: vi.fn(() => ({ ok: true })),
    completeCurrentStep: vi.fn(() => ({ ok: true })),
    skipCurrentStep: vi.fn(() => ({ ok: true })),
    dismissCompletedSession: noop,
    dismissRemainingRoutineForToday: noop,
    confirmDayReview: vi.fn(() => ({ ok: true })),
    closeDayReview: noop,
    setActiveView: noop,
    now: new Date("2026-03-31T08:30:00+09:00")
  };
};

describe("routine launcher", () => {
  it("renders launcher cards without exposing the dev shell", () => {
    const markup = renderToStaticMarkup(<RoutineLauncherContent {...buildProps()} />);

    expect(markup).toContain("지금 시작 가능한 루틴");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("Night Shutdown");
    expect(markup).toContain("오늘 building 진행");
    expect(markup).toContain("surprise quest");
    expect(markup).not.toContain("Routine Registry");
  });

  it("renders the prelaunch screen with step preview", () => {
    const props = buildProps();
    props.activeView = "prelaunch";

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Prelaunch");
    expect(markup).toContain("침구 정리");
    expect(markup).toContain("세션 열기");
  });

  it("renders the session runtime once an active session exists", () => {
    const props = buildProps();
    props.activeView = "session";
    props.activeSessionId = "session-phase2";
    props.sessionsById = {
      "session-phase2": {
        id: "session-phase2",
        routineId: MORNING_ROUTINE_ID,
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T08:30:00.000Z",
        triggerSource: "manual",
        status: "active_step",
        baseScore: 0,
        timeBonus: 0,
        comboBonus: 0,
        clearBonus: 0,
        cleanRunBonus: 0,
        firstSessionBonus: 0,
        focusBonus: 0,
        streakBonus: 0,
        totalScore: 0,
        completedStepCount: 0,
        skippedStepCount: 0,
        pausedCount: 0,
        wasGraceApplied: false
      }
    };
    props.sessionRuntimeBySessionId = {
      "session-phase2": {
        sessionId: "session-phase2",
        currentStepIndex: 0,
        stepStartedAt: "2026-03-31T08:30:00.000Z",
        accumulatedPauseMs: 0,
        currentComboCount: 0,
        graceUsed: false,
        currentStepPauseCount: 0
      }
    };
    props.stepResultsBySessionId = { "session-phase2": [] };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Routine Session");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("침구 정리");
    expect(markup).toContain("완료");
    expect(markup).toContain("길게 눌러 skip");
  });

  it("renders the result loop when the session is finished", () => {
    const props = buildProps();
    props.activeView = "session";
    props.activeSessionId = "session-phase3-complete";
    props.sessionsById = {
      "session-phase3-complete": {
        id: "session-phase3-complete",
        routineId: MORNING_ROUTINE_ID,
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T08:30:00.000Z",
        endedAt: "2026-03-31T08:59:00.000Z",
        triggerSource: "manual",
        status: "completed",
        resultGrade: "Clear",
        baseScore: 400,
        timeBonus: 120,
        comboBonus: 75,
        clearBonus: 150,
        cleanRunBonus: 0,
        firstSessionBonus: 100,
        focusBonus: 0,
        streakBonus: 0,
        totalScore: 845,
        normalizedScore: 0.65,
        completedStepCount: 4,
        skippedStepCount: 1,
        pausedCount: 1,
        wasGraceApplied: true
      }
    };
    props.floorsById = {
      "floor-session-phase3-complete": {
        id: "floor-session-phase3-complete",
        sessionId: "session-phase3-complete",
        dateKey: "2026-03-31",
        routineCategory: "morning_reset",
        visualStyleKey: "floor:sunrise-home:standard",
        qualityTier: "standard",
        ornamentIds: []
      }
    };
    props.stepResultsBySessionId = {
      "session-phase3-complete": [
        {
          id: "result-1",
          sessionId: "session-phase3-complete",
          stepId: "step-morning-bed",
          order: 1,
          status: "success",
          startedAt: "2026-03-31T08:30:00.000Z",
          endedAt: "2026-03-31T08:31:00.000Z",
          elapsedSec: 60,
          targetDurationSec: 60,
          overtimeSec: 0,
          pauseCount: 0,
          comboIndexAfterStep: 1,
          scoreEarned: 0
        }
      ]
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Result Loop");
    expect(markup).toContain("Clear");
    expect(markup).toContain("score 845");
    expect(markup).toContain("normalized 0.65");
    expect(markup).toContain("floor:sunrise-home:standard");
    expect(markup).toContain("완주했습니다. 다음엔 더 매끄럽게 줄일 수 있어요.");
    expect(markup).toContain("이번 세션 ornament 없음");
    expect(markup).toContain("즉시 닫기");
  });

  it("renders launcher building data when a daily building exists", () => {
    const props = buildProps();
    props.dailyBuildingsByDate = {
      "2026-03-31": {
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
      }
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("floor 1");
    expect(markup).toContain("score 980");
    expect(markup).toContain("streak 3");
    expect(markup).toContain("오늘 리뷰");
  });

  it("renders the review gate with remaining routines", () => {
    const props = buildProps();
    props.activeView = "review_gate";
    props.sessionsById = {
      "session-night": {
        id: "session-night",
        routineId: "routine-night-shutdown",
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T21:00:00.000+09:00",
        endedAt: "2026-03-31T21:20:00.000+09:00",
        triggerSource: "time",
        status: "reviewed",
        resultGrade: "Great",
        baseScore: 500,
        timeBonus: 200,
        comboBonus: 120,
        clearBonus: 150,
        cleanRunBonus: 120,
        firstSessionBonus: 0,
        focusBonus: 80,
        streakBonus: 0,
        totalScore: 1070,
        normalizedScore: 0.9,
        completedStepCount: 5,
        skippedStepCount: 0,
        pausedCount: 0,
        wasGraceApplied: false
      }
    };
    props.now = new Date("2026-03-31T21:30:00+09:00");

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Review Gate");
    expect(markup).toContain("남은 세션을 수행하면 지붕을 더 높일 수 있습니다.");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("세션 열기");
    expect(markup).toContain("지금 리뷰 보기");
  });

  it("renders the day review screen with building summary", () => {
    const seed = createDefaultRoutineSeed();
    const props = buildProps();
    props.activeView = "day_review";
    props.dailyBuildingsByDate = {
      "2026-03-31": {
        dateKey: "2026-03-31",
        sessionIds: ["session-1"],
        floorIds: ["floor-session-1"],
        roofType: "high",
        ornamentIds: [],
        totalScore: 980,
        successfulSessionCount: 1,
        averageNormalizedScore: 0.91,
        streakSnapshot: {
          [MORNING_ROUTINE_ID]: 3
        }
      }
    };
    props.floorsById = {
      "floor-session-1": {
        id: "floor-session-1",
        sessionId: "session-1",
        dateKey: "2026-03-31",
        routineCategory: "morning_reset",
        visualStyleKey: "floor:sunrise-home:signature",
        qualityTier: "signature",
        ornamentIds: []
      }
    };
    props.sessionsById = {
      "session-1": {
        id: "session-1",
        routineId: MORNING_ROUTINE_ID,
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T08:30:00.000+09:00",
        endedAt: "2026-03-31T08:50:00.000+09:00",
        triggerSource: "manual",
        status: "reviewed",
        resultGrade: "Perfect",
        baseScore: 500,
        timeBonus: 200,
        comboBonus: 150,
        clearBonus: 150,
        cleanRunBonus: 120,
        firstSessionBonus: 100,
        focusBonus: 80,
        streakBonus: 30,
        totalScore: 1180,
        normalizedScore: 0.98,
        completedStepCount: 5,
        skippedStepCount: 0,
        pausedCount: 0,
        wasGraceApplied: false
      }
    };
    props.stepResultsBySessionId = {
      "session-1": seed.stepsByRoutineId[MORNING_ROUTINE_ID].map((step, index) => ({
        id: `step-result-${index + 1}`,
        sessionId: "session-1",
        stepId: step.id,
        order: step.order,
        status: "success" as const,
        startedAt: "2026-03-31T08:30:00.000+09:00",
        endedAt: "2026-03-31T08:31:00.000+09:00",
        elapsedSec: step.recommendedDurationSec,
        targetDurationSec: step.recommendedDurationSec,
        overtimeSec: 0,
        pauseCount: 0,
        comboIndexAfterStep: index + 1,
        scoreEarned: 140 + index * 25
      }))
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Day Review");
    expect(markup).toContain("오늘 정산을 확인하고 지붕을 닫습니다.");
    expect(markup).toContain("Today Building");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("오늘 정산 확정");
    expect(markup).toContain("Tomorrow Hint");
  });
});
