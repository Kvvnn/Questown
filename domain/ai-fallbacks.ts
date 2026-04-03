import {
  AiSuggestion,
  AiSuggestionPayload,
  DurationTuneSuggestionPayload,
  ReviewSummary,
  RoutineSession,
  SurpriseQuest
} from "./game-types";
import {
  AiSuggestionResponseData,
  AiSuggestionRouteRequest,
  DurationTuneSuggestionRequest,
  DurationTuneSuggestionResponseData,
  LauncherSuggestionRequest,
  LauncherSuggestionResponseData,
  ReviewSuggestionRequest,
  ReviewSuggestionResponseData
} from "./ai-contracts";
import { buildFallbackReviewSummary } from "./day-review";
import { getRoutineStreakSummary } from "./game-selectors";
import { getGameDayWindow, toGameDateKey } from "./game-day";
import { createFixedOffsetTimeContext, getLocalMinuteOfDay } from "./local-time";
import {
  buildDurationTuneSuggestionId,
  buildReviewCommentarySuggestionId,
  buildRoutineRecommendationSuggestionId,
  buildSurpriseQuestSuggestionId
} from "./ai-suggestion-selectors";
import { getTriggerEvaluatorResult } from "./routine-trigger-evaluator";

const unique = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim().length > 0)));

const clampConfidence = (value: number) => Math.max(0.05, Math.min(0.98, Number(value.toFixed(2))));

const hashString = (value: string) =>
  Array.from(value).reduce((sum, character) => sum + character.charCodeAt(0), 0);

const roundToNearestThirty = (value: number) => Math.max(30, Math.round(value / 30) * 30);

const getRequestTimeContext = (request: AiSuggestionRouteRequest) => createFixedOffsetTimeContext(request.localTimeOffsetMinutes);

const buildSuggestion = <TPayload extends AiSuggestionPayload>({
  id,
  type,
  targetDateKey,
  targetRoutineId,
  targetSessionId,
  generatedAt,
  reasoningSummary,
  confidence,
  expiresAt,
  payload
}: {
  id: string;
  type: AiSuggestion["type"];
  targetDateKey?: string;
  targetRoutineId?: string;
  targetSessionId?: string;
  generatedAt: string;
  reasoningSummary: string;
  confidence: number;
  expiresAt?: string;
  payload: TPayload;
}): AiSuggestion => ({
  id,
  type,
  targetDateKey,
  targetRoutineId,
  targetSessionId,
  generatedAt,
  reasoningSummary,
  confidence: clampConfidence(confidence),
  status: "pending",
  source: "fallback",
  expiresAt,
  payload
});

const getExistingQuestForDate = (surpriseQuestsById: Record<string, SurpriseQuest>, dateKey: string) =>
  Object.values(surpriseQuestsById).find((quest) => quest.dateKey === dateKey && quest.status !== "expired");

const MORNING_QUESTS = [
  { title: "출발 전 물 한 컵 챙기기", contextType: "health", difficulty: 1, rewardType: "score" },
  { title: "현관 앞 30초 정리 미션", contextType: "home", difficulty: 1, rewardType: "ornament" },
  { title: "가방 안 핵심 물건 한 번 더 체크", contextType: "generic", difficulty: 1, rewardType: "theme_token" }
] as const;

const NIGHT_QUESTS = [
  { title: "취침 전에 책상 위 한 칸만 비우기", contextType: "night", difficulty: 2, rewardType: "ornament" },
  { title: "내일 첫 준비물 한 개만 문 앞에 두기", contextType: "night", difficulty: 1, rewardType: "score" },
  { title: "잠들기 전 물컵 리필 완료", contextType: "health", difficulty: 1, rewardType: "theme_token" }
] as const;

const GENERIC_QUESTS = [
  { title: "지금 자리에서 1분 리셋", contextType: "generic", difficulty: 1, rewardType: "score" },
  { title: "방해 요소 한 개만 치우기", contextType: "work", difficulty: 2, rewardType: "ornament" },
  { title: "호흡 5번으로 페이스 맞추기", contextType: "health", difficulty: 1, rewardType: "theme_token" }
] as const;

const getQuestCatalog = (now: Date, localTimeOffsetMinutes: number, hasBuildingToday: boolean) => {
  const hour = Math.floor(getLocalMinuteOfDay(now, createFixedOffsetTimeContext(localTimeOffsetMinutes)) / 60);
  const filterByReward = <T extends { rewardType: string }>(catalog: readonly T[]) =>
    catalog.filter((item) => hasBuildingToday || item.rewardType !== "ornament");

  if (hour >= 5 && hour < 12) return filterByReward(MORNING_QUESTS);
  if (hour >= 20 || hour < 5) return filterByReward(NIGHT_QUESTS);
  return filterByReward(GENERIC_QUESTS);
};

const getTodayBuilding = (request: LauncherSuggestionRequest) => {
  const now = new Date(request.nowIso);
  const timeContext = getRequestTimeContext(request);
  const dateKey = toGameDateKey(now, timeContext);
  return request.dailyBuildingsByDate[dateKey];
};

const buildFallbackRoutineSuggestion = (request: LauncherSuggestionRequest): AiSuggestion | null => {
  const now = new Date(request.nowIso);
  const timeContext = getRequestTimeContext(request);
  const dateKey = toGameDateKey(now, timeContext);
  const evaluation = getTriggerEvaluatorResult({
    routinesById: request.routinesById,
    triggersByRoutineId: request.triggersByRoutineId,
    sessionsById: request.sessionsById,
    activeSessionId: request.activeSessionId,
    now,
    timeContext
  });
  const recommendation = evaluation.primaryRecommendation;
  if (!recommendation) return null;

  const todaySessions = Object.values(request.sessionsById).filter((session) => session.dateKey === dateKey);
  const startedToday = todaySessions.some((session) => session.routineId === recommendation.routine.id);
  const streakSummary = getRoutineStreakSummary(request.dailyBuildingsByDate, request.routinesById);
  const todayBuilding = request.dailyBuildingsByDate[dateKey];
  const buildingPreview = {
    hasBuilding: Boolean(todayBuilding && todayBuilding.floorIds.length > 0),
    floorCount: todayBuilding?.floorIds.length ?? 0,
    totalScore: todayBuilding?.totalScore ?? 0
  };

  const directorNote =
    recommendation.launchContext.reasonKey === "time_window_active"
      ? `${recommendation.routine.name} 시간 창이 열려 있어서 바로 붙이기 좋습니다.`
      : `${recommendation.routine.name}로 오늘 흐름을 먼저 잡아 두는 편이 안정적입니다.`;

  const reasoningPieces = [
    recommendation.launchContext.reasonKey === "time_window_active"
      ? "현재 시간 trigger 창이 이미 열려 있습니다."
      : "지금은 수동 시작 후보 중 가장 부담이 낮은 루틴입니다.",
    startedToday ? "오늘 이미 손댄 루틴이라 다시 이어붙이기 쉽습니다." : "오늘 아직 시작하지 않아 첫 페이스를 만들기 좋습니다.",
    streakSummary.hasData && streakSummary.topRoutineName === recommendation.routine.name
      ? `${recommendation.routine.name} streak ${streakSummary.topRoutineStreak}를 계속 이어갈 수 있습니다.`
      : "",
    buildingPreview.hasBuilding
      ? `현재 building은 floor ${buildingPreview.floorCount}, score ${buildingPreview.totalScore} 상태라 이 루틴을 더하면 리듬이 단단해집니다.`
      : "오늘 building이 비어 있어 첫 floor를 세우기 좋은 타이밍입니다."
  ];
  const reasoningSummary = unique(reasoningPieces).join(" ");

  return buildSuggestion({
    id: buildRoutineRecommendationSuggestionId(dateKey, recommendation.routine.id),
    type: "routine_recommendation",
    targetDateKey: dateKey,
    targetRoutineId: recommendation.routine.id,
    generatedAt: now.toISOString(),
    reasoningSummary,
    confidence:
      recommendation.launchContext.reasonKey === "time_window_active"
        ? 0.82 + (startedToday ? -0.06 : 0.04)
        : 0.64 + (startedToday ? 0.06 : 0),
    payload: {
      kind: "routine_recommendation",
      routineId: recommendation.routine.id,
      launchContext: recommendation.launchContext,
      directorNote
    }
  });
};

const buildFallbackSurpriseQuestSuggestion = (request: LauncherSuggestionRequest): AiSuggestion | null => {
  const now = new Date(request.nowIso);
  const timeContext = getRequestTimeContext(request);
  const dateKey = toGameDateKey(now, timeContext);
  if (getExistingQuestForDate(request.surpriseQuestsById, dateKey)) return null;

  const catalog = getQuestCatalog(now, request.localTimeOffsetMinutes, Boolean(getTodayBuilding(request)?.floorIds.length));
  if (catalog.length === 0) return null;
  const template = catalog[hashString(dateKey) % catalog.length];
  const suggestionId = buildSurpriseQuestSuggestionId(dateKey);
  const expiresAt = getGameDayWindow(now, timeContext).endAt.toISOString();
  const quest: SurpriseQuest = {
    id: `surprise-${dateKey}`,
    dateKey,
    title: template.title,
    contextType: template.contextType,
    difficulty: template.difficulty,
    rewardType: template.rewardType,
    status: "proposed",
    sourceSuggestionId: suggestionId,
    expiresAt
  };

  return buildSuggestion({
    id: suggestionId,
    type: "surprise_quest",
    targetDateKey: dateKey,
    generatedAt: now.toISOString(),
    reasoningSummary: "core routine을 막지 않도록 지금 시간대에 맞는 짧은 사이드 퀘스트 한 개만 surfaced 합니다.",
    confidence: 0.61,
    expiresAt,
    payload: {
      kind: "surprise_quest",
      questId: quest.id,
      quest
    }
  });
};

const getComparableTimestamp = (session: RoutineSession) => session.endedAt ?? session.startedAt;

const buildFallbackDurationTuneSuggestion = (request: DurationTuneSuggestionRequest): AiSuggestion | null => {
  const now = new Date(request.nowIso);
  const session = request.sessionsById[request.sessionId];
  if (!session) return null;

  const steps = request.stepsByRoutineId[session.routineId] ?? [];
  if (steps.length === 0) return null;

  const recentSessions = Object.values(request.sessionsById)
    .filter(
      (candidate) =>
        candidate.routineId === session.routineId &&
        candidate.endedAt &&
        (candidate.status === "completed" || candidate.status === "reviewed")
    )
    .sort((left, right) => getComparableTimestamp(right).localeCompare(getComparableTimestamp(left), "en"))
    .slice(0, 3);

  if (recentSessions.length === 0) return null;

  const frictionByStepId = new Map<
    string,
    {
      stepId: string;
      stepTitle: string;
      order: number;
      currentDurationSec: number;
      overtimeSignals: number;
      pauseSignals: number;
      graceSignals: number;
      totalOvertimeSec: number;
    }
  >();

  recentSessions.forEach((recentSession) => {
    (request.stepResultsBySessionId[recentSession.id] ?? []).forEach((result) => {
      const step = steps.find((candidate) => candidate.id === result.stepId);
      if (!step) return;

      const current =
        frictionByStepId.get(step.id) ??
        ({
          stepId: step.id,
          stepTitle: step.title,
          order: step.order,
          currentDurationSec: step.recommendedDurationSec,
          overtimeSignals: 0,
          pauseSignals: 0,
          graceSignals: 0,
          totalOvertimeSec: 0
        } as const);

      frictionByStepId.set(step.id, {
        ...current,
        overtimeSignals: current.overtimeSignals + Number(result.overtimeSec > 0),
        pauseSignals: current.pauseSignals + Number(result.pauseCount > 0),
        graceSignals: current.graceSignals + Number(result.status === "grace_completed" || result.status === "late_completed"),
        totalOvertimeSec: current.totalOvertimeSec + result.overtimeSec
      });
    });
  });

  const candidate = Array.from(frictionByStepId.values())
    .map((entry) => ({
      ...entry,
      frictionScore: entry.overtimeSignals + entry.pauseSignals + entry.graceSignals
    }))
    .filter((entry) => entry.frictionScore >= 2)
    .sort(
      (left, right) =>
        right.frictionScore - left.frictionScore ||
        right.totalOvertimeSec - left.totalOvertimeSec ||
        left.order - right.order
    )[0];

  if (!candidate) return null;

  const deltaSec = Math.min(180, roundToNearestThirty(candidate.currentDurationSec * 0.25));
  const proposedDurationSec = candidate.currentDurationSec + deltaSec;
  if (proposedDurationSec <= candidate.currentDurationSec) return null;

  const frictionSignals = unique([
    candidate.overtimeSignals > 0 ? "overtime" : "",
    candidate.pauseSignals > 0 ? "pause" : "",
    candidate.graceSignals > 0 ? "grace" : ""
  ]) as DurationTuneSuggestionPayload["frictionSignals"];

  return buildSuggestion({
    id: buildDurationTuneSuggestionId(session.id),
    type: "duration_tune",
    targetDateKey: session.dateKey,
    targetRoutineId: session.routineId,
    targetSessionId: session.id,
    generatedAt: now.toISOString(),
    reasoningSummary: `${candidate.stepTitle} step에서 최근 3회 안에 overtime ${candidate.overtimeSignals}회, pause ${candidate.pauseSignals}회, grace ${candidate.graceSignals}회가 누적돼 권장 시간을 ${deltaSec}초 늘리는 편이 자연스럽습니다.`,
    confidence: 0.68 + Math.min(0.14, candidate.frictionScore * 0.04),
    payload: {
      kind: "duration_tune",
      routineId: session.routineId,
      stepId: candidate.stepId,
      stepTitle: candidate.stepTitle,
      currentDurationSec: candidate.currentDurationSec,
      proposedDurationSec,
      deltaSec,
      frictionSignals
    }
  });
};

const withReviewSuggestionId = (summary: ReviewSummary, sourceSuggestionId: string, source: ReviewSummary["source"]): ReviewSummary => ({
  ...summary,
  source,
  sourceSuggestionId
});

const buildFallbackReviewSuggestion = (request: ReviewSuggestionRequest): AiSuggestion => {
  const now = new Date(request.nowIso);
  const suggestionId = buildReviewCommentarySuggestionId(request.dateKey);
  const summary = withReviewSuggestionId(
    buildFallbackReviewSummary({
      dateKey: request.dateKey,
      building: request.building,
      sessionsById: request.sessionsById,
      routinesById: request.routinesById,
      stepResultsBySessionId: request.stepResultsBySessionId,
      stepsByRoutineId: request.stepsByRoutineId,
      triggersByRoutineId: request.triggersByRoutineId,
      dismissedRemainingRoutineIds: request.dismissedRemainingRoutineIds,
      now,
      timeContext: getRequestTimeContext(request)
    }),
    suggestionId,
    "fallback"
  );

  return buildSuggestion({
    id: suggestionId,
    type: "review_commentary",
    targetDateKey: request.dateKey,
    generatedAt: now.toISOString(),
    reasoningSummary: "day review는 현재 building, 성공 세션, friction, 내일 첫 추천 루틴을 기준으로 fallback summary를 먼저 엽니다.",
    confidence: 0.57,
    payload: {
      kind: "review_commentary",
      summary
    }
  });
};

export const buildLauncherFallbackResponse = (request: LauncherSuggestionRequest): LauncherSuggestionResponseData => ({
  kind: "launcher",
  routineSuggestion: buildFallbackRoutineSuggestion(request),
  surpriseQuestSuggestion: buildFallbackSurpriseQuestSuggestion(request)
});

export const buildDurationTuneFallbackResponse = (
  request: DurationTuneSuggestionRequest
): DurationTuneSuggestionResponseData => ({
  kind: "duration_tune",
  suggestion: buildFallbackDurationTuneSuggestion(request)
});

export const buildReviewFallbackResponse = (request: ReviewSuggestionRequest): ReviewSuggestionResponseData => ({
  kind: "review",
  suggestion: buildFallbackReviewSuggestion(request)
});

export const buildFallbackResponseForRequest = (request: AiSuggestionRouteRequest): AiSuggestionResponseData => {
  if (request.kind === "launcher") return buildLauncherFallbackResponse(request);
  if (request.kind === "duration_tune") return buildDurationTuneFallbackResponse(request);
  return buildReviewFallbackResponse(request);
};
