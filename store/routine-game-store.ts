"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDefaultRoutineSeed, MORNING_ROUTINE_ID } from "@/domain/game-seeds";
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
import { toDateKey } from "@/domain/date";
import { StorageHealth } from "@/domain/types";
import { createSafeBrowserStorage } from "@/store/browser-storage";

export const ROUTINE_GAME_STORAGE_NAME = "questown-routine-storage";
export const ROUTINE_GAME_STORAGE_VERSION = 3;
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
  returnToLauncher: () => void;
  openActiveSession: () => void;
  startRoutineSession: (routineId: string, triggerSource: TriggerType) => { ok: boolean; reason?: string; sessionId?: string };
  pauseActiveSession: () => { ok: boolean; reason?: string };
  resumeActiveSession: () => { ok: boolean; reason?: string };
  completeCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  skipCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  dismissCompletedSession: () => void;
  setActiveView: (view: GameActiveView) => void;
  resetGameData: () => void;
  clearLegacyResetNotice: () => void;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeActiveView = (value: unknown): GameActiveView => {
  if (value === "routines" || value === "launcher") return "launcher";
  if (value === "prelaunch" || value === "session" || value === "debug") return value;
  return "launcher";
};

const normalizeString = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value : undefined);
const normalizeBoolean = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);

const normalizeRecordMap = <T>(value: unknown) => (isPlainObject(value) ? (value as Record<string, T>) : {});

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
    routinesById: normalizeRecordMap<Routine>(persistedState.routinesById),
    stepsByRoutineId: normalizeRecordMap<RoutineStep[]>(persistedState.stepsByRoutineId),
    triggersByRoutineId: normalizeRecordMap<RoutineTrigger[]>(persistedState.triggersByRoutineId),
    sessionsById: normalizeRecordMap<RoutineSession>(persistedState.sessionsById),
    sessionRuntimeBySessionId: normalizeRecordMap<SessionRuntime>(persistedState.sessionRuntimeBySessionId),
    stepResultsBySessionId: normalizeRecordMap<SessionStepResult[]>(persistedState.stepResultsBySessionId),
    dailyBuildingsByDate: normalizeRecordMap<DailyBuilding>(persistedState.dailyBuildingsByDate),
    floorsById: normalizeRecordMap<Floor>(persistedState.floorsById),
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

          if (Object.keys(nextPatch).length > 0) {
            set(nextPatch);
          }
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

        openRoutinePrelaunch: (routineId) =>
          set((state) =>
            state.routinesById[routineId]
              ? {
                  selectedRoutineId: routineId,
                  activeView: "prelaunch"
                }
              : state
          ),

        returnToLauncher: () =>
          set({
            activeView: "launcher"
          }),

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

        startRoutineSession: (routineId, triggerSource) => {
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
            dateKey: toDateKey(),
            startedAt: nowIso,
            triggerSource,
            status: "active_step",
            baseScore: 0,
            timeBonus: 0,
            comboBonus: 0,
            clearBonus: 0,
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

          const steps = state.stepsByRoutineId[session.routineId] ?? [];
          const currentStep = steps[runtime.currentStepIndex];
          if (!currentStep) return { ok: false, reason: "현재 step을 찾을 수 없어요." };

          const now = new Date();
          const nowIso = now.toISOString();
          const elapsedMs = getElapsedMs(runtime, now);
          const result = buildStepResultStatus(elapsedMs, currentStep.recommendedDurationSec, runtime.graceUsed);
          const nextCombo = runtime.currentComboCount + 1;
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

          set((current) => ({
            sessionsById: {
              ...current.sessionsById,
              [sessionId]: {
                ...session,
                status: isLastStep ? "completed" : "active_step",
                endedAt: isLastStep ? nowIso : session.endedAt,
                completedStepCount: session.completedStepCount + 1,
                wasGraceApplied: session.wasGraceApplied || result.usedGrace
              }
            },
            sessionRuntimeBySessionId: {
              ...current.sessionRuntimeBySessionId,
              [sessionId]: isLastStep
                ? {
                    ...runtime,
                    currentComboCount: nextCombo,
                    graceUsed: runtime.graceUsed || result.usedGrace
                  }
                : {
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

          return { ok: true, completedSession: isLastStep };
        },

        skipCurrentStep: () => {
          const state = get();
          const sessionId = state.activeSessionId;
          if (!sessionId) return { ok: false, reason: "진행 중인 세션이 없어요." };

          const session = state.sessionsById[sessionId];
          const runtime = state.sessionRuntimeBySessionId[sessionId];
          if (!session || !runtime) return { ok: false, reason: "세션 런타임을 찾을 수 없어요." };
          if (session.status !== "active_step") return { ok: false, reason: "지금은 skip할 수 없어요." };

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

          set((current) => ({
            sessionsById: {
              ...current.sessionsById,
              [sessionId]: {
                ...session,
                status: isLastStep ? "completed" : "active_step",
                endedAt: isLastStep ? nowIso : session.endedAt,
                skippedStepCount: session.skippedStepCount + 1
              }
            },
            sessionRuntimeBySessionId: {
              ...current.sessionRuntimeBySessionId,
              [sessionId]: isLastStep
                ? {
                    ...runtime,
                    currentComboCount: 0
                  }
                : {
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

          return { ok: true, completedSession: isLastStep };
        },

        dismissCompletedSession: () =>
          set((state) => {
            if (!state.activeSessionId) {
              return { activeView: "launcher" };
            }

            const sessionId = state.activeSessionId;
            const activeSession = state.sessionsById[sessionId];
            const nextRuntime = { ...state.sessionRuntimeBySessionId };
            delete nextRuntime[sessionId];

            return {
              activeSessionId: undefined,
              activeView: "launcher",
              selectedRoutineId: activeSession?.routineId ?? state.selectedRoutineId,
              sessionRuntimeBySessionId: nextRuntime
            };
          }),

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
