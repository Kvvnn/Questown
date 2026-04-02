import { addDays } from "./date";
import {
  ResultGrade,
  Routine,
  RoutineSession,
  RoutineStep,
  SessionScoringPayload,
  SessionScoringStepBreakdown,
  SessionStepResult
} from "./game-types";

const STEP_BASE_SCORE = 100;
const SESSION_COMPLETION_BONUS = 150;
const CLEAN_RUN_BONUS = 120;
const FOCUS_BONUS = 80;
const FIRST_SESSION_BONUS = 100;
const STREAK_MILESTONE_BONUS: Record<number, number> = {
  3: 30,
  7: 60,
  14: 100,
  30: 150
};

const isSuccessfulStep = (status: SessionStepResult["status"]) =>
  status === "success" || status === "grace_completed" || status === "late_completed";

export const isClearOrBetterGrade = (grade: ResultGrade | undefined) =>
  grade === "Perfect" || grade === "Great" || grade === "Clear";

const getTimeBonus = (status: SessionStepResult["status"]) => {
  if (status === "success") return 40;
  if (status === "grace_completed") return 20;
  return 0;
};

const getComboBonus = (status: SessionStepResult["status"], comboIndexAfterStep: number) =>
  status === "skipped" ? 0 : Math.max(comboIndexAfterStep - 1, 0) * 25;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const hasAllRequiredStepsCompleted = (
  steps: RoutineStep[],
  stepResultsByStepId: Map<string, SessionStepResult>
) =>
  steps
    .filter((step) => !step.isOptional)
    .every((step) => {
      const result = stepResultsByStepId.get(step.id);
      return !!result && result.status !== "skipped";
    });

const computeGrade = ({
  normalizedScore,
  pausedCount,
  stepResults,
  steps
}: {
  normalizedScore: number;
  pausedCount: number;
  stepResults: SessionStepResult[];
  steps: RoutineStep[];
}): ResultGrade => {
  const stepResultsByStepId = new Map(stepResults.map((result) => [result.stepId, result]));
  const allRequiredStepsCompleted = hasAllRequiredStepsCompleted(steps, stepResultsByStepId);
  const skippedCount = stepResults.filter((result) => result.status === "skipped").length;
  const graceCount = stepResults.filter((result) => result.status === "grace_completed").length;
  const lateCount = stepResults.filter((result) => result.status === "late_completed").length;

  if (
    allRequiredStepsCompleted &&
    skippedCount === 0 &&
    pausedCount === 0 &&
    graceCount === 0 &&
    lateCount === 0 &&
    normalizedScore >= 0.9
  ) {
    return "Perfect";
  }

  if (
    allRequiredStepsCompleted &&
    skippedCount === 0 &&
    pausedCount <= 1 &&
    graceCount + lateCount <= 1 &&
    normalizedScore >= 0.75
  ) {
    return "Great";
  }

  if (allRequiredStepsCompleted && normalizedScore >= 0.5) {
    return "Clear";
  }

  return "Partial";
};

const getPriorRoutineStreak = ({
  routineId,
  currentDateKey,
  sessions
}: {
  routineId: string;
  currentDateKey: string;
  sessions: RoutineSession[];
}) => {
  const successfulDateKeys = new Set(
    sessions
      .filter(
        (session) =>
          session.routineId === routineId &&
          session.dateKey !== currentDateKey &&
          isClearOrBetterGrade(session.resultGrade)
      )
      .map((session) => session.dateKey)
  );

  let streak = 0;
  let cursor = addDays(currentDateKey, -1);

  while (successfulDateKeys.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
};

const hasEarlierSuccessfulSessionSameDay = ({
  currentSession,
  sessions
}: {
  currentSession: RoutineSession;
  sessions: RoutineSession[];
}) => {
  const currentStartedAt = new Date(currentSession.startedAt).getTime();
  if (Number.isNaN(currentStartedAt)) return false;

  return sessions.some((session) => {
    if (session.id === currentSession.id) return false;
    if (session.routineId !== currentSession.routineId) return false;
    if (session.dateKey !== currentSession.dateKey) return false;
    if (!isClearOrBetterGrade(session.resultGrade)) return false;

    const startedAt = new Date(session.startedAt).getTime();
    return !Number.isNaN(startedAt) && startedAt < currentStartedAt;
  });
};

const isFirstSessionOfDay = ({
  currentSession,
  sessions
}: {
  currentSession: RoutineSession;
  sessions: RoutineSession[];
}) => {
  const currentStartedAt = new Date(currentSession.startedAt).getTime();
  if (Number.isNaN(currentStartedAt)) return false;

  return !sessions.some((session) => {
    if (session.id === currentSession.id) return false;
    if (session.dateKey !== currentSession.dateKey) return false;

    const startedAt = new Date(session.startedAt).getTime();
    return !Number.isNaN(startedAt) && startedAt < currentStartedAt;
  });
};

export const scoreRoutineSession = ({
  routine,
  steps,
  session,
  stepResults,
  allSessions
}: {
  routine: Routine;
  steps: RoutineStep[];
  session: RoutineSession;
  stepResults: SessionStepResult[];
  allSessions: RoutineSession[];
}): SessionScoringPayload => {
  const orderedStepResults = [...stepResults].sort((left, right) => left.order - right.order);

  const stepBreakdowns: SessionScoringStepBreakdown[] = orderedStepResults.map((stepResult) => {
    const baseScore = isSuccessfulStep(stepResult.status) ? STEP_BASE_SCORE : 0;
    const timeBonus = getTimeBonus(stepResult.status);
    const comboBonus = getComboBonus(stepResult.status, stepResult.comboIndexAfterStep);

    return {
      stepResultId: stepResult.id,
      baseScore,
      timeBonus,
      comboBonus,
      scoreEarned: baseScore + timeBonus + comboBonus
    };
  });

  const baseScore = stepBreakdowns.reduce((sum, breakdown) => sum + breakdown.baseScore, 0);
  const timeBonus = stepBreakdowns.reduce((sum, breakdown) => sum + breakdown.timeBonus, 0);
  const comboBonus = stepBreakdowns.reduce((sum, breakdown) => sum + breakdown.comboBonus, 0);
  const clearBonus = session.status === "completed" ? SESSION_COMPLETION_BONUS : 0;
  const cleanRunBonus = session.skippedStepCount === 0 ? CLEAN_RUN_BONUS : 0;
  const focusBonus = session.pausedCount === 0 ? FOCUS_BONUS : 0;
  const firstSessionBonus = isFirstSessionOfDay({ currentSession: session, sessions: allSessions }) ? FIRST_SESSION_BONUS : 0;

  const coreTotalScore = baseScore + timeBonus + comboBonus + clearBonus + cleanRunBonus + focusBonus;
  const stepCount = steps.length;
  const maxExpectedComboBonus = Array.from({ length: stepCount }, (_, index) => Math.max(index, 0) * 25).reduce(
    (sum, value) => sum + value,
    0
  );
  const maxExpectedScore =
    stepCount * STEP_BASE_SCORE + stepCount * 40 + maxExpectedComboBonus + SESSION_COMPLETION_BONUS + CLEAN_RUN_BONUS + FOCUS_BONUS;
  const normalizedScore = maxExpectedScore === 0 ? 0 : clamp01(coreTotalScore / maxExpectedScore);
  const provisionalGrade = computeGrade({
    normalizedScore,
    pausedCount: session.pausedCount,
    stepResults: orderedStepResults,
    steps
  });

  const priorRoutineStreak = getPriorRoutineStreak({
    routineId: routine.id,
    currentDateKey: session.dateKey,
    sessions: allSessions
  });
  const streakLengthAfterSession = isClearOrBetterGrade(provisionalGrade) ? priorRoutineStreak + 1 : 0;
  const streakBonus =
    isClearOrBetterGrade(provisionalGrade) && !hasEarlierSuccessfulSessionSameDay({ currentSession: session, sessions: allSessions })
      ? STREAK_MILESTONE_BONUS[streakLengthAfterSession] ?? 0
      : 0;

  return {
    baseScore,
    timeBonus,
    comboBonus,
    clearBonus,
    cleanRunBonus,
    firstSessionBonus,
    focusBonus,
    streakBonus,
    totalScore: coreTotalScore + firstSessionBonus + streakBonus,
    coreTotalScore,
    maxExpectedScore,
    normalizedScore,
    resultGrade: provisionalGrade,
    provisionalGrade,
    streakLengthAfterSession,
    stepBreakdowns
  };
};
