import { addDays } from "./date";
import { isClearOrBetterGrade } from "./session-scoring";
import {
  AiSuggestion,
  DailyBuilding,
  Floor,
  RoutineAnalyticsEvent,
  RoutineAnalyticsSnapshot,
  RoutineMigrationMeta,
  RoutineSession,
  SurpriseQuest
} from "./game-types";

const percent = (numerator: number, denominator: number) => {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
};

const getDateRange = (endDateKey: string, days: number) =>
  Array.from({ length: days }, (_, index) => addDays(endDateKey, -(days - 1) + index));

const getSessionTimestamp = (session: RoutineSession) => session.endedAt ?? session.startedAt;

const getSuggestionResolvedLabel = (status: AiSuggestion["status"]) => {
  if (status === "applied") return "수락";
  if (status === "dismissed") return "보류";
  return "만료";
};

const getSuggestionSourceLabel = (source: AiSuggestion["source"]) => (source === "ai" ? "AI" : "System");

export const getRoutineAnalyticsSnapshot = ({
  currentGameDateKey,
  sessionsById,
  dailyBuildingsByDate,
  floorsById,
  surpriseQuestsById,
  aiSuggestionsById
}: {
  currentGameDateKey: string;
  sessionsById: Record<string, RoutineSession>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  floorsById: Record<string, Floor>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  aiSuggestionsById: Record<string, AiSuggestion>;
}): RoutineAnalyticsSnapshot => {
  const last7DateKeys = new Set(getDateRange(currentGameDateKey, 7));
  const last14DateKeys = new Set(getDateRange(currentGameDateKey, 14));
  const currentMonthKey = currentGameDateKey.slice(0, 7);
  const completedSessions = Object.values(sessionsById).filter((session) => session.status === "completed" || session.status === "reviewed");
  const completedSessionsLast7 = completedSessions.filter((session) => last7DateKeys.has(session.dateKey)).length;
  const completedSessionsLast14 = completedSessions.filter((session) => last14DateKeys.has(session.dateKey));
  const clearSessionsLast14 = completedSessionsLast14.filter((session) => isClearOrBetterGrade(session.resultGrade)).length;
  const reviewedBuildingsLast14 = Object.values(dailyBuildingsByDate).filter(
    (building) => last14DateKeys.has(building.dateKey) && building.successfulSessionCount > 0
  );
  const resolvedSurpriseQuests = Object.values(surpriseQuestsById).filter(
    (quest) => quest.status === "completed" || quest.status === "skipped"
  );
  const resolvedSuggestions = Object.values(aiSuggestionsById).filter(
    (suggestion) => suggestion.status === "applied" || suggestion.status === "dismissed"
  );
  const resolvedAiSuggestions = resolvedSuggestions.filter((suggestion) => suggestion.source === "ai");
  const resolvedFallbackSuggestions = resolvedSuggestions.filter((suggestion) => suggestion.source === "fallback");

  return {
    completedSessionsLast7,
    clearRateLast14: percent(clearSessionsLast14, completedSessionsLast14.length),
    finalizedReviewRateLast14: percent(
      reviewedBuildingsLast14.filter((building) => Boolean(building.finalizedAt)).length,
      reviewedBuildingsLast14.length
    ),
    totalFloors: Object.keys(floorsById).length,
    currentMonthFloorCount: Object.values(floorsById).filter((floor) => floor.dateKey.startsWith(`${currentMonthKey}-`)).length,
    surpriseQuestCompletionRate: percent(
      resolvedSurpriseQuests.filter((quest) => quest.status === "completed").length,
      resolvedSurpriseQuests.length
    ),
    aiSuggestionAcceptanceRate: percent(
      resolvedAiSuggestions.filter((suggestion) => suggestion.status === "applied").length,
      resolvedAiSuggestions.length
    ),
    fallbackSuggestionResolutionCount: resolvedFallbackSuggestions.length
  };
};

export const getRoutineAnalyticsEvents = ({
  sessionsById,
  dailyBuildingsByDate,
  surpriseQuestsById,
  aiSuggestionsById,
  migrationMetaBySourceFingerprint
}: {
  sessionsById: Record<string, RoutineSession>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  aiSuggestionsById: Record<string, AiSuggestion>;
  migrationMetaBySourceFingerprint: Record<string, RoutineMigrationMeta>;
}): RoutineAnalyticsEvent[] =>
  [
    ...Object.values(sessionsById)
      .filter((session) => session.status === "completed" || session.status === "reviewed")
      .map<RoutineAnalyticsEvent>((session) => ({
        id: `event-session-${session.id}`,
        type: "session_completed",
        occurredAt: getSessionTimestamp(session),
        dateKey: session.dateKey,
        routineId: session.routineId,
        title: "세션 완료",
        body: `${session.dateKey}에 ${session.routineId} 세션이 ${session.resultGrade ?? "Partial"}로 기록됐습니다.`
      })),
    ...Object.values(dailyBuildingsByDate)
      .filter((building) => Boolean(building.finalizedAt))
      .map<RoutineAnalyticsEvent>((building) => ({
        id: `event-review-${building.dateKey}`,
        type: "day_review_finalized",
        occurredAt: building.finalizedAt as string,
        dateKey: building.dateKey,
        title: "하루 리뷰 확정",
        body: `${building.dateKey} building이 ${building.roofType} roof로 정산됐습니다.`
      })),
    ...Object.values(surpriseQuestsById)
      .filter((quest) => quest.status === "completed" && quest.completedAt)
      .map<RoutineAnalyticsEvent>((quest) => ({
        id: `event-surprise-${quest.id}`,
        type: "surprise_quest_completed",
        occurredAt: quest.completedAt as string,
        dateKey: quest.dateKey,
        title: "Surprise Quest 완료",
        body: `${quest.title} 보너스 미션을 완료했습니다.`
      })),
    ...Object.values(aiSuggestionsById)
      .filter((suggestion) => Boolean(suggestion.resolvedAt) && suggestion.status !== "pending")
      .map<RoutineAnalyticsEvent>((suggestion) => ({
        id: `event-ai-${suggestion.id}`,
        type: "ai_suggestion_resolved",
        occurredAt: suggestion.resolvedAt as string,
        dateKey: suggestion.targetDateKey,
        routineId: suggestion.targetRoutineId,
        suggestionId: suggestion.id,
        suggestionSource: suggestion.source,
        title: `${getSuggestionSourceLabel(suggestion.source)} 제안 처리`,
        body: `${suggestion.type} 제안을 ${getSuggestionResolvedLabel(suggestion.status)} 상태로 정리했습니다.`
      })),
    ...Object.values(migrationMetaBySourceFingerprint).map<RoutineAnalyticsEvent>((meta) => ({
      id: `event-import-${meta.sourceFingerprint}`,
      type: "backup_import_applied",
      occurredAt: meta.importedAt,
      title: "백업/마이그레이션 적용",
      body: `${meta.sourceKind}에서 ${meta.importedCompletedQuestCount}개 완료 기록을 가져왔습니다.`
    }))
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt, "en"));
