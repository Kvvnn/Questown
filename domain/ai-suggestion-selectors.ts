import {
  AiSuggestion,
  DurationTuneSuggestionPayload,
  ReviewCommentarySuggestionPayload,
  RoutineRecommendationSuggestionPayload,
  SurpriseQuestSuggestionPayload
} from "./game-types";

const compareByPriority = (left: AiSuggestion, right: AiSuggestion) =>
  Number(right.source === "ai") - Number(left.source === "ai") || right.generatedAt.localeCompare(left.generatedAt, "en");

const isVisibleSuggestion = (suggestion: AiSuggestion | undefined) =>
  !!suggestion && suggestion.status !== "dismissed" && suggestion.status !== "expired";

export const buildRoutineRecommendationSuggestionId = (dateKey: string, routineId: string) => `ai-routine-${dateKey}-${routineId}`;

export const buildDurationTuneSuggestionId = (sessionId: string) => `ai-duration-${sessionId}`;

export const buildSurpriseQuestSuggestionId = (dateKey: string) => `ai-surprise-${dateKey}`;

export const buildReviewCommentarySuggestionId = (dateKey: string) => `ai-review-${dateKey}`;

export const getLauncherRoutineSuggestion = ({
  aiSuggestionsById,
  dateKey,
  routineId
}: {
  aiSuggestionsById: Record<string, AiSuggestion>;
  dateKey: string;
  routineId?: string;
}) =>
  Object.values(aiSuggestionsById)
    .filter(
      (suggestion): suggestion is AiSuggestion & { payload: RoutineRecommendationSuggestionPayload } =>
        suggestion.type === "routine_recommendation" &&
        suggestion.targetDateKey === dateKey &&
        (!routineId || suggestion.targetRoutineId === routineId) &&
        isVisibleSuggestion(suggestion)
    )
    .sort(compareByPriority)[0];

export const getPendingDurationTuneSuggestion = ({
  aiSuggestionsById,
  sessionId
}: {
  aiSuggestionsById: Record<string, AiSuggestion>;
  sessionId?: string;
}) =>
  Object.values(aiSuggestionsById)
    .filter(
      (suggestion): suggestion is AiSuggestion & { payload: DurationTuneSuggestionPayload } =>
        suggestion.type === "duration_tune" && suggestion.targetSessionId === sessionId && suggestion.status === "pending"
    )
    .sort(compareByPriority)[0];

export const getReviewCommentarySuggestion = ({
  aiSuggestionsById,
  dateKey
}: {
  aiSuggestionsById: Record<string, AiSuggestion>;
  dateKey: string;
}) =>
  Object.values(aiSuggestionsById)
    .filter(
      (suggestion): suggestion is AiSuggestion & { payload: ReviewCommentarySuggestionPayload } =>
        suggestion.type === "review_commentary" && suggestion.targetDateKey === dateKey && isVisibleSuggestion(suggestion)
    )
    .sort(compareByPriority)[0];

export const getSurpriseQuestSuggestion = ({
  aiSuggestionsById,
  dateKey
}: {
  aiSuggestionsById: Record<string, AiSuggestion>;
  dateKey: string;
}) =>
  Object.values(aiSuggestionsById)
    .filter(
      (suggestion): suggestion is AiSuggestion & { payload: SurpriseQuestSuggestionPayload } =>
        suggestion.type === "surprise_quest" && suggestion.targetDateKey === dateKey && isVisibleSuggestion(suggestion)
    )
    .sort(compareByPriority)[0];

export const getSuggestionConfidenceLabel = (confidence: number) => {
  if (confidence >= 0.8) return "high confidence";
  if (confidence >= 0.65) return "steady confidence";
  return "low risk guess";
};
