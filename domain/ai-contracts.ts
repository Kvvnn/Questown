import {
  AiSuggestion,
  DailyBuilding,
  Routine,
  RoutineSession,
  RoutineStep,
  RoutineTrigger,
  SessionStepResult,
  SurpriseQuest
} from "./game-types";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

export interface LauncherSuggestionRequest {
  kind: "launcher";
  nowIso: string;
  localTimeOffsetMinutes: number;
  activeSessionId?: string;
  routinesById: Record<string, Routine>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  sessionsById: Record<string, RoutineSession>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
}

export interface DurationTuneSuggestionRequest {
  kind: "duration_tune";
  nowIso: string;
  localTimeOffsetMinutes: number;
  sessionId: string;
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  sessionsById: Record<string, RoutineSession>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
}

export interface ReviewSuggestionRequest {
  kind: "review";
  nowIso: string;
  localTimeOffsetMinutes: number;
  dateKey: string;
  building: DailyBuilding;
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  sessionsById: Record<string, RoutineSession>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  dismissedRemainingRoutineIds: string[];
}

export type AiSuggestionRouteRequest = LauncherSuggestionRequest | DurationTuneSuggestionRequest | ReviewSuggestionRequest;

export type AiSuggestionRouteResponseSource = "ai" | "degraded";
export type AiSuggestionRouteDegradedReason = "missing_env" | "request_failed" | "invalid_output";

export interface LauncherSuggestionResponseData {
  kind: "launcher";
  routineSuggestion: AiSuggestion | null;
  surpriseQuestSuggestion: AiSuggestion | null;
}

export interface DurationTuneSuggestionResponseData {
  kind: "duration_tune";
  suggestion: AiSuggestion | null;
}

export interface ReviewSuggestionResponseData {
  kind: "review";
  suggestion: AiSuggestion | null;
}

export type AiSuggestionResponseData =
  | LauncherSuggestionResponseData
  | DurationTuneSuggestionResponseData
  | ReviewSuggestionResponseData;

export type AiSuggestionRouteResponse = (LauncherSuggestionResponseData | DurationTuneSuggestionResponseData | ReviewSuggestionResponseData) & {
  responseSource: AiSuggestionRouteResponseSource;
  degradedReason?: AiSuggestionRouteDegradedReason;
};

const hasRecordFields = (value: Record<string, unknown>, keys: string[]) => keys.every((key) => isPlainObject(value[key]));

export const parseAiSuggestionRouteRequest = (value: unknown): AiSuggestionRouteRequest | null => {
  if (
    !isPlainObject(value) ||
    typeof value.kind !== "string" ||
    typeof value.nowIso !== "string" ||
    typeof value.localTimeOffsetMinutes !== "number"
  ) {
    return null;
  }

  if (value.kind === "launcher") {
    if (!hasRecordFields(value, ["routinesById", "triggersByRoutineId", "sessionsById", "dailyBuildingsByDate", "surpriseQuestsById"])) {
      return null;
    }

    return {
      kind: "launcher",
      nowIso: value.nowIso,
      localTimeOffsetMinutes: value.localTimeOffsetMinutes,
      activeSessionId: typeof value.activeSessionId === "string" ? value.activeSessionId : undefined,
      routinesById: value.routinesById as Record<string, Routine>,
      triggersByRoutineId: value.triggersByRoutineId as Record<string, RoutineTrigger[]>,
      sessionsById: value.sessionsById as Record<string, RoutineSession>,
      dailyBuildingsByDate: value.dailyBuildingsByDate as Record<string, DailyBuilding>,
      surpriseQuestsById: value.surpriseQuestsById as Record<string, SurpriseQuest>
    };
  }

  if (value.kind === "duration_tune") {
    if (
      typeof value.sessionId !== "string" ||
      !hasRecordFields(value, ["routinesById", "stepsByRoutineId", "sessionsById", "stepResultsBySessionId"])
    ) {
      return null;
    }

    return {
      kind: "duration_tune",
      nowIso: value.nowIso,
      localTimeOffsetMinutes: value.localTimeOffsetMinutes,
      sessionId: value.sessionId,
      routinesById: value.routinesById as Record<string, Routine>,
      stepsByRoutineId: value.stepsByRoutineId as Record<string, RoutineStep[]>,
      sessionsById: value.sessionsById as Record<string, RoutineSession>,
      stepResultsBySessionId: value.stepResultsBySessionId as Record<string, SessionStepResult[]>
    };
  }

  if (value.kind === "review") {
    if (
      typeof value.dateKey !== "string" ||
      !isPlainObject(value.building) ||
      !hasRecordFields(value, ["routinesById", "stepsByRoutineId", "triggersByRoutineId", "sessionsById", "stepResultsBySessionId"]) ||
      !isStringArray(value.dismissedRemainingRoutineIds)
    ) {
      return null;
    }

    return {
      kind: "review",
      nowIso: value.nowIso,
      localTimeOffsetMinutes: value.localTimeOffsetMinutes,
      dateKey: value.dateKey,
      building: value.building as unknown as DailyBuilding,
      routinesById: value.routinesById as Record<string, Routine>,
      stepsByRoutineId: value.stepsByRoutineId as Record<string, RoutineStep[]>,
      triggersByRoutineId: value.triggersByRoutineId as Record<string, RoutineTrigger[]>,
      sessionsById: value.sessionsById as Record<string, RoutineSession>,
      stepResultsBySessionId: value.stepResultsBySessionId as Record<string, SessionStepResult[]>,
      dismissedRemainingRoutineIds: value.dismissedRemainingRoutineIds
    };
  }

  return null;
};

const isAiSuggestionLike = (value: unknown) =>
  isPlainObject(value) &&
  typeof value.id === "string" &&
  typeof value.type === "string" &&
  typeof value.generatedAt === "string" &&
  typeof value.reasoningSummary === "string" &&
  typeof value.confidence === "number" &&
  typeof value.status === "string" &&
  typeof value.source === "string" &&
  isPlainObject(value.payload);

export const isAiSuggestionRouteResponse = (value: unknown): value is AiSuggestionRouteResponse => {
  if (
    !isPlainObject(value) ||
    typeof value.kind !== "string" ||
    (value.responseSource !== "ai" && value.responseSource !== "degraded") ||
    (value.degradedReason !== undefined &&
      value.degradedReason !== "missing_env" &&
      value.degradedReason !== "request_failed" &&
      value.degradedReason !== "invalid_output")
  ) {
    return false;
  }

  if (value.kind === "launcher") {
    return (
      (value.routineSuggestion === null || isAiSuggestionLike(value.routineSuggestion)) &&
      (value.surpriseQuestSuggestion === null || isAiSuggestionLike(value.surpriseQuestSuggestion))
    );
  }

  if (value.kind === "duration_tune") {
    return value.suggestion === null || isAiSuggestionLike(value.suggestion);
  }

  if (value.kind === "review") {
    return value.suggestion === null || isAiSuggestionLike(value.suggestion);
  }

  return false;
};
