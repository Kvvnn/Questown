"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDefaultRoutineSeed, MORNING_ROUTINE_ID } from "@/domain/game-seeds";
import { finalizeDayReview } from "@/domain/day-review";
import { toGameDateKey } from "@/domain/game-day";
import {
  AiSuggestion,
  DailyBuilding,
  Floor,
  GameActiveView,
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
import { getRemainingReviewRoutines } from "@/domain/game-selectors";
import { scoreRoutineSession } from "@/domain/session-scoring";
import { isClearOrBetterGrade } from "@/domain/session-scoring";
import { rebuildSessionAggregates } from "@/domain/session-aggregates";
import { StorageHealth } from "@/domain/types";
import { createSafeBrowserStorage } from "@/store/browser-storage";

export const ROUTINE_GAME_STORAGE_NAME = "questown-routine-storage";
export const ROUTINE_GAME_STORAGE_VERSION = 6;
export const LEGACY_QUESTOWN_STORAGE_NAME = "questown-mvp-storage";

const LEGACY_RESET_NOTICE = "기존 Quest 기반 로컬 데이터를 초기화하고 Phase 1 routine/session 구조로 전환했어요.";
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
}

interface RoutineGameState extends RoutineGameDataState {
  hasHydrated: boolean;
  storageHealth: StorageHealth;
  legacyResetNotice?: string;
  hydrateGame: () => void;
  bootstrapDefaultRoutines: () => void;
  selectRoutine: (routineId: string | undefined) => void;
  openRoutinePrelaunch: (routineId: string) => void;
  openTodayReview: () => void;
  returnToLauncher: () => void;
  openActiveSession: () => void;
  dismissRemainingRoutineForToday: (routineId: string) => void;
  clearDismissedRemainingRoutineForToday: (routineId: string) => void;
  startRoutineSession: (routineId: string, triggerSource: TriggerType) => { ok: boolean; reason?: string; sessionId?: string };
  pauseActiveSession: () => { ok: boolean; reason?: string };
  resumeActiveSession: () => { ok: boolean; reason?: string };
  completeCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  skipCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  dismissCompletedSession: () => void;
  confirmDayReview: () => { ok: boolean; reason?: string };
  closeDayReview: () => void;
  syncGameDay: () => string;
  setActiveView: (view: GameActiveView) => void;
  resetGameData: () => void;
  clearLegacyResetNotice: () => void;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeActiveView = (value: unknown): GameActiveView => {
  if (value === "routines" || value === "launcher") return "launcher";
  if (value === "prelaunch" || value === "session" || value === "review_gate" || value === "day_review" || value === "debug") return value;
  return "launcher";
};

const normalizeString = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value : undefined);
const normalizeBoolean = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);

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
  reviewSummariesById: {}
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
    aiSuggestionsById: normalizeRecordMap<AiSuggestion>(persistedState.aiSuggestionsById),
    reviewSummariesById: normalizeRecordMap<ReviewSummary>(persistedState.reviewSummariesById)
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
  reviewSummariesById: state.reviewSummariesById
});

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
        hasHydrated: false,
        storageHealth: browserStorage.getHealth(),
        legacyResetNotice: undefined,

        syncGameDay: () => {
          const now = new Date();
          const currentGameDateKey = toGameDateKey(now);

          set((state) => {
            const rebuiltAggregates = rebuildSessionAggregates({
              sessionsById: state.sessionsById,
              routinesById: state.routinesById
            });
            const nextDailyBuildingsByDate = mergePersistedReviewState({
              rebuiltDailyBuildingsByDate: rebuiltAggregates.dailyBuildingsByDate,
              persistedDailyBuildingsByDate: state.dailyBuildingsByDate
            });
            const nextReviewSummariesById = { ...state.reviewSummariesById };

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

            const nextActiveView =
              (state.activeView === "review_gate" || state.activeView === "day_review") && !nextDailyBuildingsByDate[currentGameDateKey]
                ? "launcher"
                : state.activeView;

            return {
              floorsById: rebuiltAggregates.floorsById,
              dailyBuildingsByDate: nextDailyBuildingsByDate,
              reviewSummariesById: cleanedReviewSummariesById,
              dismissedRemainingRoutineIdsByDate: nextDismissedRemainingRoutineIdsByDate,
              activeView: nextActiveView
            };
          });

          return currentGameDateKey;
        },

        hydrateGame: () => {
          const legacyData = browserStorage.getItem(LEGACY_QUESTOWN_STORAGE_NAME);
          const state = get();

          const nextPatch: Partial<RoutineGameState> = {};
          if (legacyData !== null) {
            browserStorage.removeItem(LEGACY_QUESTOWN_STORAGE_NAME);
            nextPatch.legacyResetNotice = LEGACY_RESET_NOTICE;
          }

          if (Object.keys(state.routinesById).length === 0 && !state.hasBootstrappedDefaults) {
            if (Object.keys(nextPatch).length > 0) {
              set(nextPatch);
            }
            get().bootstrapDefaultRoutines();
            return;
          }

          const selectedRoutineId =
            state.selectedRoutineId && state.routinesById[state.selectedRoutineId]
              ? state.selectedRoutineId
              : Object.keys(state.routinesById)[0];
          let activeSessionId =
            state.activeSessionId && state.sessionsById[state.activeSessionId] ? state.activeSessionId : undefined;
          let activeView = state.activeView;

          if (activeSessionId) {
            const activeSession = state.sessionsById[activeSessionId];
            const stepCount = state.stepsByRoutineId[activeSession.routineId]?.length ?? 0;
            const hasValidActiveRuntime =
              activeSession.status === "completed"
                ? true
                : activeSession.status === "idle"
                  ? false
                  : ACTIVE_RUNTIME_STATUSES.includes(activeSession.status) &&
                    isValidRuntime(state.sessionRuntimeBySessionId[activeSessionId], stepCount);

            if (!hasValidActiveRuntime) {
              activeSessionId = undefined;
            }
          }

          if (selectedRoutineId !== state.selectedRoutineId) {
            nextPatch.selectedRoutineId = selectedRoutineId;
          }

          if (activeSessionId !== state.activeSessionId) {
            nextPatch.activeSessionId = activeSessionId;
          }

          if (activeView === "debug") {
            activeView = "launcher";
          }

          if (activeView === "prelaunch" && !selectedRoutineId) {
            activeView = activeSessionId ? "session" : "launcher";
          }

          if (!activeSessionId && activeView === "session") {
            activeView = "launcher";
          }

          if (activeView !== state.activeView) {
            nextPatch.activeView = activeView;
          }

          const completedSessionsToBackfill = Object.values(state.sessionsById)
            .filter((session) => session.status === "completed" && !session.resultGrade)
            .sort((left, right) => left.startedAt.localeCompare(right.startedAt));

          let effectiveSessionsById = state.sessionsById;

          if (completedSessionsToBackfill.length > 0) {
            const nextSessionsById = { ...state.sessionsById };
            const nextStepResultsBySessionId = { ...state.stepResultsBySessionId };

            completedSessionsToBackfill.forEach((session) => {
              const routine = state.routinesById[session.routineId];
              const steps = state.stepsByRoutineId[session.routineId] ?? [];
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

            effectiveSessionsById = nextSessionsById;
            nextPatch.sessionsById = effectiveSessionsById;
            nextPatch.stepResultsBySessionId = nextStepResultsBySessionId;
          }

          const rebuiltAggregates = rebuildSessionAggregates({
            sessionsById: effectiveSessionsById,
            routinesById: state.routinesById
          });
          nextPatch.floorsById = rebuiltAggregates.floorsById;
          nextPatch.dailyBuildingsByDate = mergePersistedReviewState({
            rebuiltDailyBuildingsByDate: rebuiltAggregates.dailyBuildingsByDate,
            persistedDailyBuildingsByDate: state.dailyBuildingsByDate
          });

          if (Object.keys(nextPatch).length > 0) {
            set(nextPatch);
          }

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

        openRoutinePrelaunch: (routineId) => {
          get().syncGameDay();
          set((state) =>
            state.routinesById[routineId]
              ? {
                  selectedRoutineId: routineId,
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

        returnToLauncher: () => {
          get().syncGameDay();
          set({
            activeView: "launcher"
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

        startRoutineSession: (routineId, triggerSource) => {
          get().syncGameDay();
          const state = get();
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
          const hasTrigger = triggers.some((trigger) => trigger.triggerType === triggerSource && trigger.isEnabled);
          if (!hasTrigger) {
            return { ok: false, reason: "해당 방식으로 시작할 수 없는 루틴이에요." };
          }

          const sessionId = createQuestownId();
          const nowIso = new Date().toISOString();
          const session: RoutineSession = {
            id: sessionId,
            routineId,
            dateKey: toGameDateKey(),
            startedAt: nowIso,
            triggerSource,
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
            wasGraceApplied: false
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
              routinesById: state.routinesById
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
              routinesById: state.routinesById
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

        confirmDayReview: () => {
          const currentGameDateKey = get().syncGameDay();
          const state = get();
          const building = state.dailyBuildingsByDate[currentGameDateKey];
          if (!building || building.successfulSessionCount === 0) {
            return { ok: false, reason: "정산할 building이 없어요." };
          }

          const finalized = finalizeDayReview({
            dateKey: currentGameDateKey,
            building,
            sessionsById: state.sessionsById,
            routinesById: state.routinesById,
            stepResultsBySessionId: state.stepResultsBySessionId,
            stepsByRoutineId: state.stepsByRoutineId,
            triggersByRoutineId: state.triggersByRoutineId,
            dismissedRemainingRoutineIds: state.dismissedRemainingRoutineIdsByDate[currentGameDateKey] ?? []
          });

          set((current) => ({
            activeView: "launcher",
            dailyBuildingsByDate: {
              ...current.dailyBuildingsByDate,
              [currentGameDateKey]: finalized.building
            },
            reviewSummariesById: {
              ...current.reviewSummariesById,
              [finalized.reviewSummary.id]: finalized.reviewSummary
            }
          }));

          return { ok: true };
        },

        closeDayReview: () => {
          get().syncGameDay();
          set({ activeView: "launcher" });
        },

        setActiveView: (view) => set({ activeView: view }),

        resetGameData: () =>
          set((state) => ({
            ...createInitialDataState(),
            hasHydrated: state.hasHydrated,
            hasBootstrappedDefaults: true,
            storageHealth: browserStorage.getHealth(),
            legacyResetNotice: undefined
          })),

        clearLegacyResetNotice: () => set({ legacyResetNotice: undefined })
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
