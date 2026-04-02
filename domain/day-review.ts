import { getNextScheduledRoutine } from "./game-selectors";
import { getGameDayWindow, gameDateKeyToStartDate } from "./game-day";
import { isClearOrBetterGrade } from "./session-scoring";
import { DailyBuilding, ReviewSummary, RoofType, Routine, RoutineSession, RoutineStep, RoutineTrigger, SessionStepResult } from "./game-types";

const unique = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim().length > 0)));

const getSuccessfulSessionsForDate = (sessionsById: Record<string, RoutineSession>, dateKey: string) =>
  Object.values(sessionsById)
    .filter((session) => session.dateKey === dateKey && isClearOrBetterGrade(session.resultGrade))
    .sort((left, right) => (left.endedAt ?? left.startedAt).localeCompare(right.endedAt ?? right.startedAt, "en"));

const getPartialSessionsForDate = (sessionsById: Record<string, RoutineSession>, dateKey: string) =>
  Object.values(sessionsById).filter((session) => session.dateKey === dateKey && session.resultGrade === "Partial");

const hasRequiredStepSkip = ({
  session,
  stepResultsBySessionId,
  stepsByRoutineId
}: {
  session: RoutineSession;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
}) => {
  const optionalStepIds = new Set((stepsByRoutineId[session.routineId] ?? []).filter((step) => step.isOptional).map((step) => step.id));

  return (stepResultsBySessionId[session.id] ?? []).some((result) => result.status === "skipped" && !optionalStepIds.has(result.stepId));
};

const roofHeadline: Record<RoofType, string> = {
  none: "지붕을 닫기 전이에요.",
  low: "기초 지붕을 얹었습니다.",
  mid: "안정적인 지붕을 완성했어요.",
  high: "오늘 흐름이 단단하게 닫혔어요.",
  gold: "완벽한 지붕으로 하루를 마감했어요."
};

const formatTomorrowHint = ({
  dateKey,
  routinesById,
  triggersByRoutineId
}: {
  dateKey: string;
  routinesById: Record<string, Routine>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
}) => {
  const currentGameDateStart = gameDateKeyToStartDate(dateKey);
  const currentGameWindow = getGameDayWindow(new Date(currentGameDateStart.getTime() + 1));
  const nextScheduled = getNextScheduledRoutine(
    routinesById,
    triggersByRoutineId,
    undefined,
    new Date(currentGameWindow.endAt.getTime() - 1),
    2
  );

  if (!nextScheduled) return [];

  return [`다음 게임 날짜 첫 추천은 ${nextScheduled.routine.name}입니다.`];
};

export const computeDailyRoofType = ({
  successfulSessions,
  stepResultsBySessionId,
  stepsByRoutineId
}: {
  successfulSessions: RoutineSession[];
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
}): RoofType => {
  if (successfulSessions.length === 0) return "none";

  const averageNormalizedScore =
    successfulSessions.reduce((sum, session) => sum + (session.normalizedScore ?? 0), 0) / successfulSessions.length;

  const hasAnyRequiredSkip = successfulSessions.some((session) =>
    hasRequiredStepSkip({
      session,
      stepResultsBySessionId,
      stepsByRoutineId
    })
  );

  if (averageNormalizedScore >= 0.95 && successfulSessions.length >= 2 && !hasAnyRequiredSkip) {
    return "gold";
  }
  if (averageNormalizedScore >= 0.8) return "high";
  if (averageNormalizedScore >= 0.6) return "mid";
  return "low";
};

export const buildFallbackReviewSummary = ({
  dateKey,
  building,
  sessionsById,
  routinesById,
  stepResultsBySessionId,
  stepsByRoutineId,
  triggersByRoutineId,
  dismissedRemainingRoutineIds,
  now = new Date()
}: {
  dateKey: string;
  building: DailyBuilding;
  sessionsById: Record<string, RoutineSession>;
  routinesById: Record<string, Routine>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  dismissedRemainingRoutineIds: string[];
  now?: Date;
}): ReviewSummary => {
  const successfulSessions = getSuccessfulSessionsForDate(sessionsById, dateKey);
  const partialSessions = getPartialSessionsForDate(sessionsById, dateKey);
  const roofType = computeDailyRoofType({
    successfulSessions,
    stepResultsBySessionId,
    stepsByRoutineId
  });

  const stableRoutines = unique(successfulSessions.map((session) => routinesById[session.routineId]?.name ?? session.routineId));
  const frictionPoints = unique([
    ...dismissedRemainingRoutineIds.map((routineId) => `${routinesById[routineId]?.name ?? routineId} 보류`),
    ...partialSessions.map((session) => `${routinesById[session.routineId]?.name ?? session.routineId} 미완료`)
  ]);

  const totalPausedCount = successfulSessions.reduce((sum, session) => sum + session.pausedCount, 0);
  const tomorrowHints = formatTomorrowHint({
    dateKey,
    routinesById,
    triggersByRoutineId
  });

  return {
    id: `review-${dateKey}`,
    dateKey,
    generatedAt: now.toISOString(),
    headline: roofHeadline[roofType],
    body: `성공 세션 ${building.successfulSessionCount}개, 총점 ${building.totalScore}, pause ${totalPausedCount}회로 오늘 흐름을 정리했습니다.`,
    stableRoutines,
    frictionPoints,
    tomorrowHints,
    source: "fallback"
  };
};

export const finalizeDayReview = ({
  dateKey,
  building,
  sessionsById,
  routinesById,
  stepResultsBySessionId,
  stepsByRoutineId,
  triggersByRoutineId,
  dismissedRemainingRoutineIds,
  now = new Date()
}: {
  dateKey: string;
  building: DailyBuilding;
  sessionsById: Record<string, RoutineSession>;
  routinesById: Record<string, Routine>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  dismissedRemainingRoutineIds: string[];
  now?: Date;
}) => {
  const successfulSessions = getSuccessfulSessionsForDate(sessionsById, dateKey);
  const roofType = computeDailyRoofType({
    successfulSessions,
    stepResultsBySessionId,
    stepsByRoutineId
  });
  const reviewSummary = buildFallbackReviewSummary({
    dateKey,
    building,
    sessionsById,
    routinesById,
    stepResultsBySessionId,
    stepsByRoutineId,
    triggersByRoutineId,
    dismissedRemainingRoutineIds,
    now
  });

  return {
    building: {
      ...building,
      roofType,
      reviewSummaryId: reviewSummary.id,
      finalizedAt: now.toISOString()
    },
    reviewSummary
  };
};
