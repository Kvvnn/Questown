import { describe, expect, it } from "vitest";
import { MORNING_ROUTINE_ID, createDefaultRoutineSeed } from "./game-seeds";
import { scoreRoutineSession } from "./session-scoring";
import { RoutineSession, SessionStepResult, StepResultStatus } from "./game-types";

const buildSession = (overrides: Partial<RoutineSession> = {}): RoutineSession => ({
  id: "session-score-1",
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
  cleanRunBonus: 0,
  firstSessionBonus: 0,
  focusBonus: 0,
  streakBonus: 0,
  totalScore: 0,
  completedStepCount: 0,
  skippedStepCount: 0,
  pausedCount: 0,
  wasGraceApplied: false,
  ...overrides
});

const buildStepResults = (stepIds: string[], statuses: StepResultStatus[]): SessionStepResult[] => {
  let combo = 0;

  return statuses.map((status, index) => {
    if (status === "success" || status === "grace_completed") {
      combo += 1;
    } else if (status === "skipped") {
      combo = 0;
    }

    const order = index + 1;

    return {
      id: `result-${order}`,
      sessionId: "session-score-1",
      stepId: stepIds[index] ?? `step-${order}`,
      order,
      status,
      startedAt: `2026-03-31T08:${String(30 + index).padStart(2, "0")}:00.000Z`,
      endedAt: `2026-03-31T08:${String(30 + index).padStart(2, "0")}:45.000Z`,
      elapsedSec: 45,
      targetDurationSec: 60,
      overtimeSec: status === "late_completed" ? 30 : 0,
      pauseCount: 0,
      comboIndexAfterStep: combo,
      scoreEarned: 0
    };
  });
};

describe("session scoring", () => {
  const seed = createDefaultRoutineSeed();
  const routine = seed.routinesById[MORNING_ROUTINE_ID];
  const steps = seed.stepsByRoutineId[MORNING_ROUTINE_ID];
  const stepIds = steps.map((step) => step.id);

  it("scores all-success runs as Perfect with expected max score", () => {
    const session = buildSession({ completedStepCount: 5 });
    const stepResults = buildStepResults(stepIds, ["success", "success", "success", "success", "success"]);

    const scoring = scoreRoutineSession({
      routine,
      steps,
      session,
      stepResults,
      allSessions: [session]
    });

    expect(scoring.resultGrade).toBe("Perfect");
    expect(scoring.maxExpectedScore).toBe(1300);
    expect(scoring.normalizedScore).toBe(1);
    expect(scoring.totalScore).toBe(1400);
  });

  it("keeps a single grace-completed run in Great", () => {
    const session = buildSession({ completedStepCount: 5, wasGraceApplied: true });
    const stepResults = buildStepResults(stepIds, ["success", "grace_completed", "success", "success", "success"]);

    const scoring = scoreRoutineSession({
      routine,
      steps,
      session,
      stepResults,
      allSessions: [session]
    });

    expect(scoring.resultGrade).toBe("Great");
    expect(scoring.timeBonus).toBe(180);
    expect(scoring.comboBonus).toBe(250);
  });

  it("treats a late-completed run as Great but not Perfect", () => {
    const session = buildSession({ completedStepCount: 5 });
    const stepResults = buildStepResults(stepIds, ["success", "late_completed", "success", "success", "success"]);

    const scoring = scoreRoutineSession({
      routine,
      steps,
      session,
      stepResults,
      allSessions: [session]
    });

    expect(scoring.resultGrade).toBe("Great");
    expect(scoring.normalizedScore).toBeCloseTo(1160 / 1300, 5);
    expect(scoring.comboBonus).toBe(150);
  });

  it("drops required-step skips to Partial", () => {
    const session = buildSession({ completedStepCount: 4, skippedStepCount: 1 });
    const stepResults = buildStepResults(stepIds, ["success", "success", "skipped", "success", "success"]);

    const scoring = scoreRoutineSession({
      routine,
      steps,
      session,
      stepResults,
      allSessions: [session]
    });

    expect(scoring.resultGrade).toBe("Partial");
  });

  it("does not let optional-step skips block Clear", () => {
    const session = buildSession({ completedStepCount: 4, skippedStepCount: 1 });
    const optionalSteps = steps.map((step, index) => (index === 4 ? { ...step, isOptional: true } : step));
    const stepResults = buildStepResults(stepIds, ["success", "success", "success", "success", "skipped"]);

    const scoring = scoreRoutineSession({
      routine,
      steps: optionalSteps,
      session,
      stepResults,
      allSessions: [session]
    });

    expect(scoring.resultGrade).toBe("Clear");
  });

  it("excludes first-session and streak bonuses from normalized score while still adding them to total score", () => {
    const currentSession = buildSession({ completedStepCount: 5 });
    const previousDayOne = buildSession({
      id: "session-prev-1",
      dateKey: "2026-03-30",
      startedAt: "2026-03-30T08:30:00.000Z",
      endedAt: "2026-03-30T08:50:00.000Z",
      resultGrade: "Clear"
    });
    const previousDayTwo = buildSession({
      id: "session-prev-2",
      dateKey: "2026-03-29",
      startedAt: "2026-03-29T08:30:00.000Z",
      endedAt: "2026-03-29T08:50:00.000Z",
      resultGrade: "Great"
    });
    const stepResults = buildStepResults(stepIds, ["success", "success", "success", "success", "success"]);

    const scoring = scoreRoutineSession({
      routine,
      steps,
      session: currentSession,
      stepResults,
      allSessions: [previousDayTwo, previousDayOne, currentSession]
    });

    expect(scoring.normalizedScore).toBe(1);
    expect(scoring.firstSessionBonus).toBe(100);
    expect(scoring.streakBonus).toBe(30);
    expect(scoring.streakLengthAfterSession).toBe(3);
    expect(scoring.totalScore).toBe(1430);
  });
});
