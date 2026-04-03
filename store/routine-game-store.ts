"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDefaultRoutineSeed, MORNING_ROUTINE_ID } from "@/domain/game-seeds";
import { finalizeDayReview } from "@/domain/day-review";
import { toGameDateKey } from "@/domain/game-day";
import {
  AiSuggestionResponseData,
  AiSuggestionRouteRequest,
  DurationTuneSuggestionRequest,
  LauncherSuggestionRequest,
  ReviewSuggestionRequest
} from "@/domain/ai-contracts";
import { buildFallbackResponseForRequest } from "@/domain/ai-fallbacks";
import { requestAiSuggestionRoute } from "@/domain/ai-client";
import { AppEntryPayload } from "@/domain/app-entry";
import {
  AiSuggestion,
  DailyBuilding,
  Floor,
  GameActiveView,
  RoutineBackupData,
  RoutineBackupImportPreview,
  RoutineBackupState,
  RoutineLaunchContext,
  RoutineMigrationMeta,
  RoutineStoreNotice,
  ReviewSummary,
  Routine,
  RoutineSession,
  SessionRuntime,
  RoutineStep,
  RoutineTrigger,
  SessionStepResult,
  StepResultStatus,
  SessionStatus,
  SurpriseQuest,
  TownMonth,
  TriggerType
} from "@/domain/game-types";
import { createQuestownId } from "@/domain/id";
import { getLocalTimeOffsetMinutes } from "@/domain/local-time";
import { getRemainingReviewRoutines } from "@/domain/game-selectors";
import { getPendingDurationTuneSuggestion, getReviewCommentarySuggestion } from "@/domain/ai-suggestion-selectors";
import { getRoutineLaunchAvailability } from "@/domain/routine-trigger-evaluator";
import { scoreRoutineSession } from "@/domain/session-scoring";
import { isClearOrBetterGrade } from "@/domain/session-scoring";
import { rebuildSessionAggregates } from "@/domain/session-aggregates";
import { buildTownMonthCache } from "@/domain/town-month";
import { StorageHealth } from "@/domain/types";
import { createSafeBrowserStorage } from "@/store/browser-storage";
import {
  buildLegacyRoutineImport,
  markResolvedSuggestion,
  mergeLegacyImportIntoRoutineBackupState
} from "@/store/legacy-routine-migration";
import { validateRoutineBackupImportSchema, CURRENT_ROUTINE_BACKUP_VERSION } from "@/store/routine-backup-schema";
import { getMonthKeyFromDateKey, resolveSelectedTownDate, resolveTownMonth } from "@/store/town-selection";

export const ROUTINE_GAME_STORAGE_NAME = "questown-routine-storage";
export const ROUTINE_GAME_STORAGE_VERSION = 8;
export const LEGACY_QUESTOWN_STORAGE_NAME = "questown-mvp-storage";

const HYDRATION_RECOVERY_NOTICE = "저장된 routine 데이터를 안전한 상태로 복구했어요.";
const IMPORT_RECOVERY_NOTICE = "가져온 데이터 일부를 자동 복구했어요.";
const LEGACY_MIGRATION_NOTICE = "기존 Questown 기록을 새 routine history로 옮겼어요.";
const browserStorage = createSafeBrowserStorage();

let hydrationStatusSetter: ((hasHydrated: boolean) => void) | undefined;
let storageHealthSetter: ((health: StorageHealth) => void) | undefined;

interface RoutineGameDataState {
  activeView: GameActiveView;
  selectedRoutineId?: string;
  activeSessionId?: string;
  hasBootstrappedDefaults: boolean;
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  sessionsById: Record<string, RoutineSession>;
  sessionRuntimeBySessionId: Record<string, SessionRuntime>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  floorsById: Record<string, Floor>;
  dismissedRemainingRoutineIdsByDate: Record<string, string[]>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  townMonthsByKey: Record<string, TownMonth>;
  aiSuggestionsById: Record<string, AiSuggestion>;
  reviewSummariesById: Record<string, ReviewSummary>;
  migrationMetaBySourceFingerprint: Record<string, RoutineMigrationMeta>;
}

interface RoutineGameState extends RoutineGameDataState {
  selectedLaunchContext?: RoutineLaunchContext;
  selectedSuggestionId?: string;
  selectedTownMonthKey?: string;
  selectedTownDateKey?: string;
  notificationPermission: NotificationPermission | "unsupported";
  lastNotifiedTriggerWindowKey?: string;
  pendingSuggestionRequestKeys: Record<string, boolean>;
  hasHydrated: boolean;
  storageHealth: StorageHealth;
  migrationNotice?: RoutineStoreNotice;
  recoveryNotice?: RoutineStoreNotice;
  hydrateGame: () => void;
  bootstrapDefaultRoutines: () => void;
  selectRoutine: (routineId: string | undefined) => void;
  openRoutinePrelaunch: (launchContext: RoutineLaunchContext, sourceSuggestionId?: string) => void;
  openTodayReview: () => void;
  openTownView: () => void;
  closeTownView: () => void;
  openManageView: () => void;
  closeManageView: () => void;
  returnToLauncher: () => void;
  openActiveSession: () => void;
  selectTownMonth: (monthKey: string) => void;
  selectTownDate: (dateKey: string) => void;
  ensureTownMonthSnapshot: (monthKey?: string) => TownMonth | undefined;
  dismissRemainingRoutineForToday: (routineId: string) => void;
  clearDismissedRemainingRoutineForToday: (routineId: string) => void;
  startRoutineSession: (launchContext: RoutineLaunchContext) => { ok: boolean; reason?: string; sessionId?: string };
  pauseActiveSession: () => { ok: boolean; reason?: string };
  resumeActiveSession: () => { ok: boolean; reason?: string };
  completeCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  skipCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  dismissCompletedSession: () => void;
  requestLauncherSuggestions: () => Promise<void>;
  requestDurationSuggestion: (sessionId: string) => Promise<void>;
  requestReviewSuggestion: (dateKey?: string) => Promise<void>;
  applyAiSuggestion: (suggestionId: string) => { ok: boolean; reason?: string };
  dismissAiSuggestion: (suggestionId: string) => { ok: boolean; reason?: string };
  acceptSurpriseQuest: (questId: string) => { ok: boolean; reason?: string };
  completeSurpriseQuest: (questId: string) => { ok: boolean; reason?: string };
  skipSurpriseQuest: (questId: string) => { ok: boolean; reason?: string };
  confirmDayReview: () => { ok: boolean; reason?: string };
  closeDayReview: () => void;
  exportBackup: () => RoutineBackupData;
  previewBackupImport: (data: unknown) => { ok: true; preview: RoutineBackupImportPreview } | { ok: false; reason: string };
  applyBackupImport: (preview: RoutineBackupImportPreview) => { ok: boolean; reason?: string };
  consumeAppEntry: (payload: AppEntryPayload) => void;
  syncNotificationPermission: (permission: NotificationPermission | "unsupported") => void;
  requestNotificationPermission: () => Promise<NotificationPermission | "unsupported">;
  markTriggerWindowNotified: (notificationWindowKey?: string) => void;
  syncGameDay: () => string;
  setActiveView: (view: GameActiveView) => void;
  resetGameData: () => void;
  clearRecoveryNotice: () => void;
  clearMigrationNotice: () => void;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeActiveView = (value: unknown): GameActiveView => {
  if (value === "routines" || value === "launcher") return "launcher";
  if (
    value === "prelaunch" ||
    value === "session" ||
    value === "review_gate" ||
    value === "day_review" ||
    value === "town" ||
    value === "manage" ||
    value === "debug"
  ) {
    return value;
  }
  return "launcher";
};

const normalizeString = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value : undefined);
const normalizeBoolean = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);

const createInfoNotice = (title: string, body: string): RoutineStoreNotice => ({
  title,
  body,
  tone: "info"
});

const createWarningNotice = (title: string, body: string): RoutineStoreNotice => ({
  title,
  body,
  tone: "warning"
});

const normalizeRecordMap = <T>(value: unknown) => (isPlainObject(value) ? (value as Record<string, T>) : {});

const normalizeStringArrayRecordMap = (value: unknown) => {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, candidate]) => [
      key,
      Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []
    ])
  );
};

const normalizeRoutine = (value: unknown): Routine | undefined => {
  if (!isPlainObject(value)) return undefined;

  const routine = value as unknown as Routine;
  return {
    ...routine,
    sessionRole: routine.sessionRole ?? (routine.category === "night_shutdown" ? "day_closer" : "standard")
  };
};

const normalizeRoutineRecordMap = (value: unknown) => {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, routine]) => [key, normalizeRoutine(routine)])
      .filter((entry): entry is [string, Routine] => !!entry[1])
  );
};

const normalizeSession = (value: unknown): RoutineSession | undefined => {
  if (!isPlainObject(value)) return undefined;

  const session = value as unknown as RoutineSession;
  return {
    ...session,
    cleanRunBonus: typeof session.cleanRunBonus === "number" ? session.cleanRunBonus : 0,
    firstSessionBonus: typeof session.firstSessionBonus === "number" ? session.firstSessionBonus : 0
  };
};

const normalizeSessionRecordMap = (value: unknown) => {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, session]) => [key, normalizeSession(session)])
      .filter((entry): entry is [string, RoutineSession] => !!entry[1])
  );
};

const normalizeMigrationMeta = (value: unknown): RoutineMigrationMeta | undefined => {
  if (!isPlainObject(value)) return undefined;

  const sourceKind = normalizeString(value.sourceKind);
  const sourceFingerprint = normalizeString(value.sourceFingerprint);
  const importedAt = normalizeString(value.importedAt);
  if (!sourceKind || !sourceFingerprint || !importedAt) return undefined;

  return {
    sourceKind: sourceKind as RoutineMigrationMeta["sourceKind"],
    sourceFingerprint,
    importedAt,
    importedDateCount: typeof value.importedDateCount === "number" ? value.importedDateCount : 0,
    importedCompletedQuestCount: typeof value.importedCompletedQuestCount === "number" ? value.importedCompletedQuestCount : 0,
    unmappedQuestCount: typeof value.unmappedQuestCount === "number" ? value.unmappedQuestCount : 0,
    warningCount: typeof value.warningCount === "number" ? value.warningCount : 0,
    latestExportedAt: normalizeString(value.latestExportedAt)
  };
};

const normalizeMigrationMetaRecordMap = (value: unknown) => {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, meta]) => [key, normalizeMigrationMeta(meta)])
      .filter((entry): entry is [string, RoutineMigrationMeta] => !!entry[1])
  );
};

const buildFallbackLaunchContext = (routineId: string): RoutineLaunchContext => ({
  routineId,
  triggerSource: "manual",
  entrySource: "launcher_hero",
  reasonKey: "manual_fallback"
});

const normalizeAiSuggestion = (value: unknown): AiSuggestion | undefined => {
  if (!isPlainObject(value) || typeof value.id !== "string" || typeof value.type !== "string" || typeof value.reasoningSummary !== "string") {
    return undefined;
  }

  const payload = isPlainObject(value.payload) ? value.payload : {};
  const generatedAt = typeof value.generatedAt === "string" ? value.generatedAt : new Date(0).toISOString();
  const status =
    typeof value.status === "string"
      ? value.status
      : typeof value.applied === "boolean"
        ? value.applied
          ? "applied"
          : "pending"
        : "pending";
  const source = typeof value.source === "string" ? value.source : "fallback";
  const targetRoutineId = normalizeString(value.targetRoutineId);
  const targetDateKey = normalizeString(value.targetDateKey);
  const targetSessionId = normalizeString(value.targetSessionId);
  const resolvedAt = normalizeString(value.resolvedAt);

  if (value.type === "routine_recommendation") {
    const routineId =
      normalizeString(payload.routineId) ?? targetRoutineId ?? normalizeString((payload.launchContext as Record<string, unknown> | undefined)?.routineId);
    if (!routineId) return undefined;

    return {
      id: value.id,
      type: "routine_recommendation",
      targetDateKey,
      targetRoutineId: routineId,
      targetSessionId,
      generatedAt,
      reasoningSummary: value.reasoningSummary,
      confidence: typeof value.confidence === "number" ? value.confidence : 0.6,
      status: status as AiSuggestion["status"],
      source: source as AiSuggestion["source"],
      resolvedAt,
      expiresAt: normalizeString(value.expiresAt),
      payload: {
        kind: "routine_recommendation",
        routineId,
        launchContext: isPlainObject(payload.launchContext)
          ? ({
              routineId,
              triggerSource:
                typeof payload.launchContext.triggerSource === "string"
                  ? (payload.launchContext.triggerSource as RoutineLaunchContext["triggerSource"])
                  : "manual",
              triggerId: normalizeString(payload.launchContext.triggerId),
              entrySource:
                typeof payload.launchContext.entrySource === "string"
                  ? (payload.launchContext.entrySource as RoutineLaunchContext["entrySource"])
                  : "launcher_hero",
              reasonKey:
                typeof payload.launchContext.reasonKey === "string"
                  ? (payload.launchContext.reasonKey as RoutineLaunchContext["reasonKey"])
                  : "manual_fallback"
            } satisfies RoutineLaunchContext)
          : buildFallbackLaunchContext(routineId),
        directorNote: normalizeString(payload.directorNote) ?? value.reasoningSummary
      }
    };
  }

  if (value.type === "duration_tune") {
    const stepId = normalizeString(payload.stepId);
    if (!targetRoutineId || !stepId) return undefined;

    const currentDurationSec = typeof payload.currentDurationSec === "number" ? payload.currentDurationSec : 0;
    const proposedDurationSec = typeof payload.proposedDurationSec === "number" ? payload.proposedDurationSec : currentDurationSec;

    return {
      id: value.id,
      type: "duration_tune",
      targetDateKey,
      targetRoutineId,
      targetSessionId,
      generatedAt,
      reasoningSummary: value.reasoningSummary,
      confidence: typeof value.confidence === "number" ? value.confidence : 0.6,
      status: status as AiSuggestion["status"],
      source: source as AiSuggestion["source"],
      resolvedAt,
      expiresAt: normalizeString(value.expiresAt),
      payload: {
        kind: "duration_tune",
        routineId: targetRoutineId,
        stepId,
        stepTitle: normalizeString(payload.stepTitle) ?? stepId,
        currentDurationSec,
        proposedDurationSec,
        deltaSec:
          typeof payload.deltaSec === "number" ? payload.deltaSec : Math.max(0, proposedDurationSec - currentDurationSec),
        frictionSignals: Array.isArray(payload.frictionSignals)
          ? payload.frictionSignals.filter(
              (signal): signal is "overtime" | "pause" | "grace" => signal === "overtime" || signal === "pause" || signal === "grace"
            )
          : []
      }
    };
  }

  if (value.type === "surprise_quest") {
    const quest = isPlainObject(payload.quest) ? payload.quest : payload;
    const questId = normalizeString(payload.questId) ?? normalizeString(quest.id);
    const dateKey = normalizeString(targetDateKey ?? quest.dateKey);
    const title = normalizeString(quest.title);

    if (!questId || !dateKey || !title) return undefined;

    return {
      id: value.id,
      type: "surprise_quest",
      targetDateKey: dateKey,
      targetRoutineId,
      targetSessionId,
      generatedAt,
      reasoningSummary: value.reasoningSummary,
      confidence: typeof value.confidence === "number" ? value.confidence : 0.6,
      status: status as AiSuggestion["status"],
      source: source as AiSuggestion["source"],
      resolvedAt,
      expiresAt: normalizeString(value.expiresAt),
      payload: {
        kind: "surprise_quest",
        questId,
        quest: {
          id: questId,
          dateKey,
          title,
          contextType:
            typeof quest.contextType === "string" ? (quest.contextType as SurpriseQuest["contextType"]) : "generic",
          difficulty: typeof quest.difficulty === "number" ? (quest.difficulty as SurpriseQuest["difficulty"]) : 1,
          rewardType: typeof quest.rewardType === "string" ? (quest.rewardType as SurpriseQuest["rewardType"]) : "score",
          status: typeof quest.status === "string" ? (quest.status as SurpriseQuest["status"]) : "proposed",
          sourceSuggestionId: value.id,
          acceptedAt: normalizeString(quest.acceptedAt),
          completedAt: normalizeString(quest.completedAt),
          expiresAt: normalizeString(quest.expiresAt ?? value.expiresAt)
        }
      }
    };
  }

  if (value.type === "review_commentary") {
    const summary = isPlainObject(payload.summary) ? payload.summary : payload;
    if (!targetDateKey && typeof summary.dateKey !== "string") return undefined;

    return {
      id: value.id,
      type: "review_commentary",
      targetDateKey: targetDateKey ?? normalizeString(summary.dateKey),
      targetRoutineId,
      targetSessionId,
      generatedAt,
      reasoningSummary: value.reasoningSummary,
      confidence: typeof value.confidence === "number" ? value.confidence : 0.6,
      status: status as AiSuggestion["status"],
      source: source as AiSuggestion["source"],
      resolvedAt,
      expiresAt: normalizeString(value.expiresAt),
      payload: {
        kind: "review_commentary",
        summary: {
          id: normalizeString(summary.id) ?? `review-${targetDateKey ?? "unknown"}`,
          dateKey: targetDateKey ?? normalizeString(summary.dateKey) ?? "unknown",
          generatedAt: normalizeString(summary.generatedAt) ?? generatedAt,
          headline: normalizeString(summary.headline) ?? value.reasoningSummary,
          body: normalizeString(summary.body) ?? value.reasoningSummary,
          stableRoutines: Array.isArray(summary.stableRoutines)
            ? summary.stableRoutines.filter((item): item is string => typeof item === "string")
            : [],
          frictionPoints: Array.isArray(summary.frictionPoints)
            ? summary.frictionPoints.filter((item): item is string => typeof item === "string")
            : [],
          tomorrowHints: Array.isArray(summary.tomorrowHints)
            ? summary.tomorrowHints.filter((item): item is string => typeof item === "string")
            : [],
          source: typeof summary.source === "string" ? (summary.source as ReviewSummary["source"]) : "fallback",
          sourceSuggestionId: normalizeString(summary.sourceSuggestionId) ?? value.id
        }
      }
    };
  }

  return undefined;
};

const normalizeAiSuggestionRecordMap = (value: unknown) => {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, suggestion]) => [key, normalizeAiSuggestion(suggestion)])
      .filter((entry): entry is [string, AiSuggestion] => !!entry[1])
  );
};

const mergeAiSuggestion = (aiSuggestionsById: Record<string, AiSuggestion>, nextSuggestion: AiSuggestion | null | undefined) => {
  if (!nextSuggestion) return aiSuggestionsById;

  const existing = aiSuggestionsById[nextSuggestion.id];
  if (!existing) {
    return {
      ...aiSuggestionsById,
      [nextSuggestion.id]: nextSuggestion
    };
  }

  if (existing.status !== "pending") return aiSuggestionsById;
  if (existing.source === "ai" && nextSuggestion.source === "fallback") return aiSuggestionsById;

  return {
    ...aiSuggestionsById,
    [nextSuggestion.id]: {
      ...nextSuggestion,
      status: existing.status
    }
  };
};

const mergeSurpriseQuestFromSuggestion = (
  surpriseQuestsById: Record<string, SurpriseQuest>,
  suggestion: AiSuggestion | null | undefined
) => {
  if (!suggestion || suggestion.payload.kind !== "surprise_quest") return surpriseQuestsById;

  const nextQuest = suggestion.payload.quest;
  const existing = surpriseQuestsById[nextQuest.id];
  if (!existing) {
    return {
      ...surpriseQuestsById,
      [nextQuest.id]: nextQuest
    };
  }

  if (existing.status !== "proposed") return surpriseQuestsById;

  return {
    ...surpriseQuestsById,
    [nextQuest.id]: {
      ...existing,
      ...nextQuest,
      status: existing.status,
      acceptedAt: existing.acceptedAt,
      completedAt: existing.completedAt
    }
  };
};

const buildLauncherSuggestionRequest = (state: RoutineGameState, now: Date): LauncherSuggestionRequest => ({
  kind: "launcher",
  nowIso: now.toISOString(),
  localTimeOffsetMinutes: getLocalTimeOffsetMinutes(now),
  activeSessionId: state.activeSessionId,
  routinesById: state.routinesById,
  triggersByRoutineId: state.triggersByRoutineId,
  sessionsById: state.sessionsById,
  dailyBuildingsByDate: state.dailyBuildingsByDate,
  surpriseQuestsById: state.surpriseQuestsById
});

const buildDurationTuneSuggestionRequest = (
  state: RoutineGameState,
  sessionId: string,
  now: Date
): DurationTuneSuggestionRequest | null => {
  const session = state.sessionsById[sessionId];
  if (!session) return null;

  return {
    kind: "duration_tune",
    nowIso: now.toISOString(),
    localTimeOffsetMinutes: getLocalTimeOffsetMinutes(now),
    sessionId,
    routinesById: state.routinesById,
    stepsByRoutineId: state.stepsByRoutineId,
    sessionsById: state.sessionsById,
    stepResultsBySessionId: state.stepResultsBySessionId
  };
};

const buildReviewSuggestionRequest = (
  state: RoutineGameState,
  dateKey: string,
  now: Date
): ReviewSuggestionRequest | null => {
  const building = state.dailyBuildingsByDate[dateKey];
  if (!building) return null;

  return {
    kind: "review",
    nowIso: now.toISOString(),
    localTimeOffsetMinutes: getLocalTimeOffsetMinutes(now),
    dateKey,
    building,
    routinesById: state.routinesById,
    stepsByRoutineId: state.stepsByRoutineId,
    triggersByRoutineId: state.triggersByRoutineId,
    sessionsById: state.sessionsById,
    stepResultsBySessionId: state.stepResultsBySessionId,
    dismissedRemainingRoutineIds: state.dismissedRemainingRoutineIdsByDate[dateKey] ?? []
  };
};

const buildSuggestionRequestKey = (request: AiSuggestionRouteRequest) =>
  request.kind === "launcher" ? `launcher:${toGameDateKey(new Date(request.nowIso))}` : request.kind === "duration_tune" ? `duration:${request.sessionId}` : `review:${request.dateKey}`;

const mergeSuggestionResponseIntoState = ({
  current,
  response
}: {
  current: RoutineGameState;
  response: AiSuggestionResponseData;
}) => {
  if (response.kind === "launcher") {
    const nextRoutineSuggestions = mergeAiSuggestion(current.aiSuggestionsById, response.routineSuggestion);
    const nextWithQuestSuggestion = mergeAiSuggestion(nextRoutineSuggestions, response.surpriseQuestSuggestion);
    return {
      aiSuggestionsById: nextWithQuestSuggestion,
      surpriseQuestsById: mergeSurpriseQuestFromSuggestion(current.surpriseQuestsById, response.surpriseQuestSuggestion)
    };
  }

  if (response.kind === "duration_tune") {
    return {
      aiSuggestionsById: mergeAiSuggestion(current.aiSuggestionsById, response.suggestion)
    };
  }

  return {
    aiSuggestionsById: mergeAiSuggestion(current.aiSuggestionsById, response.suggestion)
  };
};

const omitRecordKey = <T>(record: Record<string, T>, key: string) => {
  const nextRecord = { ...record };
  delete nextRecord[key];
  return nextRecord;
};

const ACTIVE_RUNTIME_STATUSES: SessionStatus[] = ["active_step", "paused"];

const parseTimestamp = (value: string | undefined) => {
  if (!value) return NaN;
  return new Date(value).getTime();
};

const getElapsedMs = (runtime: SessionRuntime, now = new Date()) => {
  const stepStartedAt = parseTimestamp(runtime.stepStartedAt);
  if (Number.isNaN(stepStartedAt)) return 0;

  const pausedAt = parseTimestamp(runtime.pausedAt);
  const referenceTime = Number.isNaN(pausedAt) ? now.getTime() : pausedAt;
  return Math.max(0, referenceTime - stepStartedAt - runtime.accumulatedPauseMs);
};

const isValidRuntime = (runtime: SessionRuntime | undefined, stepCount: number) =>
  !!runtime &&
  Number.isInteger(runtime.currentStepIndex) &&
  runtime.currentStepIndex >= 0 &&
  runtime.currentStepIndex < stepCount &&
  !Number.isNaN(parseTimestamp(runtime.stepStartedAt));

const buildStepResultStatus = (
  elapsedMs: number,
  targetDurationSec: number,
  graceUsed: boolean
): { status: StepResultStatus; usedGrace: boolean } => {
  const targetMs = targetDurationSec * 1000;
  if (elapsedMs <= targetMs) {
    return { status: "success", usedGrace: false };
  }

  if (!graceUsed && elapsedMs <= targetMs * 1.25) {
    return { status: "grace_completed", usedGrace: true };
  }

  return { status: "late_completed", usedGrace: false };
};

const getNextComboCount = (currentComboCount: number, status: StepResultStatus) => {
  if (status === "success" || status === "grace_completed") {
    return currentComboCount + 1;
  }

  if (status === "late_completed") {
    return currentComboCount;
  }

  return 0;
};

const applyScoringToCompletedSession = ({
  routine,
  session,
  steps,
  stepResults,
  allSessions
}: {
  routine: Routine;
  session: RoutineSession;
  steps: RoutineStep[];
  stepResults: SessionStepResult[];
  allSessions: RoutineSession[];
}) => {
  const scoring = scoreRoutineSession({
    routine,
    steps,
    session,
    stepResults,
    allSessions
  });

  const scoreByStepResultId = new Map(scoring.stepBreakdowns.map((breakdown) => [breakdown.stepResultId, breakdown.scoreEarned]));
  const scoredStepResults = stepResults.map((stepResult) => ({
    ...stepResult,
    scoreEarned: scoreByStepResultId.get(stepResult.id) ?? stepResult.scoreEarned
  }));

  return {
    scoring,
    scoredStepResults
  };
};

const buildScoredSession = ({
  session,
  scoring
}: {
  session: RoutineSession;
  scoring: ReturnType<typeof scoreRoutineSession>;
}): RoutineSession => ({
  ...session,
  baseScore: scoring.baseScore,
  timeBonus: scoring.timeBonus,
  comboBonus: scoring.comboBonus,
  clearBonus: scoring.clearBonus,
  cleanRunBonus: scoring.cleanRunBonus,
  firstSessionBonus: scoring.firstSessionBonus,
  focusBonus: scoring.focusBonus,
  streakBonus: scoring.streakBonus,
  totalScore: scoring.totalScore,
  normalizedScore: scoring.normalizedScore,
  resultGrade: scoring.resultGrade
});

const arraysEqual = (left: string[] | undefined, right: string[] | undefined) =>
  (left ?? []).length === (right ?? []).length && (left ?? []).every((value, index) => value === (right ?? [])[index]);

const mergePersistedReviewState = ({
  rebuiltDailyBuildingsByDate,
  persistedDailyBuildingsByDate
}: {
  rebuiltDailyBuildingsByDate: Record<string, DailyBuilding>;
  persistedDailyBuildingsByDate: Record<string, DailyBuilding>;
}) =>
  Object.fromEntries(
    Object.entries(rebuiltDailyBuildingsByDate).map(([dateKey, building]) => {
      const persisted = persistedDailyBuildingsByDate[dateKey];
      if (
        persisted &&
        persisted.finalizedAt &&
        arraysEqual(persisted.sessionIds, building.sessionIds) &&
        arraysEqual(persisted.floorIds, building.floorIds)
      ) {
        return [
          dateKey,
          {
            ...building,
            roofType: persisted.roofType,
            reviewSummaryId: persisted.reviewSummaryId,
            finalizedAt: persisted.finalizedAt
          }
        ];
      }

      return [dateKey, building];
    })
  );

const buildTownMonthKeys = ({
  townMonthsByKey,
  dailyBuildingsByDate,
  currentGameDateKey,
  extraMonthKeys = []
}: {
  townMonthsByKey: Record<string, TownMonth>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  currentGameDateKey: string;
  extraMonthKeys?: string[];
}) =>
  Array.from(
    new Set([
      getMonthKeyFromDateKey(currentGameDateKey),
      ...Object.keys(townMonthsByKey),
      ...Object.keys(dailyBuildingsByDate).map(getMonthKeyFromDateKey),
      ...extraMonthKeys
    ])
  );

const rebuildTownMonthCache = ({
  townMonthsByKey,
  dailyBuildingsByDate,
  floorsById,
  surpriseQuestsById,
  currentGameDateKey,
  extraMonthKeys = []
}: {
  townMonthsByKey: Record<string, TownMonth>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  floorsById: Record<string, Floor>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  currentGameDateKey: string;
  extraMonthKeys?: string[];
}) =>
  buildTownMonthCache({
    monthKeys: buildTownMonthKeys({
      townMonthsByKey,
      dailyBuildingsByDate,
      currentGameDateKey,
      extraMonthKeys
    }),
    dailyBuildingsByDate,
    floorsById,
    surpriseQuestsById,
    currentGameDateKey
  });

const buildRoutineBackupState = (state: RoutineGameDataState): RoutineBackupState => ({
  activeView: state.activeView,
  selectedRoutineId: state.selectedRoutineId,
  activeSessionId: state.activeSessionId,
  hasBootstrappedDefaults: state.hasBootstrappedDefaults,
  routinesById: state.routinesById,
  stepsByRoutineId: state.stepsByRoutineId,
  triggersByRoutineId: state.triggersByRoutineId,
  sessionsById: state.sessionsById,
  sessionRuntimeBySessionId: state.sessionRuntimeBySessionId,
  stepResultsBySessionId: state.stepResultsBySessionId,
  dailyBuildingsByDate: state.dailyBuildingsByDate,
  floorsById: state.floorsById,
  dismissedRemainingRoutineIdsByDate: state.dismissedRemainingRoutineIdsByDate,
  surpriseQuestsById: state.surpriseQuestsById,
  aiSuggestionsById: state.aiSuggestionsById,
  reviewSummariesById: state.reviewSummariesById,
  migrationMetaBySourceFingerprint: state.migrationMetaBySourceFingerprint
});

const createInitialDataState = (): RoutineGameDataState => ({
  activeView: "launcher",
  selectedRoutineId: undefined,
  activeSessionId: undefined,
  hasBootstrappedDefaults: false,
  routinesById: {},
  stepsByRoutineId: {},
  triggersByRoutineId: {},
  sessionsById: {},
  sessionRuntimeBySessionId: {},
  stepResultsBySessionId: {},
  dailyBuildingsByDate: {},
  floorsById: {},
  dismissedRemainingRoutineIdsByDate: {},
  surpriseQuestsById: {},
  townMonthsByKey: {},
  aiSuggestionsById: {},
  reviewSummariesById: {},
  migrationMetaBySourceFingerprint: {}
});

const normalizeHydratedState = (persistedState: unknown): RoutineGameDataState => {
  if (!isPlainObject(persistedState)) return createInitialDataState();

  return {
    activeView: normalizeActiveView(persistedState.activeView),
    selectedRoutineId: normalizeString(persistedState.selectedRoutineId),
    activeSessionId: normalizeString(persistedState.activeSessionId),
    hasBootstrappedDefaults: normalizeBoolean(persistedState.hasBootstrappedDefaults),
    routinesById: normalizeRoutineRecordMap(persistedState.routinesById),
    stepsByRoutineId: normalizeRecordMap<RoutineStep[]>(persistedState.stepsByRoutineId),
    triggersByRoutineId: normalizeRecordMap<RoutineTrigger[]>(persistedState.triggersByRoutineId),
    sessionsById: normalizeSessionRecordMap(persistedState.sessionsById),
    sessionRuntimeBySessionId: normalizeRecordMap<SessionRuntime>(persistedState.sessionRuntimeBySessionId),
    stepResultsBySessionId: normalizeRecordMap<SessionStepResult[]>(persistedState.stepResultsBySessionId),
    dailyBuildingsByDate: normalizeRecordMap<DailyBuilding>(persistedState.dailyBuildingsByDate),
    floorsById: normalizeRecordMap<Floor>(persistedState.floorsById),
    dismissedRemainingRoutineIdsByDate: normalizeStringArrayRecordMap(persistedState.dismissedRemainingRoutineIdsByDate),
    surpriseQuestsById: normalizeRecordMap<SurpriseQuest>(persistedState.surpriseQuestsById),
    townMonthsByKey: normalizeRecordMap<TownMonth>(persistedState.townMonthsByKey),
    aiSuggestionsById: normalizeAiSuggestionRecordMap(persistedState.aiSuggestionsById),
    reviewSummariesById: normalizeRecordMap<ReviewSummary>(persistedState.reviewSummariesById),
    migrationMetaBySourceFingerprint: normalizeMigrationMetaRecordMap(persistedState.migrationMetaBySourceFingerprint)
  };
};

const createPersistedSlice = (state: RoutineGameState): RoutineGameDataState => ({
  activeView: state.activeView,
  selectedRoutineId: state.selectedRoutineId,
  activeSessionId: state.activeSessionId,
  hasBootstrappedDefaults: state.hasBootstrappedDefaults,
  routinesById: state.routinesById,
  stepsByRoutineId: state.stepsByRoutineId,
  triggersByRoutineId: state.triggersByRoutineId,
  sessionsById: state.sessionsById,
  sessionRuntimeBySessionId: state.sessionRuntimeBySessionId,
  stepResultsBySessionId: state.stepResultsBySessionId,
  dailyBuildingsByDate: state.dailyBuildingsByDate,
  floorsById: state.floorsById,
  dismissedRemainingRoutineIdsByDate: state.dismissedRemainingRoutineIdsByDate,
  surpriseQuestsById: state.surpriseQuestsById,
  townMonthsByKey: state.townMonthsByKey,
  aiSuggestionsById: state.aiSuggestionsById,
  reviewSummariesById: state.reviewSummariesById,
  migrationMetaBySourceFingerprint: state.migrationMetaBySourceFingerprint
});

const buildRoutineDataStateFromBackupState = (backupState: RoutineBackupState): RoutineGameDataState => ({
  ...createInitialDataState(),
  activeView: backupState.activeView,
  selectedRoutineId: backupState.selectedRoutineId,
  activeSessionId: backupState.activeSessionId,
  hasBootstrappedDefaults: backupState.hasBootstrappedDefaults,
  routinesById: backupState.routinesById,
  stepsByRoutineId: backupState.stepsByRoutineId,
  triggersByRoutineId: backupState.triggersByRoutineId,
  sessionsById: backupState.sessionsById,
  sessionRuntimeBySessionId: backupState.sessionRuntimeBySessionId,
  stepResultsBySessionId: backupState.stepResultsBySessionId,
  dailyBuildingsByDate: backupState.dailyBuildingsByDate,
  floorsById: backupState.floorsById,
  dismissedRemainingRoutineIdsByDate: backupState.dismissedRemainingRoutineIdsByDate,
  surpriseQuestsById: backupState.surpriseQuestsById,
  aiSuggestionsById: backupState.aiSuggestionsById,
  reviewSummariesById: backupState.reviewSummariesById,
  migrationMetaBySourceFingerprint: backupState.migrationMetaBySourceFingerprint
});

const getRoutineStateDateKeys = (state: Pick<RoutineGameDataState, "sessionsById" | "dailyBuildingsByDate">) =>
  Array.from(
    new Set([
      ...Object.keys(state.dailyBuildingsByDate),
      ...Object.values(state.sessionsById).map((session) => session.dateKey)
    ])
  ).sort((left, right) => left.localeCompare(right, "en"));

const repairRoutineDataState = ({
  dataState,
  currentGameDateKey
}: {
  dataState: RoutineGameDataState;
  currentGameDateKey: string;
}): { dataState: RoutineGameDataState; recovered: boolean } => {
  const rebuiltAggregates = rebuildSessionAggregates({
    sessionsById: dataState.sessionsById,
    routinesById: dataState.routinesById,
    surpriseQuestsById: dataState.surpriseQuestsById
  });
  const nextDailyBuildingsByDate = mergePersistedReviewState({
    rebuiltDailyBuildingsByDate: rebuiltAggregates.dailyBuildingsByDate,
    persistedDailyBuildingsByDate: dataState.dailyBuildingsByDate
  });
  const referencedReviewSummaryIds = new Set(
    Object.values(nextDailyBuildingsByDate)
      .map((building) => building.reviewSummaryId)
      .filter((reviewSummaryId): reviewSummaryId is string => typeof reviewSummaryId === "string")
  );
  const cleanedReviewSummariesById = Object.fromEntries(
    Object.entries(dataState.reviewSummariesById).filter(([reviewSummaryId]) => referencedReviewSummaryIds.has(reviewSummaryId))
  );

  const nextSelectedRoutineId =
    dataState.selectedRoutineId && dataState.routinesById[dataState.selectedRoutineId]
      ? dataState.selectedRoutineId
      : Object.keys(dataState.routinesById)[0];
  let nextActiveSessionId =
    dataState.activeSessionId && dataState.sessionsById[dataState.activeSessionId] ? dataState.activeSessionId : undefined;
  let nextActiveView = dataState.activeView;

  if (nextActiveSessionId) {
    const activeSession = dataState.sessionsById[nextActiveSessionId];
    const stepCount = dataState.stepsByRoutineId[activeSession.routineId]?.length ?? 0;
    const hasValidActiveRuntime =
      activeSession.status === "completed"
        ? true
        : activeSession.status === "idle"
          ? false
          : ACTIVE_RUNTIME_STATUSES.includes(activeSession.status) &&
            isValidRuntime(dataState.sessionRuntimeBySessionId[nextActiveSessionId], stepCount);

    if (!hasValidActiveRuntime) {
      nextActiveSessionId = undefined;
      if (nextActiveView === "session") {
        nextActiveView = "launcher";
      }
    }
  } else if (nextActiveView === "session") {
    nextActiveView = "launcher";
  }

  if ((nextActiveView === "review_gate" || nextActiveView === "day_review") && !nextDailyBuildingsByDate[currentGameDateKey]) {
    nextActiveView = "launcher";
  }

  return {
    dataState: {
      ...dataState,
      activeView: nextActiveView,
      selectedRoutineId: nextSelectedRoutineId,
      activeSessionId: nextActiveSessionId,
      floorsById: rebuiltAggregates.floorsById,
      dailyBuildingsByDate: nextDailyBuildingsByDate,
      townMonthsByKey: rebuildTownMonthCache({
        townMonthsByKey: dataState.townMonthsByKey,
        dailyBuildingsByDate: nextDailyBuildingsByDate,
        floorsById: rebuiltAggregates.floorsById,
        surpriseQuestsById: dataState.surpriseQuestsById,
        currentGameDateKey
      }),
      reviewSummariesById: cleanedReviewSummariesById
    },
    recovered:
      !arraysEqual(Object.keys(rebuiltAggregates.floorsById), Object.keys(dataState.floorsById)) ||
      !arraysEqual(Object.keys(nextDailyBuildingsByDate), Object.keys(dataState.dailyBuildingsByDate)) ||
      !arraysEqual(Object.keys(cleanedReviewSummariesById), Object.keys(dataState.reviewSummariesById)) ||
      nextSelectedRoutineId !== dataState.selectedRoutineId ||
      nextActiveSessionId !== dataState.activeSessionId ||
      nextActiveView !== dataState.activeView
  };
};

const buildRoutineBackupImportPreview = ({
  currentState,
  data,
  now = new Date()
}: {
  currentState: RoutineGameDataState;
  data: unknown;
  now?: Date;
}): { ok: true; preview: RoutineBackupImportPreview } | { ok: false; reason: string } => {
  const routineBackupValidation = validateRoutineBackupImportSchema(data);
  if (routineBackupValidation.ok) {
    const normalizedState = buildRoutineDataStateFromBackupState(normalizeHydratedState(routineBackupValidation.data.state));
    const repaired = repairRoutineDataState({
      dataState: normalizedState,
      currentGameDateKey: toGameDateKey(now)
    });
    const sourceFingerprint = `routine-backup-${JSON.stringify(data).length}-${Date.parse(routineBackupValidation.data.exportedAt)}`;
    const importedDateKeys = getRoutineStateDateKeys(repaired.dataState);
    const currentDateKeys = new Set(getRoutineStateDateKeys(currentState));
    const migrationMeta: RoutineMigrationMeta = {
      sourceKind: "routine_backup",
      sourceFingerprint,
      importedAt: now.toISOString(),
      importedDateCount: importedDateKeys.length,
      importedCompletedQuestCount: Object.values(repaired.dataState.sessionsById).filter((session) => isClearOrBetterGrade(session.resultGrade)).length,
      unmappedQuestCount: 0,
      warningCount: repaired.recovered ? 1 : 0,
      latestExportedAt: routineBackupValidation.data.exportedAt
    };
    const previewState = buildRoutineBackupState({
      ...repaired.dataState,
      migrationMetaBySourceFingerprint: {
        ...repaired.dataState.migrationMetaBySourceFingerprint,
        [migrationMeta.sourceFingerprint]: migrationMeta
      }
    });

    return {
      ok: true,
      preview: {
        sourceKind: "routine_backup",
        version: routineBackupValidation.data.version,
        exportedAt: routineBackupValidation.data.exportedAt,
        dateCount: importedDateKeys.length,
        earliestDate: importedDateKeys[0],
        latestDate: importedDateKeys[importedDateKeys.length - 1],
        overwriteDateCount: importedDateKeys.filter((dateKey) => currentDateKeys.has(dateKey)).length,
        newDateCount: importedDateKeys.filter((dateKey) => !currentDateKeys.has(dateKey)).length,
        hasRepairWarning: repaired.recovered,
        repairSummary: repaired.recovered ? IMPORT_RECOVERY_NOTICE : undefined,
        alreadyImported: false,
        unmappedLegacyQuestCount: 0,
        unmappedLegacyQuestTitles: [],
        state: previewState,
        migrationMeta
      }
    };
  }

  const legacyImport = buildLegacyRoutineImport({
    sourceKind: "legacy_backup",
    rawData: data,
    now
  });
  if (!legacyImport.ok) {
    return { ok: false, reason: legacyImport.reason };
  }

  const previewState = mergeLegacyImportIntoRoutineBackupState({
    baseState: buildRoutineBackupState(currentState),
    importResult: legacyImport.result
  });
  const repaired = repairRoutineDataState({
    dataState: buildRoutineDataStateFromBackupState(previewState),
    currentGameDateKey: toGameDateKey(now)
  });
  const repairedPreviewState = buildRoutineBackupState(repaired.dataState);
  const currentDateKeys = new Set(getRoutineStateDateKeys(currentState));
  const importedDateKeys = Array.from(
    new Set([
      ...Object.keys(legacyImport.result.dailyBuildingsByDate),
      ...Object.values(legacyImport.result.sessionsById).map((session) => session.dateKey)
    ])
  ).sort((left, right) => left.localeCompare(right, "en"));
  const alreadyImported = Boolean(currentState.migrationMetaBySourceFingerprint[legacyImport.result.sourceFingerprint]);

  return {
    ok: true,
    preview: {
      sourceKind: "legacy_backup",
      version: 4,
      exportedAt: legacyImport.result.exportedAt,
      dateCount: legacyImport.result.dateCount,
      earliestDate: legacyImport.result.earliestDate,
      latestDate: legacyImport.result.latestDate,
      overwriteDateCount: importedDateKeys.filter((dateKey) => currentDateKeys.has(dateKey)).length,
      newDateCount: importedDateKeys.filter((dateKey) => !currentDateKeys.has(dateKey)).length,
      hasRepairWarning: legacyImport.result.hasRepairWarning || repaired.recovered,
      repairSummary: legacyImport.result.repairSummary ?? (repaired.recovered ? IMPORT_RECOVERY_NOTICE : undefined),
      alreadyImported,
      unmappedLegacyQuestCount: legacyImport.result.unmappedLegacyQuestCount,
      unmappedLegacyQuestTitles: legacyImport.result.unmappedLegacyQuestTitles,
      state: repairedPreviewState,
      migrationMeta: legacyImport.result.migrationMeta
    }
  };
};

export const useRoutineGameStore = create<RoutineGameState>()(
  persist(
    (set, get) => {
      hydrationStatusSetter = (hasHydrated) => {
        set({ hasHydrated });
      };
      storageHealthSetter = (nextHealth) => {
        set((state) =>
          state.storageHealth.readable === nextHealth.readable &&
          state.storageHealth.writable === nextHealth.writable &&
          state.storageHealth.degraded === nextHealth.degraded &&
          state.storageHealth.lastError === nextHealth.lastError
            ? state
            : { storageHealth: nextHealth }
        );
      };
      browserStorage.subscribe((health) => {
        storageHealthSetter?.(health);
      });

      return {
        ...createInitialDataState(),
        selectedLaunchContext: undefined,
        selectedSuggestionId: undefined,
        selectedTownMonthKey: undefined,
        selectedTownDateKey: undefined,
        notificationPermission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
        lastNotifiedTriggerWindowKey: undefined,
        pendingSuggestionRequestKeys: {},
        hasHydrated: false,
        storageHealth: browserStorage.getHealth(),
        migrationNotice: undefined,
        recoveryNotice: undefined,

        syncGameDay: () => {
          const now = new Date();
          const currentGameDateKey = toGameDateKey(now);

          set((state) => {
            const rebuiltAggregates = rebuildSessionAggregates({
              sessionsById: state.sessionsById,
              routinesById: state.routinesById,
              surpriseQuestsById: state.surpriseQuestsById
            });
            const nextDailyBuildingsByDate = mergePersistedReviewState({
              rebuiltDailyBuildingsByDate: rebuiltAggregates.dailyBuildingsByDate,
              persistedDailyBuildingsByDate: state.dailyBuildingsByDate
            });
            const nextReviewSummariesById = { ...state.reviewSummariesById };
            const autoFinalizedDateKeys: string[] = [];

            Object.keys(nextDailyBuildingsByDate)
              .sort((left, right) => left.localeCompare(right, "en"))
              .forEach((dateKey) => {
                const building = nextDailyBuildingsByDate[dateKey];
                if (dateKey >= currentGameDateKey || building.finalizedAt) return;

                const finalized = finalizeDayReview({
                  dateKey,
                  building,
                  sessionsById: state.sessionsById,
                  routinesById: state.routinesById,
                  stepResultsBySessionId: state.stepResultsBySessionId,
                  stepsByRoutineId: state.stepsByRoutineId,
                  triggersByRoutineId: state.triggersByRoutineId,
                  dismissedRemainingRoutineIds: state.dismissedRemainingRoutineIdsByDate[dateKey] ?? [],
                  now
                });

                nextDailyBuildingsByDate[dateKey] = finalized.building;
                nextReviewSummariesById[finalized.reviewSummary.id] = finalized.reviewSummary;
                autoFinalizedDateKeys.push(dateKey);
              });

            const nextDismissedRemainingRoutineIdsByDate = Object.fromEntries(
              Object.entries(state.dismissedRemainingRoutineIdsByDate).filter(([dateKey]) => dateKey >= currentGameDateKey)
            );
            const referencedReviewSummaryIds = new Set(
              Object.values(nextDailyBuildingsByDate)
                .map((building) => building.reviewSummaryId)
                .filter((reviewSummaryId): reviewSummaryId is string => typeof reviewSummaryId === "string")
            );
            const cleanedReviewSummariesById = Object.fromEntries(
              Object.entries(nextReviewSummariesById).filter(([reviewSummaryId]) => referencedReviewSummaryIds.has(reviewSummaryId))
            );
            const nextAiSuggestionsById = Object.fromEntries(
              Object.entries(state.aiSuggestionsById).map(([suggestionId, suggestion]) => [
                suggestionId,
                suggestion.status === "pending" &&
                suggestion.type !== "duration_tune" &&
                suggestion.targetDateKey &&
                suggestion.targetDateKey < currentGameDateKey
                  ? markResolvedSuggestion(suggestion, now.toISOString(), "expired")
                  : suggestion
              ])
            );
            const nextSurpriseQuestsById = Object.fromEntries(
              Object.entries(state.surpriseQuestsById).map(([questId, quest]) => [
                questId,
                quest.dateKey < currentGameDateKey && quest.status === "proposed"
                  ? {
                      ...quest,
                      status: "expired" as const
                    }
                  : quest
              ])
            );
            const nextTownMonthsByKey = rebuildTownMonthCache({
              townMonthsByKey: state.townMonthsByKey,
              dailyBuildingsByDate: nextDailyBuildingsByDate,
              floorsById: rebuiltAggregates.floorsById,
              surpriseQuestsById: nextSurpriseQuestsById,
              currentGameDateKey
            });
            const shouldSyncTownSelection = state.activeView === "town" || !!state.selectedTownMonthKey;
            const nextSelectedTownMonthKey = shouldSyncTownSelection
              ? resolveTownMonth(state.selectedTownMonthKey ?? getMonthKeyFromDateKey(currentGameDateKey), currentGameDateKey)
              : state.selectedTownMonthKey;
            const nextSelectedTownDateKey = nextSelectedTownMonthKey
              ? resolveSelectedTownDate(nextSelectedTownMonthKey, currentGameDateKey, state.selectedTownDateKey, nextDailyBuildingsByDate)
              : state.selectedTownDateKey;

            const nextActiveView =
              (state.activeView === "review_gate" || state.activeView === "day_review") && !nextDailyBuildingsByDate[currentGameDateKey]
                ? "launcher"
                : state.activeView;

            return {
              floorsById: rebuiltAggregates.floorsById,
              dailyBuildingsByDate: nextDailyBuildingsByDate,
              surpriseQuestsById: nextSurpriseQuestsById,
              townMonthsByKey: nextTownMonthsByKey,
              aiSuggestionsById: nextAiSuggestionsById,
              reviewSummariesById: cleanedReviewSummariesById,
              dismissedRemainingRoutineIdsByDate: nextDismissedRemainingRoutineIdsByDate,
              activeView: nextActiveView,
              selectedTownMonthKey: nextSelectedTownMonthKey,
              selectedTownDateKey: nextSelectedTownDateKey,
              recoveryNotice:
                autoFinalizedDateKeys.length > 0
                  ? createWarningNotice(
                      "놓친 하루 리뷰를 정리했어요.",
                      `${autoFinalizedDateKeys.length}일치 past building을 자동으로 finalize했습니다.`
                    )
                  : state.recoveryNotice
            };
          });

          return currentGameDateKey;
        },

        hydrateGame: () => {
          const legacyData = browserStorage.getItem(LEGACY_QUESTOWN_STORAGE_NAME);
          if (Object.keys(get().routinesById).length === 0 && !get().hasBootstrappedDefaults) {
            get().bootstrapDefaultRoutines();
          }

          const now = new Date();
          const currentGameDateKey = toGameDateKey(now);
          let state = get();
          let recoveryNotice = state.recoveryNotice;
          let migrationNotice = state.migrationNotice;

          const completedSessionsToBackfill = Object.values(state.sessionsById)
            .filter((session) => session.status === "completed" && !session.resultGrade)
            .sort((left, right) => left.startedAt.localeCompare(right.startedAt));

          let nextDataState: RoutineGameDataState = createPersistedSlice(state);

          if (completedSessionsToBackfill.length > 0) {
            const nextSessionsById = { ...nextDataState.sessionsById };
            const nextStepResultsBySessionId = { ...nextDataState.stepResultsBySessionId };

            completedSessionsToBackfill.forEach((session) => {
              const routine = nextDataState.routinesById[session.routineId];
              const steps = nextDataState.stepsByRoutineId[session.routineId] ?? [];
              const stepResults = nextStepResultsBySessionId[session.id] ?? [];
              if (!routine || steps.length === 0 || stepResults.length === 0) return;

              const { scoring, scoredStepResults } = applyScoringToCompletedSession({
                routine,
                session,
                steps,
                stepResults,
                allSessions: Object.values(nextSessionsById)
              });

              nextSessionsById[session.id] = buildScoredSession({ session, scoring });
              nextStepResultsBySessionId[session.id] = scoredStepResults;
            });

            nextDataState = {
              ...nextDataState,
              sessionsById: nextSessionsById,
              stepResultsBySessionId: nextStepResultsBySessionId
            };
            recoveryNotice = createWarningNotice("누락된 세션 점수를 복구했어요.", HYDRATION_RECOVERY_NOTICE);
          }

          if (legacyData) {
            const legacyImport = buildLegacyRoutineImport({
              sourceKind: "legacy_local_storage",
              rawData: legacyData,
              now
            });

            if (!legacyImport.ok) {
              recoveryNotice = createWarningNotice("기존 Questown 기록을 읽지 못했어요.", legacyImport.reason);
            } else if (!nextDataState.migrationMetaBySourceFingerprint[legacyImport.result.sourceFingerprint]) {
              const mergedBackupState = mergeLegacyImportIntoRoutineBackupState({
                baseState: buildRoutineBackupState(nextDataState),
                importResult: legacyImport.result
              });
              nextDataState = buildRoutineDataStateFromBackupState(mergedBackupState);
              migrationNotice = createInfoNotice(
                "기존 Questown 기록을 옮겼어요.",
                `${legacyImport.result.migrationMeta.importedCompletedQuestCount}개 완료 기록을 routine history로 가져왔습니다.`
              );
              if (legacyImport.result.hasRepairWarning) {
                recoveryNotice = createWarningNotice("기존 기록 일부를 자동 복구했어요.", legacyImport.result.repairSummary ?? HYDRATION_RECOVERY_NOTICE);
              }
            }
          }

          let repaired = repairRoutineDataState({
            dataState: nextDataState,
            currentGameDateKey
          });
          nextDataState = repaired.dataState;
          if (repaired.recovered && !recoveryNotice) {
            recoveryNotice = createWarningNotice("저장된 routine 데이터를 복구했어요.", HYDRATION_RECOVERY_NOTICE);
          }

          let activeView = nextDataState.activeView === "debug" ? "launcher" : nextDataState.activeView;
          if (activeView === "prelaunch" && !nextDataState.selectedRoutineId) {
            activeView = nextDataState.activeSessionId ? "session" : "launcher";
          }
          if (!nextDataState.activeSessionId && activeView === "session") {
            activeView = "launcher";
          }
          nextDataState = {
            ...nextDataState,
            activeView
          };

          const nextSelectedTownMonthKey =
            state.activeView === "town" || state.selectedTownMonthKey
              ? resolveTownMonth(state.selectedTownMonthKey ?? getMonthKeyFromDateKey(currentGameDateKey), currentGameDateKey)
              : state.selectedTownMonthKey;
          const nextSelectedTownDateKey = nextSelectedTownMonthKey
            ? resolveSelectedTownDate(nextSelectedTownMonthKey, currentGameDateKey, state.selectedTownDateKey, nextDataState.dailyBuildingsByDate)
            : state.selectedTownDateKey;

          state = get();
          set({
            ...nextDataState,
            selectedTownMonthKey: nextSelectedTownMonthKey,
            selectedTownDateKey: nextSelectedTownDateKey,
            storageHealth: browserStorage.getHealth(),
            migrationNotice,
            recoveryNotice
          });

          get().syncGameDay();
        },

        bootstrapDefaultRoutines: () => {
          const seed = createDefaultRoutineSeed();

          set((state) => {
            const routinesById = { ...state.routinesById };
            const stepsByRoutineId = { ...state.stepsByRoutineId };
            const triggersByRoutineId = { ...state.triggersByRoutineId };
            let changed = false;

            Object.entries(seed.routinesById).forEach(([id, routine]) => {
              if (!routinesById[id]) {
                routinesById[id] = routine;
                changed = true;
              }
            });

            Object.entries(seed.stepsByRoutineId).forEach(([routineId, steps]) => {
              if (!stepsByRoutineId[routineId]) {
                stepsByRoutineId[routineId] = steps;
                changed = true;
              }
            });

            Object.entries(seed.triggersByRoutineId).forEach(([routineId, triggers]) => {
              if (!triggersByRoutineId[routineId]) {
                triggersByRoutineId[routineId] = triggers;
                changed = true;
              }
            });

            const selectedRoutineId = state.selectedRoutineId ?? routinesById[MORNING_ROUTINE_ID]?.id ?? Object.keys(routinesById)[0];
            const shouldUpdateSelection = selectedRoutineId !== state.selectedRoutineId;
            const hasBootstrappedDefaults = true;

            if (!changed && !shouldUpdateSelection && state.hasBootstrappedDefaults === hasBootstrappedDefaults) {
              return state;
            }

            return {
              routinesById,
              stepsByRoutineId,
              triggersByRoutineId,
              selectedRoutineId,
              hasBootstrappedDefaults
            };
          });
        },

        selectRoutine: (routineId) =>
          set({
            selectedRoutineId: routineId
          }),

        openRoutinePrelaunch: (launchContext, sourceSuggestionId) => {
          get().syncGameDay();
          set((state) =>
            state.routinesById[launchContext.routineId]
              ? {
                  selectedRoutineId: launchContext.routineId,
                  selectedLaunchContext: launchContext,
                  selectedSuggestionId: sourceSuggestionId,
                  activeView: "prelaunch"
                }
              : state
          );
        },

        openTodayReview: () => {
          const currentGameDateKey = get().syncGameDay();
          const state = get();
          const building = state.dailyBuildingsByDate[currentGameDateKey];
          if (!building || building.successfulSessionCount === 0) return;

          const remainingRoutines = getRemainingReviewRoutines({
            routinesById: state.routinesById,
            triggersByRoutineId: state.triggersByRoutineId,
            sessionsById: state.sessionsById,
            dismissedRoutineIds: state.dismissedRemainingRoutineIdsByDate[currentGameDateKey] ?? []
          });

          set({
            activeView: remainingRoutines.length > 0 ? "review_gate" : "day_review"
          });
        },

        openTownView: () => {
          const currentGameDateKey = get().syncGameDay();

          set((state) => ({
            activeView: "town",
            selectedTownMonthKey: getMonthKeyFromDateKey(currentGameDateKey),
            selectedTownDateKey: currentGameDateKey,
            townMonthsByKey: rebuildTownMonthCache({
              townMonthsByKey: state.townMonthsByKey,
              dailyBuildingsByDate: state.dailyBuildingsByDate,
              floorsById: state.floorsById,
              surpriseQuestsById: state.surpriseQuestsById,
              currentGameDateKey,
              extraMonthKeys: [getMonthKeyFromDateKey(currentGameDateKey)]
            })
          }));
        },

        closeTownView: () => {
          get().syncGameDay();
          set({ activeView: "launcher" });
        },

        openManageView: () => {
          get().syncGameDay();
          set({ activeView: "manage" });
        },

        closeManageView: () => {
          get().syncGameDay();
          set({ activeView: "launcher" });
        },

        returnToLauncher: () => {
          get().syncGameDay();
          set({
            activeView: "launcher",
            selectedLaunchContext: undefined,
            selectedSuggestionId: undefined
          });
        },

        openActiveSession: () =>
          set((state) => {
            if (!state.activeSessionId) {
              return { activeView: "launcher" };
            }

            const activeSession = state.sessionsById[state.activeSessionId];
            if (!activeSession) {
              return { activeView: "launcher", activeSessionId: undefined };
            }

            if (activeSession.status === "completed") {
              return { activeView: "session" };
            }

            const stepCount = state.stepsByRoutineId[activeSession.routineId]?.length ?? 0;
            const runtime = state.sessionRuntimeBySessionId[state.activeSessionId];

            return isValidRuntime(runtime, stepCount)
              ? { activeView: "session" }
              : { activeView: "launcher", activeSessionId: undefined };
          }),

        selectTownMonth: (monthKey) => {
          const currentGameDateKey = get().syncGameDay();

          set((state) => {
            const nextSelectedTownMonthKey = resolveTownMonth(monthKey, currentGameDateKey);
            return {
              selectedTownMonthKey: nextSelectedTownMonthKey,
              selectedTownDateKey: resolveSelectedTownDate(
                nextSelectedTownMonthKey,
                currentGameDateKey,
                nextSelectedTownMonthKey === state.selectedTownMonthKey ? state.selectedTownDateKey : undefined,
                state.dailyBuildingsByDate
              ),
              townMonthsByKey: rebuildTownMonthCache({
                townMonthsByKey: state.townMonthsByKey,
                dailyBuildingsByDate: state.dailyBuildingsByDate,
                floorsById: state.floorsById,
                surpriseQuestsById: state.surpriseQuestsById,
                currentGameDateKey,
                extraMonthKeys: [nextSelectedTownMonthKey]
              })
            };
          });
        },

        selectTownDate: (dateKey) => {
          const currentGameDateKey = get().syncGameDay();

          set((state) => {
            const selectedTownMonthKey = resolveTownMonth(
              state.selectedTownMonthKey ?? getMonthKeyFromDateKey(currentGameDateKey),
              currentGameDateKey
            );

            return {
              selectedTownMonthKey,
              selectedTownDateKey: resolveSelectedTownDate(
                selectedTownMonthKey,
                currentGameDateKey,
                dateKey,
                state.dailyBuildingsByDate
              )
            };
          });
        },

        ensureTownMonthSnapshot: (monthKey) => {
          const currentGameDateKey = get().syncGameDay();
          const state = get();
          const nextMonthKey = resolveTownMonth(
            monthKey ?? state.selectedTownMonthKey ?? getMonthKeyFromDateKey(currentGameDateKey),
            currentGameDateKey
          );
          const nextTownMonthsByKey = rebuildTownMonthCache({
            townMonthsByKey: state.townMonthsByKey,
            dailyBuildingsByDate: state.dailyBuildingsByDate,
            floorsById: state.floorsById,
            surpriseQuestsById: state.surpriseQuestsById,
            currentGameDateKey,
            extraMonthKeys: [nextMonthKey]
          });

          set({
            townMonthsByKey: nextTownMonthsByKey
          });

          return nextTownMonthsByKey[nextMonthKey];
        },

        dismissRemainingRoutineForToday: (routineId) => {
          const currentGameDateKey = get().syncGameDay();
          set((state) => ({
            dismissedRemainingRoutineIdsByDate: {
              ...state.dismissedRemainingRoutineIdsByDate,
              [currentGameDateKey]: Array.from(
                new Set([...(state.dismissedRemainingRoutineIdsByDate[currentGameDateKey] ?? []), routineId])
              )
            }
          }));
        },

        clearDismissedRemainingRoutineForToday: (routineId) => {
          const currentGameDateKey = get().syncGameDay();
          set((state) => ({
            dismissedRemainingRoutineIdsByDate: {
              ...state.dismissedRemainingRoutineIdsByDate,
              [currentGameDateKey]: (state.dismissedRemainingRoutineIdsByDate[currentGameDateKey] ?? []).filter(
                (candidate) => candidate !== routineId
              )
            }
          }));
        },

        startRoutineSession: (launchContext) => {
          get().syncGameDay();
          const state = get();
          const routineId = launchContext.routineId;
          const routine = state.routinesById[routineId];
          if (!routine) return { ok: false, reason: "루틴을 찾을 수 없어요." };
          if (!routine.isEnabled) return { ok: false, reason: "비활성화된 루틴이에요." };
          if (state.activeSessionId && state.sessionsById[state.activeSessionId]) {
            return { ok: false, reason: "이미 진행 중인 세션이 있어요." };
          }
          const steps = state.stepsByRoutineId[routineId] ?? [];
          if (steps.length === 0) {
            return { ok: false, reason: "step이 없는 루틴은 시작할 수 없어요." };
          }

          const triggers = state.triggersByRoutineId[routineId] ?? [];
          const hasTrigger = triggers.some((trigger) => trigger.triggerType === launchContext.triggerSource && trigger.isEnabled);
          if (!hasTrigger) {
            return { ok: false, reason: "해당 방식으로 시작할 수 없는 루틴이에요." };
          }
          const availability = getRoutineLaunchAvailability({ launchContext, triggers });
          if (!availability.canStartNow) {
            return { ok: false, reason: availability.blockedReason };
          }

          const sessionId = createQuestownId();
          const nowIso = new Date().toISOString();
          const session: RoutineSession = {
            id: sessionId,
            routineId,
            dateKey: toGameDateKey(),
            startedAt: nowIso,
            triggerSource: launchContext.triggerSource,
            status: "active_step",
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
            aiSuggestionId: state.selectedSuggestionId
          };
          const runtime: SessionRuntime = {
            sessionId,
            currentStepIndex: 0,
            stepStartedAt: nowIso,
            accumulatedPauseMs: 0,
            currentComboCount: 0,
            graceUsed: false,
            currentStepPauseCount: 0
          };

          set((current) => ({
            sessionsById: {
              ...current.sessionsById,
              [sessionId]: session
            },
            sessionRuntimeBySessionId: {
              ...current.sessionRuntimeBySessionId,
              [sessionId]: runtime
            },
            stepResultsBySessionId: {
              ...current.stepResultsBySessionId,
              [sessionId]: []
            },
            activeSessionId: sessionId,
            selectedRoutineId: routineId,
            selectedLaunchContext: launchContext,
            selectedSuggestionId: undefined,
            aiSuggestionsById:
              current.selectedSuggestionId && current.aiSuggestionsById[current.selectedSuggestionId]
                ? {
                    ...current.aiSuggestionsById,
                    [current.selectedSuggestionId]: {
                      ...markResolvedSuggestion(
                        current.aiSuggestionsById[current.selectedSuggestionId],
                        nowIso,
                        "applied"
                      )
                    }
                  }
                : current.aiSuggestionsById,
            activeView: "session"
          }));

          return { ok: true, sessionId };
        },

        pauseActiveSession: () => {
          const state = get();
          const sessionId = state.activeSessionId;
          if (!sessionId) return { ok: false, reason: "진행 중인 세션이 없어요." };

          const session = state.sessionsById[sessionId];
          const runtime = state.sessionRuntimeBySessionId[sessionId];
          if (!session || !runtime) return { ok: false, reason: "세션 런타임을 찾을 수 없어요." };
          if (session.status !== "active_step") return { ok: false, reason: "지금은 일시정지할 수 없어요." };

          const pausedAt = new Date().toISOString();
          set((current) => ({
            sessionsById: {
              ...current.sessionsById,
              [sessionId]: {
                ...session,
                status: "paused",
                pausedCount: session.pausedCount + 1
              }
            },
            sessionRuntimeBySessionId: {
              ...current.sessionRuntimeBySessionId,
              [sessionId]: {
                ...runtime,
                pausedAt,
                currentStepPauseCount: runtime.currentStepPauseCount + 1
              }
            }
          }));

          return { ok: true };
        },

        resumeActiveSession: () => {
          const state = get();
          const sessionId = state.activeSessionId;
          if (!sessionId) return { ok: false, reason: "진행 중인 세션이 없어요." };

          const session = state.sessionsById[sessionId];
          const runtime = state.sessionRuntimeBySessionId[sessionId];
          if (!session || !runtime) return { ok: false, reason: "세션 런타임을 찾을 수 없어요." };
          if (session.status !== "paused" || !runtime.pausedAt) return { ok: false, reason: "일시정지된 세션이 없어요." };

          const now = new Date();
          const pausedAtMs = parseTimestamp(runtime.pausedAt);
          const pauseDurationMs = Number.isNaN(pausedAtMs) ? 0 : Math.max(0, now.getTime() - pausedAtMs);

          set((current) => ({
            sessionsById: {
              ...current.sessionsById,
              [sessionId]: {
                ...session,
                status: "active_step"
              }
            },
            sessionRuntimeBySessionId: {
              ...current.sessionRuntimeBySessionId,
              [sessionId]: {
                ...runtime,
                pausedAt: undefined,
                accumulatedPauseMs: runtime.accumulatedPauseMs + pauseDurationMs
              }
            }
          }));

          return { ok: true };
        },

        completeCurrentStep: () => {
          const state = get();
          const sessionId = state.activeSessionId;
          if (!sessionId) return { ok: false, reason: "진행 중인 세션이 없어요." };

          const session = state.sessionsById[sessionId];
          const runtime = state.sessionRuntimeBySessionId[sessionId];
          if (!session || !runtime) return { ok: false, reason: "세션 런타임을 찾을 수 없어요." };
          if (session.status !== "active_step") return { ok: false, reason: "현재 step을 완료할 수 없어요." };
          const routine = state.routinesById[session.routineId];
          if (!routine) return { ok: false, reason: "루틴을 찾을 수 없어요." };

          const steps = state.stepsByRoutineId[session.routineId] ?? [];
          const currentStep = steps[runtime.currentStepIndex];
          if (!currentStep) return { ok: false, reason: "현재 step을 찾을 수 없어요." };

          const now = new Date();
          const nowIso = now.toISOString();
          const elapsedMs = getElapsedMs(runtime, now);
          const result = buildStepResultStatus(elapsedMs, currentStep.recommendedDurationSec, runtime.graceUsed);
          const nextCombo = getNextComboCount(runtime.currentComboCount, result.status);
          const stepResult: SessionStepResult = {
            id: createQuestownId(),
            sessionId,
            stepId: currentStep.id,
            order: currentStep.order,
            status: result.status,
            startedAt: runtime.stepStartedAt,
            endedAt: nowIso,
            elapsedSec: Math.max(0, Math.round(elapsedMs / 1000)),
            targetDurationSec: currentStep.recommendedDurationSec,
            overtimeSec: Math.max(0, Math.round((elapsedMs - currentStep.recommendedDurationSec * 1000) / 1000)),
            pauseCount: runtime.currentStepPauseCount,
            comboIndexAfterStep: nextCombo,
            scoreEarned: 0
          };
          const isLastStep = runtime.currentStepIndex >= steps.length - 1;

          if (isLastStep) {
            const completedSession: RoutineSession = {
              ...session,
              status: "completed",
              endedAt: nowIso,
              completedStepCount: session.completedStepCount + 1,
              wasGraceApplied: session.wasGraceApplied || result.usedGrace
            };
            const completedStepResults = [...(state.stepResultsBySessionId[sessionId] ?? []), stepResult];
            const { scoring, scoredStepResults } = applyScoringToCompletedSession({
              routine,
              session: completedSession,
              steps,
              stepResults: completedStepResults,
              allSessions: [...Object.values(state.sessionsById).filter((candidate) => candidate.id !== sessionId), completedSession]
            });
            const scoredSession = buildScoredSession({
              session: completedSession,
              scoring
            });
            const nextSessionsById = {
              ...state.sessionsById,
              [sessionId]: scoredSession
            };
            const rebuiltAggregates = rebuildSessionAggregates({
              sessionsById: nextSessionsById,
              routinesById: state.routinesById,
              surpriseQuestsById: state.surpriseQuestsById
            });
            const existingBuilding = state.dailyBuildingsByDate[completedSession.dateKey];
            const shouldInvalidateReview = isClearOrBetterGrade(scoring.resultGrade) && !!existingBuilding?.finalizedAt;
            const invalidatedReviewSummaryId = shouldInvalidateReview ? existingBuilding?.reviewSummaryId : undefined;
            const nextDailyBuilding =
              shouldInvalidateReview && rebuiltAggregates.dailyBuildingsByDate[completedSession.dateKey]
                ? {
                    ...rebuiltAggregates.dailyBuildingsByDate[completedSession.dateKey],
                    roofType: "none" as const,
                    reviewSummaryId: undefined,
                    finalizedAt: undefined
                  }
                : rebuiltAggregates.dailyBuildingsByDate[completedSession.dateKey];
            const nextTownMonthsByKey = rebuildTownMonthCache({
              townMonthsByKey: state.townMonthsByKey,
              dailyBuildingsByDate: {
                ...rebuiltAggregates.dailyBuildingsByDate,
                ...(nextDailyBuilding ? { [completedSession.dateKey]: nextDailyBuilding } : {})
              },
              floorsById: rebuiltAggregates.floorsById,
              surpriseQuestsById: state.surpriseQuestsById,
              currentGameDateKey: completedSession.dateKey
            });

            set((current) => ({
              sessionsById: {
                ...current.sessionsById,
                [sessionId]: scoredSession
              },
              sessionRuntimeBySessionId: {
                ...current.sessionRuntimeBySessionId,
                [sessionId]: {
                  ...runtime,
                  currentComboCount: nextCombo,
                  graceUsed: runtime.graceUsed || result.usedGrace
                }
              },
              stepResultsBySessionId: {
                ...current.stepResultsBySessionId,
                [sessionId]: scoredStepResults
              },
              floorsById: rebuiltAggregates.floorsById,
              dailyBuildingsByDate: {
                ...rebuiltAggregates.dailyBuildingsByDate,
                ...(nextDailyBuilding ? { [completedSession.dateKey]: nextDailyBuilding } : {})
              },
              townMonthsByKey: nextTownMonthsByKey,
              reviewSummariesById:
                shouldInvalidateReview && invalidatedReviewSummaryId
                  ? Object.fromEntries(
                      Object.entries(current.reviewSummariesById).filter(([reviewSummaryId]) => reviewSummaryId !== invalidatedReviewSummaryId)
                    )
                  : current.reviewSummariesById
            }));

            return { ok: true, completedSession: true };
          }

          set((current) => ({
            sessionsById: {
              ...current.sessionsById,
              [sessionId]: {
                ...session,
                status: "active_step",
                completedStepCount: session.completedStepCount + 1,
                wasGraceApplied: session.wasGraceApplied || result.usedGrace
              }
            },
            sessionRuntimeBySessionId: {
              ...current.sessionRuntimeBySessionId,
              [sessionId]: {
                ...runtime,
                currentStepIndex: runtime.currentStepIndex + 1,
                stepStartedAt: nowIso,
                pausedAt: undefined,
                accumulatedPauseMs: 0,
                currentComboCount: nextCombo,
                graceUsed: runtime.graceUsed || result.usedGrace,
                currentStepPauseCount: 0
              }
            },
            stepResultsBySessionId: {
              ...current.stepResultsBySessionId,
              [sessionId]: [...(current.stepResultsBySessionId[sessionId] ?? []), stepResult]
            }
          }));

          return { ok: true, completedSession: false };
        },

        skipCurrentStep: () => {
          const state = get();
          const sessionId = state.activeSessionId;
          if (!sessionId) return { ok: false, reason: "진행 중인 세션이 없어요." };

          const session = state.sessionsById[sessionId];
          const runtime = state.sessionRuntimeBySessionId[sessionId];
          if (!session || !runtime) return { ok: false, reason: "세션 런타임을 찾을 수 없어요." };
          if (session.status !== "active_step") return { ok: false, reason: "지금은 skip할 수 없어요." };
          const routine = state.routinesById[session.routineId];
          if (!routine) return { ok: false, reason: "루틴을 찾을 수 없어요." };

          const steps = state.stepsByRoutineId[session.routineId] ?? [];
          const currentStep = steps[runtime.currentStepIndex];
          if (!currentStep) return { ok: false, reason: "현재 step을 찾을 수 없어요." };

          const now = new Date();
          const nowIso = now.toISOString();
          const elapsedMs = getElapsedMs(runtime, now);
          const stepResult: SessionStepResult = {
            id: createQuestownId(),
            sessionId,
            stepId: currentStep.id,
            order: currentStep.order,
            status: "skipped",
            startedAt: runtime.stepStartedAt,
            endedAt: nowIso,
            elapsedSec: Math.max(0, Math.round(elapsedMs / 1000)),
            targetDurationSec: currentStep.recommendedDurationSec,
            overtimeSec: Math.max(0, Math.round((elapsedMs - currentStep.recommendedDurationSec * 1000) / 1000)),
            pauseCount: runtime.currentStepPauseCount,
            comboIndexAfterStep: 0,
            scoreEarned: 0
          };
          const isLastStep = runtime.currentStepIndex >= steps.length - 1;

          if (isLastStep) {
            const completedSession: RoutineSession = {
              ...session,
              status: "completed",
              endedAt: nowIso,
              skippedStepCount: session.skippedStepCount + 1
            };
            const completedStepResults = [...(state.stepResultsBySessionId[sessionId] ?? []), stepResult];
            const { scoring, scoredStepResults } = applyScoringToCompletedSession({
              routine,
              session: completedSession,
              steps,
              stepResults: completedStepResults,
              allSessions: [...Object.values(state.sessionsById).filter((candidate) => candidate.id !== sessionId), completedSession]
            });
            const scoredSession = buildScoredSession({
              session: completedSession,
              scoring
            });
            const nextSessionsById = {
              ...state.sessionsById,
              [sessionId]: scoredSession
            };
            const rebuiltAggregates = rebuildSessionAggregates({
              sessionsById: nextSessionsById,
              routinesById: state.routinesById,
              surpriseQuestsById: state.surpriseQuestsById
            });
            const existingBuilding = state.dailyBuildingsByDate[completedSession.dateKey];
            const shouldInvalidateReview = isClearOrBetterGrade(scoring.resultGrade) && !!existingBuilding?.finalizedAt;
            const invalidatedReviewSummaryId = shouldInvalidateReview ? existingBuilding?.reviewSummaryId : undefined;
            const nextDailyBuilding =
              shouldInvalidateReview && rebuiltAggregates.dailyBuildingsByDate[completedSession.dateKey]
                ? {
                    ...rebuiltAggregates.dailyBuildingsByDate[completedSession.dateKey],
                    roofType: "none" as const,
                    reviewSummaryId: undefined,
                    finalizedAt: undefined
                  }
                : rebuiltAggregates.dailyBuildingsByDate[completedSession.dateKey];
            const nextTownMonthsByKey = rebuildTownMonthCache({
              townMonthsByKey: state.townMonthsByKey,
              dailyBuildingsByDate: {
                ...rebuiltAggregates.dailyBuildingsByDate,
                ...(nextDailyBuilding ? { [completedSession.dateKey]: nextDailyBuilding } : {})
              },
              floorsById: rebuiltAggregates.floorsById,
              surpriseQuestsById: state.surpriseQuestsById,
              currentGameDateKey: completedSession.dateKey
            });

            set((current) => ({
              sessionsById: {
                ...current.sessionsById,
                [sessionId]: scoredSession
              },
              sessionRuntimeBySessionId: {
                ...current.sessionRuntimeBySessionId,
                [sessionId]: {
                  ...runtime,
                  currentComboCount: 0
                }
              },
              stepResultsBySessionId: {
                ...current.stepResultsBySessionId,
                [sessionId]: scoredStepResults
              },
              floorsById: rebuiltAggregates.floorsById,
              dailyBuildingsByDate: {
                ...rebuiltAggregates.dailyBuildingsByDate,
                ...(nextDailyBuilding ? { [completedSession.dateKey]: nextDailyBuilding } : {})
              },
              townMonthsByKey: nextTownMonthsByKey,
              reviewSummariesById:
                shouldInvalidateReview && invalidatedReviewSummaryId
                  ? Object.fromEntries(
                      Object.entries(current.reviewSummariesById).filter(([reviewSummaryId]) => reviewSummaryId !== invalidatedReviewSummaryId)
                    )
                  : current.reviewSummariesById
            }));

            return { ok: true, completedSession: true };
          }

          set((current) => ({
            sessionsById: {
              ...current.sessionsById,
              [sessionId]: {
                ...session,
                status: "active_step",
                skippedStepCount: session.skippedStepCount + 1
              }
            },
            sessionRuntimeBySessionId: {
              ...current.sessionRuntimeBySessionId,
              [sessionId]: {
                ...runtime,
                currentStepIndex: runtime.currentStepIndex + 1,
                stepStartedAt: nowIso,
                pausedAt: undefined,
                accumulatedPauseMs: 0,
                currentComboCount: 0,
                currentStepPauseCount: 0
              }
            },
            stepResultsBySessionId: {
              ...current.stepResultsBySessionId,
              [sessionId]: [...(current.stepResultsBySessionId[sessionId] ?? []), stepResult]
            }
          }));

          return { ok: true, completedSession: false };
        },

        dismissCompletedSession: () => {
          const currentGameDateKey = get().syncGameDay();
          const state = get();

          if (!state.activeSessionId) {
            set({ activeView: "launcher" });
            return;
          }

          const sessionId = state.activeSessionId;
          const activeSession = state.sessionsById[sessionId];
          const nextRuntime = { ...state.sessionRuntimeBySessionId };
          delete nextRuntime[sessionId];

          const reviewedSession =
            activeSession?.status === "completed"
              ? {
                  ...activeSession,
                  status: "reviewed" as const
                }
              : activeSession;
          const nextSessionsById =
            reviewedSession && activeSession?.status === "completed"
              ? {
                  ...state.sessionsById,
                  [sessionId]: reviewedSession
                }
              : state.sessionsById;

          let nextActiveView: GameActiveView = "launcher";
          if (
            reviewedSession &&
            reviewedSession.dateKey === currentGameDateKey &&
            isClearOrBetterGrade(reviewedSession.resultGrade) &&
            state.routinesById[reviewedSession.routineId]?.sessionRole === "day_closer"
          ) {
            const remainingRoutines = getRemainingReviewRoutines({
              routinesById: state.routinesById,
              triggersByRoutineId: state.triggersByRoutineId,
              sessionsById: nextSessionsById,
              dismissedRoutineIds: state.dismissedRemainingRoutineIdsByDate[currentGameDateKey] ?? []
            });
            nextActiveView = remainingRoutines.length > 0 ? "review_gate" : "day_review";
          }

          set({
            activeSessionId: undefined,
            activeView: nextActiveView,
            selectedRoutineId: activeSession?.routineId ?? state.selectedRoutineId,
            sessionsById: nextSessionsById,
            sessionRuntimeBySessionId: nextRuntime
          });
        },

        requestLauncherSuggestions: async () => {
          get().syncGameDay();
          const now = new Date();
          const request = buildLauncherSuggestionRequest(get(), now);
          const requestKey = buildSuggestionRequestKey(request);
          if (get().pendingSuggestionRequestKeys[requestKey]) return;

          const fallback = buildFallbackResponseForRequest(request);
          set((current) => ({
            ...mergeSuggestionResponseIntoState({ current, response: fallback }),
            pendingSuggestionRequestKeys: {
              ...current.pendingSuggestionRequestKeys,
              [requestKey]: true
            }
          }));

          try {
            const response = await requestAiSuggestionRoute(request);
            set((current) => ({
              ...(response.responseSource === "ai"
                ? mergeSuggestionResponseIntoState({ current, response })
                : {}),
              pendingSuggestionRequestKeys: omitRecordKey(current.pendingSuggestionRequestKeys, requestKey)
            }));
          } catch {
            set((current) => ({
              pendingSuggestionRequestKeys: omitRecordKey(current.pendingSuggestionRequestKeys, requestKey)
            }));
          }
        },

        requestDurationSuggestion: async (sessionId) => {
          get().syncGameDay();
          const now = new Date();
          const request = buildDurationTuneSuggestionRequest(get(), sessionId, now);
          if (!request) return;
          const requestKey = buildSuggestionRequestKey(request);
          if (get().pendingSuggestionRequestKeys[requestKey]) return;

          const fallback = buildFallbackResponseForRequest(request);
          set((current) => ({
            ...mergeSuggestionResponseIntoState({ current, response: fallback }),
            pendingSuggestionRequestKeys: {
              ...current.pendingSuggestionRequestKeys,
              [requestKey]: true
            }
          }));

          try {
            const response = await requestAiSuggestionRoute(request);
            set((current) => ({
              ...(response.responseSource === "ai"
                ? mergeSuggestionResponseIntoState({ current, response })
                : {}),
              pendingSuggestionRequestKeys: omitRecordKey(current.pendingSuggestionRequestKeys, requestKey)
            }));
          } catch {
            set((current) => ({
              pendingSuggestionRequestKeys: omitRecordKey(current.pendingSuggestionRequestKeys, requestKey)
            }));
          }
        },

        requestReviewSuggestion: async (dateKey) => {
          get().syncGameDay();
          const now = new Date();
          const effectiveDateKey = dateKey ?? toGameDateKey(now);
          const currentState = get();
          const building = currentState.dailyBuildingsByDate[effectiveDateKey];
          if (!building || building.finalizedAt) return;

          const request = buildReviewSuggestionRequest(currentState, effectiveDateKey, now);
          if (!request) return;
          const requestKey = buildSuggestionRequestKey(request);
          if (get().pendingSuggestionRequestKeys[requestKey]) return;

          const fallback = buildFallbackResponseForRequest(request);
          set((current) => ({
            ...mergeSuggestionResponseIntoState({ current, response: fallback }),
            pendingSuggestionRequestKeys: {
              ...current.pendingSuggestionRequestKeys,
              [requestKey]: true
            }
          }));

          try {
            const response = await requestAiSuggestionRoute(request);
            set((current) => ({
              ...(response.responseSource === "ai"
                ? mergeSuggestionResponseIntoState({ current, response })
                : {}),
              pendingSuggestionRequestKeys: omitRecordKey(current.pendingSuggestionRequestKeys, requestKey)
            }));
          } catch {
            set((current) => ({
              pendingSuggestionRequestKeys: omitRecordKey(current.pendingSuggestionRequestKeys, requestKey)
            }));
          }
        },

        applyAiSuggestion: (suggestionId) => {
          const state = get();
          const suggestion = state.aiSuggestionsById[suggestionId];
          if (!suggestion) return { ok: false, reason: "적용할 suggestion이 없어요." };
          const resolvedAt = new Date().toISOString();

          if (suggestion.type === "duration_tune" && suggestion.payload.kind === "duration_tune") {
            const payload = suggestion.payload;
            const steps = state.stepsByRoutineId[payload.routineId] ?? [];
            const targetIndex = steps.findIndex((step) => step.id === payload.stepId);
            if (targetIndex < 0) return { ok: false, reason: "조정할 step을 찾지 못했어요." };

            const nextSteps = steps.map((step, index) =>
              index === targetIndex ? { ...step, recommendedDurationSec: payload.proposedDurationSec } : step
            );
            const nextEstimatedDurationSec = nextSteps.reduce((sum, step) => sum + step.recommendedDurationSec, 0);

            set((current) => ({
              stepsByRoutineId: {
                ...current.stepsByRoutineId,
                [payload.routineId]: nextSteps
              },
              routinesById: {
                ...current.routinesById,
                [payload.routineId]: {
                  ...current.routinesById[payload.routineId],
                  estimatedDurationSec: nextEstimatedDurationSec
                }
              },
              aiSuggestionsById: {
                ...current.aiSuggestionsById,
                [suggestionId]: {
                  ...markResolvedSuggestion(current.aiSuggestionsById[suggestionId], resolvedAt, "applied")
                }
              }
            }));

            return { ok: true };
          }

          set((current) => ({
            aiSuggestionsById: {
              ...current.aiSuggestionsById,
              [suggestionId]: {
                ...markResolvedSuggestion(current.aiSuggestionsById[suggestionId], resolvedAt, "applied")
              }
            }
          }));

          return { ok: true };
        },

        dismissAiSuggestion: (suggestionId) => {
          const suggestion = get().aiSuggestionsById[suggestionId];
          if (!suggestion) return { ok: false, reason: "dismiss할 suggestion이 없어요." };
          if (suggestion.type === "surprise_quest") return { ok: false, reason: "surprise quest는 별도 액션으로 정리해 주세요." };
          const resolvedAt = new Date().toISOString();

          set((current) => ({
            aiSuggestionsById: {
              ...current.aiSuggestionsById,
              [suggestionId]: {
                ...markResolvedSuggestion(current.aiSuggestionsById[suggestionId], resolvedAt, "dismissed")
              }
            }
          }));

          return { ok: true };
        },

        acceptSurpriseQuest: (questId) => {
          const quest = get().surpriseQuestsById[questId];
          if (!quest) return { ok: false, reason: "accept할 surprise quest가 없어요." };

          const acceptedAt = new Date().toISOString();
          set((current) => ({
            surpriseQuestsById: {
              ...current.surpriseQuestsById,
              [questId]: {
                ...current.surpriseQuestsById[questId],
                status: "accepted",
                acceptedAt
              }
            },
            aiSuggestionsById:
              quest.sourceSuggestionId && current.aiSuggestionsById[quest.sourceSuggestionId]
                ? {
                    ...current.aiSuggestionsById,
                    [quest.sourceSuggestionId]: {
                      ...markResolvedSuggestion(current.aiSuggestionsById[quest.sourceSuggestionId], acceptedAt, "applied")
                    }
                  }
                : current.aiSuggestionsById
          }));

          return { ok: true };
        },

        completeSurpriseQuest: (questId) => {
          const quest = get().surpriseQuestsById[questId];
          if (!quest) return { ok: false, reason: "완료할 surprise quest가 없어요." };

          const completedAt = new Date().toISOString();
          const currentGameDateKey = toGameDateKey(new Date(completedAt));

          set((current) => {
            const surpriseQuestsById = {
              ...current.surpriseQuestsById,
              [questId]: {
                ...current.surpriseQuestsById[questId],
                status: "completed" as const,
                completedAt
              }
            };
            const rebuiltAggregates = rebuildSessionAggregates({
              sessionsById: current.sessionsById,
              routinesById: current.routinesById,
              surpriseQuestsById
            });
            const dailyBuildingsByDate = mergePersistedReviewState({
              rebuiltDailyBuildingsByDate: rebuiltAggregates.dailyBuildingsByDate,
              persistedDailyBuildingsByDate: current.dailyBuildingsByDate
            });

            return {
              surpriseQuestsById,
              floorsById: rebuiltAggregates.floorsById,
              dailyBuildingsByDate,
              townMonthsByKey: rebuildTownMonthCache({
                townMonthsByKey: current.townMonthsByKey,
                dailyBuildingsByDate,
                floorsById: rebuiltAggregates.floorsById,
                surpriseQuestsById,
                currentGameDateKey
              })
            };
          });

          return { ok: true };
        },

        skipSurpriseQuest: (questId) => {
          const quest = get().surpriseQuestsById[questId];
          if (!quest) return { ok: false, reason: "건너뛸 surprise quest가 없어요." };

          const currentGameDateKey = get().syncGameDay();
          const resolvedAt = new Date().toISOString();

          set((current) => {
            const surpriseQuestsById = {
              ...current.surpriseQuestsById,
              [questId]: {
                ...current.surpriseQuestsById[questId],
                status: "skipped" as const
              }
            };
            const rebuiltAggregates = rebuildSessionAggregates({
              sessionsById: current.sessionsById,
              routinesById: current.routinesById,
              surpriseQuestsById
            });
            const dailyBuildingsByDate = mergePersistedReviewState({
              rebuiltDailyBuildingsByDate: rebuiltAggregates.dailyBuildingsByDate,
              persistedDailyBuildingsByDate: current.dailyBuildingsByDate
            });

            return {
              surpriseQuestsById,
              floorsById: rebuiltAggregates.floorsById,
              dailyBuildingsByDate,
              townMonthsByKey: rebuildTownMonthCache({
                townMonthsByKey: current.townMonthsByKey,
                dailyBuildingsByDate,
                floorsById: rebuiltAggregates.floorsById,
                surpriseQuestsById,
                currentGameDateKey
              }),
              aiSuggestionsById:
                quest.status === "proposed" && quest.sourceSuggestionId && current.aiSuggestionsById[quest.sourceSuggestionId]
                ? {
                    ...current.aiSuggestionsById,
                    [quest.sourceSuggestionId]: {
                      ...markResolvedSuggestion(current.aiSuggestionsById[quest.sourceSuggestionId], resolvedAt, "dismissed")
                    }
                  }
                : current.aiSuggestionsById
            };
          });

          return { ok: true };
        },

        confirmDayReview: () => {
          const currentGameDateKey = get().syncGameDay();
          const state = get();
          const building = state.dailyBuildingsByDate[currentGameDateKey];
          if (!building || building.successfulSessionCount === 0) {
            return { ok: false, reason: "정산할 building이 없어요." };
          }

          const suggestedReview = getReviewCommentarySuggestion({
            aiSuggestionsById: state.aiSuggestionsById,
            dateKey: currentGameDateKey
          });
          const reviewSummary =
            suggestedReview?.payload.kind === "review_commentary" ? suggestedReview.payload.summary : undefined;
          const finalized = finalizeDayReview({
            dateKey: currentGameDateKey,
            building,
            sessionsById: state.sessionsById,
            routinesById: state.routinesById,
            stepResultsBySessionId: state.stepResultsBySessionId,
            stepsByRoutineId: state.stepsByRoutineId,
            triggersByRoutineId: state.triggersByRoutineId,
            dismissedRemainingRoutineIds: state.dismissedRemainingRoutineIdsByDate[currentGameDateKey] ?? [],
            reviewSummary
          });

          set((current) => ({
            activeView: "launcher",
            dailyBuildingsByDate: {
              ...current.dailyBuildingsByDate,
              [currentGameDateKey]: finalized.building
            },
            townMonthsByKey: rebuildTownMonthCache({
              townMonthsByKey: current.townMonthsByKey,
              dailyBuildingsByDate: {
                ...current.dailyBuildingsByDate,
                [currentGameDateKey]: finalized.building
              },
              floorsById: current.floorsById,
              surpriseQuestsById: current.surpriseQuestsById,
              currentGameDateKey
            }),
            reviewSummariesById: {
              ...current.reviewSummariesById,
              [finalized.reviewSummary.id]: finalized.reviewSummary
            },
            aiSuggestionsById:
              suggestedReview
                  ? {
                      ...current.aiSuggestionsById,
                      [suggestedReview.id]: {
                        ...markResolvedSuggestion(current.aiSuggestionsById[suggestedReview.id], finalized.reviewSummary.generatedAt, "applied")
                      }
                    }
                  : current.aiSuggestionsById
          }));

          return { ok: true };
        },

        closeDayReview: () => {
          get().syncGameDay();
          set({ activeView: "launcher" });
        },

        exportBackup: () => ({
          version: CURRENT_ROUTINE_BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          state: buildRoutineBackupState(createPersistedSlice(get()))
        }),

        previewBackupImport: (data) => buildRoutineBackupImportPreview({ currentState: createPersistedSlice(get()), data, now: new Date() }),

        applyBackupImport: (preview) => {
          if (!preview || !preview.state) {
            return { ok: false, reason: "복원 미리보기 정보가 올바르지 않아요." };
          }
          if (preview.sourceKind !== "routine_backup" && preview.alreadyImported) {
            return { ok: false, reason: "이미 가져온 legacy 기록이에요." };
          }

          const currentGameDateKey = toGameDateKey(new Date());
          const repaired = repairRoutineDataState({
            dataState: buildRoutineDataStateFromBackupState(preview.state),
            currentGameDateKey
          });

          set((current) => ({
            ...repaired.dataState,
            activeView: "manage",
            selectedLaunchContext: undefined,
            selectedSuggestionId: undefined,
            selectedTownMonthKey: undefined,
            selectedTownDateKey: undefined,
            notificationPermission: current.notificationPermission,
            lastNotifiedTriggerWindowKey: current.lastNotifiedTriggerWindowKey,
            pendingSuggestionRequestKeys: {},
            hasHydrated: current.hasHydrated,
            storageHealth: browserStorage.getHealth(),
            migrationNotice:
              preview.sourceKind === "routine_backup"
                ? createInfoNotice("routine 백업을 복원했어요.", `${preview.dateCount}일치 기록을 새 런처에 불러왔습니다.`)
                : createInfoNotice("legacy 기록을 가져왔어요.", `${preview.migrationMeta.importedCompletedQuestCount}개 완료 기록을 옮겼습니다.`),
            recoveryNotice:
              preview.hasRepairWarning || repaired.recovered
                ? createWarningNotice("가져온 데이터를 자동 복구했어요.", preview.repairSummary ?? IMPORT_RECOVERY_NOTICE)
                : undefined
          }));

          return { ok: true };
        },

        consumeAppEntry: (payload) => {
          get().syncGameDay();
          const state = get();

          if (state.activeSessionId && state.sessionsById[state.activeSessionId]) {
            get().openActiveSession();
            return;
          }

          if (!state.routinesById[payload.launchContext.routineId]) {
            return;
          }

          get().openRoutinePrelaunch(payload.launchContext);
        },

        syncNotificationPermission: (permission) => set({ notificationPermission: permission }),

        requestNotificationPermission: async () => {
          if (typeof Notification === "undefined") {
            set({ notificationPermission: "unsupported" });
            return "unsupported";
          }

          const permission = await Notification.requestPermission();
          set({ notificationPermission: permission });
          return permission;
        },

        markTriggerWindowNotified: (notificationWindowKey) => set({ lastNotifiedTriggerWindowKey: notificationWindowKey }),

        setActiveView: (view) => set({ activeView: view }),

        resetGameData: () =>
          set((state) => ({
            ...createInitialDataState(),
            selectedLaunchContext: undefined,
            selectedSuggestionId: undefined,
            selectedTownMonthKey: undefined,
            selectedTownDateKey: undefined,
            notificationPermission: state.notificationPermission,
            lastNotifiedTriggerWindowKey: undefined,
            pendingSuggestionRequestKeys: {},
            hasHydrated: state.hasHydrated,
            hasBootstrappedDefaults: true,
            storageHealth: browserStorage.getHealth(),
            migrationNotice: undefined,
            recoveryNotice: undefined
          })),

        clearRecoveryNotice: () => set({ recoveryNotice: undefined }),
        clearMigrationNotice: () => set({ migrationNotice: undefined })
      };
    },
    {
      name: ROUTINE_GAME_STORAGE_NAME,
      version: ROUTINE_GAME_STORAGE_VERSION,
      storage: createJSONStorage(() => browserStorage),
      partialize: (state) => createPersistedSlice(state),
      migrate: (persistedState: unknown) => normalizeHydratedState(persistedState),
      merge: (persistedState: unknown, currentState: RoutineGameState) => ({
        ...currentState,
        ...normalizeHydratedState(persistedState)
      }),
      onRehydrateStorage: () => () => {
        hydrationStatusSetter?.(true);
      }
    }
  )
);
