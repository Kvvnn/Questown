import {
  AiSuggestion,
  ReviewSummary,
  SurpriseQuest
} from "@/domain/game-types";
import {
  AiSuggestionRouteRequest,
  AiSuggestionRouteResponse,
  AiSuggestionResponseData,
  DurationTuneSuggestionResponseData,
  LauncherSuggestionResponseData,
  ReviewSuggestionResponseData
} from "@/domain/ai-contracts";
import { buildFallbackResponseForRequest } from "@/domain/ai-fallbacks";
import { getOpenAiServerConfig } from "./openai-config";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clampConfidence = (value: number) => Math.max(0.05, Math.min(0.98, Number(value.toFixed(2))));

const extractOutputText = (payload: unknown) => {
  if (!isPlainObject(payload) || !Array.isArray(payload.output)) return "";

  return payload.output
    .flatMap((item) => (isPlainObject(item) && Array.isArray(item.content) ? item.content : []))
    .map((content) => (isPlainObject(content) && typeof content.text === "string" ? content.text : ""))
    .join("")
    .trim();
};

const parseJsonObject = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

class AiSuggestionDegradedError extends Error {
  reason: "request_failed" | "invalid_output";

  constructor(reason: "request_failed" | "invalid_output") {
    super(reason);
    this.reason = reason;
  }
}

const createResponsesApiBody = ({
  model,
  schemaName,
  schema,
  system,
  prompt
}: {
  model: string;
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  prompt: string;
}) => ({
  model,
  input: [
    {
      role: "system",
      content: [{ type: "input_text", text: system }]
    },
    {
      role: "user",
      content: [{ type: "input_text", text: prompt }]
    }
  ],
  text: {
    format: {
      type: "json_schema",
      name: schemaName,
      schema,
      strict: true
    }
  }
});

const createAiSuggestionFromFallback = <TSuggestion extends AiSuggestion>(
  suggestion: TSuggestion,
  patch: Partial<TSuggestion>
): TSuggestion => ({
  ...suggestion,
  ...patch,
  source: "ai",
  status: suggestion.status
});

const LAUNCHER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    routineSuggestion: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            directorNote: { type: "string" },
            reasoningSummary: { type: "string" },
            confidence: { type: "number" }
          },
          required: ["directorNote", "reasoningSummary", "confidence"]
        }
      ]
    },
    surpriseQuest: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            contextType: { enum: ["home", "commute", "work", "night", "health", "generic"] },
            difficulty: { enum: [1, 2, 3, 4, 5] },
            rewardType: { enum: ["ornament", "score", "theme_token"] },
            reasoningSummary: { type: "string" },
            confidence: { type: "number" }
          },
          required: ["title", "contextType", "difficulty", "rewardType", "reasoningSummary", "confidence"]
        }
      ]
    }
  },
  required: ["routineSuggestion", "surpriseQuest"]
} as const;

const DURATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestion: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            stepId: { type: "string" },
            proposedDurationSec: { type: "number" },
            reasoningSummary: { type: "string" },
            confidence: { type: "number" }
          },
          required: ["stepId", "proposedDurationSec", "reasoningSummary", "confidence"]
        }
      ]
    }
  },
  required: ["suggestion"]
} as const;

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        headline: { type: "string" },
        body: { type: "string" },
        stableRoutines: { type: "array", items: { type: "string" } },
        frictionPoints: { type: "array", items: { type: "string" } },
        tomorrowHints: { type: "array", items: { type: "string" } }
      },
      required: ["headline", "body", "stableRoutines", "frictionPoints", "tomorrowHints"]
    },
    reasoningSummary: { type: "string" },
    confidence: { type: "number" }
  },
  required: ["summary", "reasoningSummary", "confidence"]
} as const;

const requestStructuredJson = async ({
  system,
  prompt,
  schemaName,
  schema
}: {
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
}) => {
  const config = getOpenAiServerConfig();
  if (!config.isConfigured || !config.apiKey || !config.model) {
    throw new AiSuggestionDegradedError("request_failed");
  }

  const response = await fetch(RESPONSES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(
      createResponsesApiBody({
        model: config.model,
        schemaName,
        schema,
        system,
        prompt
      })
    )
  });

  if (!response.ok) {
    throw new AiSuggestionDegradedError("request_failed");
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  if (!text) {
    throw new AiSuggestionDegradedError("invalid_output");
  }

  const parsed = parseJsonObject(text);
  if (!parsed) {
    throw new AiSuggestionDegradedError("invalid_output");
  }

  return parsed;
};

const toKoreanJson = (value: unknown) => JSON.stringify(value, null, 2);

const buildLauncherPrompt = (fallback: LauncherSuggestionResponseData, request: AiSuggestionRouteRequest & { kind: "launcher" }) => `
Questown launcher recommendation context:
${toKoreanJson({
  nowIso: request.nowIso,
  activeSessionId: request.activeSessionId,
  routines: Object.values(request.routinesById).map((routine) => ({
    id: routine.id,
    name: routine.name,
    category: routine.category,
    estimatedDurationSec: routine.estimatedDurationSec
  })),
  fallback
})}

Return concise Korean copy.
- Keep the fallback routineId and launchContext unchanged.
- directorNote should be 1 sentence.
- reasoningSummary should be 1-2 sentences.
- surpriseQuest, if present, must stay light and optional and must not block the main routine.
`;

const buildDurationPrompt = (fallback: DurationTuneSuggestionResponseData, request: AiSuggestionRouteRequest & { kind: "duration_tune" }) => `
Questown duration tuning context:
${toKoreanJson({
  nowIso: request.nowIso,
  sessionId: request.sessionId,
  steps: request.stepsByRoutineId[request.sessionsById[request.sessionId]?.routineId ?? ""] ?? [],
  recentResults: request.stepResultsBySessionId,
  fallback
})}

Return concise Korean copy.
- Prefer the fallback step unless another step clearly has stronger repeated friction.
- proposedDurationSec must be greater than the current duration and should stay reasonable.
`;

const buildReviewPrompt = (fallback: ReviewSuggestionResponseData, request: AiSuggestionRouteRequest & { kind: "review" }) => `
Questown day review context:
${toKoreanJson({
  nowIso: request.nowIso,
  dateKey: request.dateKey,
  building: request.building,
  dismissedRemainingRoutineIds: request.dismissedRemainingRoutineIds,
  fallback
})}

Return concise Korean review copy.
- Keep the tone supportive and specific.
- headline should be short.
- body should stay within 2 sentences.
- tomorrowHints should stay actionable and non-generic.
`;

const unique = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim().length > 0)));

const buildDegradedResponse = (
  request: AiSuggestionRouteRequest,
  degradedReason: "missing_env" | "request_failed" | "invalid_output"
): AiSuggestionRouteResponse => {
  const base: AiSuggestionResponseData =
    request.kind === "launcher"
      ? { kind: "launcher", routineSuggestion: null, surpriseQuestSuggestion: null }
      : request.kind === "duration_tune"
        ? { kind: "duration_tune", suggestion: null }
        : { kind: "review", suggestion: null };

  return {
    ...base,
    responseSource: "degraded",
    degradedReason
  };
};

const buildAiLauncherResponse = async (
  request: AiSuggestionRouteRequest & { kind: "launcher" },
  fallback: LauncherSuggestionResponseData
): Promise<LauncherSuggestionResponseData> => {
  if (!fallback.routineSuggestion && !fallback.surpriseQuestSuggestion) {
    return fallback;
  }

  const parsed = await requestStructuredJson({
    system: "You are Questown AI Director. Output only valid JSON matching the schema.",
    prompt: buildLauncherPrompt(fallback, request),
    schemaName: "questown_launcher",
    schema: LAUNCHER_SCHEMA
  });

  const fallbackRoutinePayload =
    fallback.routineSuggestion?.payload.kind === "routine_recommendation" ? fallback.routineSuggestion.payload : null;
  const nextRoutineSuggestion =
    fallback.routineSuggestion && fallbackRoutinePayload && isPlainObject(parsed.routineSuggestion)
      ? createAiSuggestionFromFallback(fallback.routineSuggestion, {
          reasoningSummary:
            typeof parsed.routineSuggestion.reasoningSummary === "string"
              ? parsed.routineSuggestion.reasoningSummary
              : fallback.routineSuggestion.reasoningSummary,
          confidence:
            typeof parsed.routineSuggestion.confidence === "number"
              ? clampConfidence(parsed.routineSuggestion.confidence)
              : fallback.routineSuggestion.confidence,
          payload: {
            ...fallbackRoutinePayload,
            directorNote:
              typeof parsed.routineSuggestion.directorNote === "string"
                ? parsed.routineSuggestion.directorNote
                : fallbackRoutinePayload.directorNote
          }
        })
      : fallback.routineSuggestion;

  const nextSurpriseQuestSuggestion =
    fallback.surpriseQuestSuggestion && isPlainObject(parsed.surpriseQuest)
      ? (() => {
          const fallbackPayload = fallback.surpriseQuestSuggestion.payload.kind === "surprise_quest" ? fallback.surpriseQuestSuggestion.payload : null;
          if (!fallbackPayload) return fallback.surpriseQuestSuggestion;

          const nextQuest: SurpriseQuest = {
            ...fallbackPayload.quest,
            title: typeof parsed.surpriseQuest.title === "string" ? parsed.surpriseQuest.title : fallbackPayload.quest.title,
            contextType:
              typeof parsed.surpriseQuest.contextType === "string"
                ? (parsed.surpriseQuest.contextType as SurpriseQuest["contextType"])
                : fallbackPayload.quest.contextType,
            difficulty:
              typeof parsed.surpriseQuest.difficulty === "number"
                ? (parsed.surpriseQuest.difficulty as SurpriseQuest["difficulty"])
                : fallbackPayload.quest.difficulty,
            rewardType:
              typeof parsed.surpriseQuest.rewardType === "string"
                ? (parsed.surpriseQuest.rewardType as SurpriseQuest["rewardType"])
                : fallbackPayload.quest.rewardType,
            sourceSuggestionId: fallback.surpriseQuestSuggestion.id
          };

          return createAiSuggestionFromFallback(fallback.surpriseQuestSuggestion, {
            reasoningSummary:
              typeof parsed.surpriseQuest.reasoningSummary === "string"
                ? parsed.surpriseQuest.reasoningSummary
                : fallback.surpriseQuestSuggestion.reasoningSummary,
            confidence:
              typeof parsed.surpriseQuest.confidence === "number"
                ? clampConfidence(parsed.surpriseQuest.confidence)
                : fallback.surpriseQuestSuggestion.confidence,
            payload: {
              kind: "surprise_quest",
              questId: nextQuest.id,
              quest: nextQuest
            }
          });
        })()
      : fallback.surpriseQuestSuggestion;

  return {
    kind: "launcher",
    routineSuggestion: nextRoutineSuggestion,
    surpriseQuestSuggestion: nextSurpriseQuestSuggestion
  };
};

const buildAiDurationTuneResponse = async (
  request: AiSuggestionRouteRequest & { kind: "duration_tune" },
  fallback: DurationTuneSuggestionResponseData
): Promise<DurationTuneSuggestionResponseData> => {
  if (!fallback.suggestion || fallback.suggestion.payload.kind !== "duration_tune") {
    return fallback;
  }

  const parsed = await requestStructuredJson({
    system: "You are Questown AI Director. Output only valid JSON matching the schema.",
    prompt: buildDurationPrompt(fallback, request),
    schemaName: "questown_duration_tune",
    schema: DURATION_SCHEMA
  });
  if (!isPlainObject(parsed.suggestion)) {
    throw new AiSuggestionDegradedError("invalid_output");
  }
  const parsedSuggestion = parsed.suggestion as Record<string, unknown>;
  const fallbackPayload = fallback.suggestion.payload;

  const step = (request.stepsByRoutineId[fallbackPayload.routineId] ?? []).find(
    (candidate) => candidate.id === (typeof parsedSuggestion.stepId === "string" ? parsedSuggestion.stepId : fallbackPayload.stepId)
  );
  if (!step) return fallback;

  const currentDurationSec = step.recommendedDurationSec;
  const proposedDurationSec =
    typeof parsedSuggestion.proposedDurationSec === "number" && parsedSuggestion.proposedDurationSec > currentDurationSec
      ? Math.round(parsedSuggestion.proposedDurationSec)
      : fallbackPayload.proposedDurationSec;
  const deltaSec = proposedDurationSec - currentDurationSec;
  if (deltaSec <= 0 || deltaSec > 180) return fallback;

  return {
    kind: "duration_tune",
    suggestion: createAiSuggestionFromFallback(fallback.suggestion, {
      reasoningSummary:
        typeof parsedSuggestion.reasoningSummary === "string"
          ? parsedSuggestion.reasoningSummary
          : fallback.suggestion.reasoningSummary,
      confidence:
        typeof parsedSuggestion.confidence === "number"
          ? clampConfidence(parsedSuggestion.confidence)
          : fallback.suggestion.confidence,
      payload: {
        ...fallbackPayload,
        stepId: step.id,
        stepTitle: step.title,
        currentDurationSec,
        proposedDurationSec,
        deltaSec
      }
    })
  };
};

const buildAiReviewResponse = async (
  request: AiSuggestionRouteRequest & { kind: "review" },
  fallback: ReviewSuggestionResponseData
): Promise<ReviewSuggestionResponseData> => {
  if (!fallback.suggestion) {
    return fallback;
  }

  const parsed = await requestStructuredJson({
    system: "You are Questown AI Director. Output only valid JSON matching the schema.",
    prompt: buildReviewPrompt(fallback, request),
    schemaName: "questown_review",
    schema: REVIEW_SCHEMA
  });
  if (!isPlainObject(parsed.summary)) {
    throw new AiSuggestionDegradedError("invalid_output");
  }

  const fallbackPayload = fallback.suggestion.payload.kind === "review_commentary" ? fallback.suggestion.payload : null;
  if (!fallbackPayload) return fallback;

  const nextSummary: ReviewSummary = {
    ...fallbackPayload.summary,
    headline: typeof parsed.summary.headline === "string" ? parsed.summary.headline : fallbackPayload.summary.headline,
    body: typeof parsed.summary.body === "string" ? parsed.summary.body : fallbackPayload.summary.body,
    stableRoutines: Array.isArray(parsed.summary.stableRoutines)
      ? unique(parsed.summary.stableRoutines.filter((value): value is string => typeof value === "string"))
      : fallbackPayload.summary.stableRoutines,
    frictionPoints: Array.isArray(parsed.summary.frictionPoints)
      ? unique(parsed.summary.frictionPoints.filter((value): value is string => typeof value === "string"))
      : fallbackPayload.summary.frictionPoints,
    tomorrowHints: Array.isArray(parsed.summary.tomorrowHints)
      ? unique(parsed.summary.tomorrowHints.filter((value): value is string => typeof value === "string"))
      : fallbackPayload.summary.tomorrowHints,
    source: "ai",
    sourceSuggestionId: fallback.suggestion.id
  };

  return {
    kind: "review",
    suggestion: createAiSuggestionFromFallback(fallback.suggestion, {
      reasoningSummary:
        typeof parsed.reasoningSummary === "string" ? parsed.reasoningSummary : fallback.suggestion.reasoningSummary,
      confidence:
        typeof parsed.confidence === "number" ? clampConfidence(parsed.confidence) : fallback.suggestion.confidence,
      payload: {
        kind: "review_commentary",
        summary: nextSummary
      }
    })
  };
};

export const generateAiSuggestionResponse = async (request: AiSuggestionRouteRequest): Promise<AiSuggestionRouteResponse> => {
  const config = getOpenAiServerConfig();
  if (!config.isConfigured) {
    return buildDegradedResponse(request, "missing_env");
  }

  const fallback = buildFallbackResponseForRequest(request);

  try {
    if (request.kind === "launcher") {
      return {
        ...(await buildAiLauncherResponse(request, fallback as LauncherSuggestionResponseData)),
        responseSource: "ai"
      };
    }
    if (request.kind === "duration_tune") {
      return {
        ...(await buildAiDurationTuneResponse(request, fallback as DurationTuneSuggestionResponseData)),
        responseSource: "ai"
      };
    }
    return {
      ...(await buildAiReviewResponse(request, fallback as ReviewSuggestionResponseData)),
      responseSource: "ai"
    };
  } catch (error) {
    return buildDegradedResponse(
      request,
      error instanceof AiSuggestionDegradedError ? error.reason : "request_failed"
    );
  }
};
