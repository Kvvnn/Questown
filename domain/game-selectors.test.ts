import { describe, expect, it } from "vitest";
import { createDefaultRoutineSeed, MORNING_ROUTINE_ID, NIGHT_ROUTINE_ID } from "./game-seeds";
import {
  getActiveStepTiming,
  getCurrentStep,
  getLauncherHeroRoutine,
  getLauncherSurpriseQuest,
  getNextScheduledRoutine,
  getNextStepPreview,
  getRoutineStreakSummary,
  getSessionDraftSummary,
  getSessionProgress,
  getStartableRoutines,
  getTodayBuildingPreview
} from "./game-selectors";
import { RoutineSession, SessionRuntime } from "./game-types";

describe("game selectors", () => {
  it("surfaces manual and time startable routines based on the current time window", () => {
    const seed = createDefaultRoutineSeed();
    const morningDate = new Date("2026-03-31T08:30:00+09:00");
    const candidates = getStartableRoutines(seed.routinesById, seed.triggersByRoutineId, morningDate);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.routine.id).toBe(MORNING_ROUTINE_ID);
    expect(candidates[0]?.isTimeWindowActive).toBe(true);
    expect(candidates[0]?.isManualAvailable).toBe(true);

    const nightCandidate = candidates.find((candidate) => candidate.routine.id === NIGHT_ROUTINE_ID);
    expect(nightCandidate?.isTimeWindowActive).toBe(false);
    expect(nightCandidate?.isManualAvailable).toBe(true);
  });

  it("builds a session summary from the active session state", () => {
    const seed = createDefaultRoutineSeed();
    const session: RoutineSession = {
      id: "session-1",
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
    };

    const summary = getSessionDraftSummary({ [session.id]: session }, seed.routinesById, seed.stepsByRoutineId, session.id);

    expect(summary).toEqual({
      sessionId: "session-1",
      routineId: MORNING_ROUTINE_ID,
      routineName: "Morning Reset",
      stepCount: 5,
      status: "active_step",
      triggerSource: "manual",
      startedAt: "2026-03-31T08:30:00.000Z"
    });
  });

  it("picks the launcher hero and next scheduled routine from the current time", () => {
    const seed = createDefaultRoutineSeed();
    const morningDate = new Date("2026-03-31T08:30:00+09:00");

    const hero = getLauncherHeroRoutine(seed.routinesById, seed.triggersByRoutineId, morningDate);
    const nextRoutine = getNextScheduledRoutine(seed.routinesById, seed.triggersByRoutineId, hero?.routine.id, morningDate);

    expect(hero?.routine.id).toBe(MORNING_ROUTINE_ID);
    expect(nextRoutine?.routine.id).toBe(NIGHT_ROUTINE_ID);
    expect(nextRoutine).not.toBeNull();
    expect(new Date(nextRoutine?.scheduledAt as string).getTime()).toBeGreaterThan(morningDate.getTime());
  });

  it("returns stable zero-state launcher aggregates when there is no data yet", () => {
    const seed = createDefaultRoutineSeed();

    expect(getTodayBuildingPreview({}, new Date("2026-03-31T08:30:00+09:00"))).toEqual({
      hasBuilding: false,
      floorCount: 0,
      successfulSessionCount: 0,
      roofType: "none",
      totalScore: 0
    });

    expect(getRoutineStreakSummary({}, seed.routinesById)).toEqual({
      hasData: false,
      topRoutineName: undefined,
      topRoutineStreak: 0,
      currentComboCount: 0
    });

    expect(getLauncherSurpriseQuest({}, new Date("2026-03-31T08:30:00+09:00"))).toEqual({
      hasQuest: false
    });
  });

  it("derives current step, next step, timing, and progress from session runtime", () => {
    const seed = createDefaultRoutineSeed();
    const session: RoutineSession = {
      id: "session-2",
      routineId: MORNING_ROUTINE_ID,
      dateKey: "2026-03-31",
      startedAt: "2026-03-31T08:30:00.000Z",
      triggerSource: "manual",
      status: "paused",
      baseScore: 0,
      timeBonus: 0,
      comboBonus: 0,
      clearBonus: 0,
      focusBonus: 0,
      streakBonus: 0,
      totalScore: 0,
      completedStepCount: 1,
      skippedStepCount: 0,
      pausedCount: 1,
      wasGraceApplied: false
    };
    const runtime: SessionRuntime = {
      sessionId: "session-2",
      currentStepIndex: 1,
      stepStartedAt: "2026-03-31T08:31:00.000Z",
      pausedAt: "2026-03-31T08:33:40.000Z",
      accumulatedPauseMs: 5000,
      currentComboCount: 1,
      graceUsed: false,
      currentStepPauseCount: 1
    };

    const sessionsById = { [session.id]: session };
    const runtimeBySessionId = { [session.id]: runtime };
    const stepResultsBySessionId = {
      [session.id]: [
        {
          id: "step-result-1",
          sessionId: session.id,
          stepId: "step-morning-bed",
          order: 1,
          status: "success" as const,
          startedAt: "2026-03-31T08:30:00.000Z",
          endedAt: "2026-03-31T08:30:55.000Z",
          elapsedSec: 55,
          targetDurationSec: 60,
          overtimeSec: 0,
          pauseCount: 0,
          comboIndexAfterStep: 1,
          scoreEarned: 0
        }
      ]
    };

    const currentStep = getCurrentStep(session.id, sessionsById, runtimeBySessionId, seed.stepsByRoutineId);
    const nextStep = getNextStepPreview(session.id, sessionsById, runtimeBySessionId, seed.stepsByRoutineId);
    const timing = getActiveStepTiming(
      session.id,
      sessionsById,
      runtimeBySessionId,
      seed.stepsByRoutineId,
      new Date("2026-03-31T08:40:00+09:00")
    );
    const progress = getSessionProgress(session.id, sessionsById, seed.stepsByRoutineId, stepResultsBySessionId);

    expect(currentStep?.title).toBe("세수/샤워");
    expect(nextStep?.title).toBe("영양제 먹기");
    expect(timing).toEqual({
      elapsedMs: 155000,
      remainingMs: 565000,
      overtimeMs: 0,
      isOvertime: false,
      targetMs: 720000
    });
    expect(progress).toEqual({
      totalSteps: 5,
      finishedSteps: 1,
      completedSteps: 1,
      skippedSteps: 0,
      progressRatio: 0.2
    });
  });
});
