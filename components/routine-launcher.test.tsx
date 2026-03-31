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
    surpriseQuestsById: {},
    openRoutinePrelaunch: noop,
    returnToLauncher: noop,
    openActiveSession: noop,
    startRoutineSession: vi.fn(() => ({ ok: true, sessionId: "session-phase2" })),
    pauseActiveSession: vi.fn(() => ({ ok: true })),
    resumeActiveSession: vi.fn(() => ({ ok: true })),
    completeCurrentStep: vi.fn(() => ({ ok: true })),
    skipCurrentStep: vi.fn(() => ({ ok: true })),
    dismissCompletedSession: noop,
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

  it("renders the completed placeholder when the session is finished", () => {
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
        baseScore: 0,
        timeBonus: 0,
        comboBonus: 0,
        clearBonus: 0,
        focusBonus: 0,
        streakBonus: 0,
        totalScore: 0,
        completedStepCount: 4,
        skippedStepCount: 1,
        pausedCount: 1,
        wasGraceApplied: true
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

    expect(markup).toContain("세션 완료");
    expect(markup).toContain("Recorded Results");
    expect(markup).toContain("Phase 4에서 점수와 등급이 들어옵니다.");
    expect(markup).toContain("런처로 돌아가기");
  });
});
