import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NIGHT_ROUTINE_ID } from "../domain/game-seeds";

type RoutineGameStoreModule = typeof import("./routine-game-store");

const createLocalStorageMock = () => {
  const storage = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    })
  };
};

const advanceAndCompleteAllSteps = (useRoutineGameStore: RoutineGameStoreModule["useRoutineGameStore"]) => {
  const stepCount = 5;
  const baseTime = new Date();
  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    vi.setSystemTime(new Date(baseTime.getTime() + (stepIndex * 60 + 20) * 1000));
    useRoutineGameStore.getState().completeCurrentStep();
  }
};

describe("routine game store", () => {
  let useRoutineGameStore: RoutineGameStoreModule["useRoutineGameStore"];
  let ROUTINE_GAME_STORAGE_NAME: RoutineGameStoreModule["ROUTINE_GAME_STORAGE_NAME"];
  let LEGACY_QUESTOWN_STORAGE_NAME: RoutineGameStoreModule["LEGACY_QUESTOWN_STORAGE_NAME"];

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T08:30:00+09:00"));
    vi.stubGlobal("localStorage", createLocalStorageMock());

    ({ useRoutineGameStore, ROUTINE_GAME_STORAGE_NAME, LEGACY_QUESTOWN_STORAGE_NAME } = await import("./routine-game-store"));
    useRoutineGameStore.setState(useRoutineGameStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("marks the store as hydrated after persist rehydrate completes", async () => {
    expect(useRoutineGameStore.getState().hasHydrated).toBe(false);

    await useRoutineGameStore.persist.rehydrate();

    expect(useRoutineGameStore.getState().hasHydrated).toBe(true);
  });

  it("bootstraps the default routines when hydrated state is empty", async () => {
    await useRoutineGameStore.persist.rehydrate();

    useRoutineGameStore.getState().hydrateGame();

    const state = useRoutineGameStore.getState();
    expect(Object.keys(state.routinesById)).toHaveLength(2);
    expect(Object.keys(state.stepsByRoutineId)).toHaveLength(2);
    expect(Object.keys(state.triggersByRoutineId)).toHaveLength(2);
  });

  it("does not duplicate routines when bootstrap is called multiple times", async () => {
    await useRoutineGameStore.persist.rehydrate();

    useRoutineGameStore.getState().bootstrapDefaultRoutines();
    useRoutineGameStore.getState().bootstrapDefaultRoutines();

    const state = useRoutineGameStore.getState();
    expect(Object.keys(state.routinesById)).toHaveLength(2);
    expect(Object.values(state.stepsByRoutineId).flat()).toHaveLength(10);
    expect(Object.values(state.triggersByRoutineId).flat()).toHaveLength(4);
  });

  it("starts an active session with first-step runtime initialized", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;

    const result = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBeTruthy();

    const state = useRoutineGameStore.getState();
    const session = state.sessionsById[result.sessionId as string];
    const runtime = state.sessionRuntimeBySessionId[result.sessionId as string];

    expect(session.status).toBe("active_step");
    expect(runtime.currentStepIndex).toBe(0);
    expect(runtime.currentComboCount).toBe(0);
    expect(state.stepResultsBySessionId[result.sessionId as string]).toEqual([]);
    expect(state.activeSessionId).toBe(result.sessionId);
    expect(state.activeView).toBe("session");
  });

  it("opens prelaunch and returns to launcher with a selected routine", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;

    useRoutineGameStore.getState().openRoutinePrelaunch(routineId);
    expect(useRoutineGameStore.getState().activeView).toBe("prelaunch");
    expect(useRoutineGameStore.getState().selectedRoutineId).toBe(routineId);

    useRoutineGameStore.getState().returnToLauncher();
    expect(useRoutineGameStore.getState().activeView).toBe("launcher");
  });

  it("restores the active session view and blocks duplicate session creation", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;

    const first = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");
    expect(first.ok).toBe(true);

    useRoutineGameStore.getState().returnToLauncher();
    expect(useRoutineGameStore.getState().activeView).toBe("launcher");

    useRoutineGameStore.getState().openActiveSession();
    expect(useRoutineGameStore.getState().activeView).toBe("session");

    const duplicate = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");
    expect(duplicate).toEqual({ ok: false, reason: "이미 진행 중인 세션이 있어요." });
  });

  it("subtracts paused time when resuming a session", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");

    vi.setSystemTime(new Date("2026-03-31T08:31:00+09:00"));
    expect(useRoutineGameStore.getState().pauseActiveSession()).toEqual({ ok: true });

    vi.setSystemTime(new Date("2026-03-31T08:36:00+09:00"));
    expect(useRoutineGameStore.getState().resumeActiveSession()).toEqual({ ok: true });

    const state = useRoutineGameStore.getState();
    const session = state.sessionsById[sessionId as string];
    const runtime = state.sessionRuntimeBySessionId[sessionId as string];

    expect(session.status).toBe("active_step");
    expect(session.pausedCount).toBe(1);
    expect(runtime.accumulatedPauseMs).toBe(300000);
    expect(runtime.pausedAt).toBeUndefined();
    expect(runtime.currentStepPauseCount).toBe(1);
  });

  it("records grace-completed steps and advances to the next step", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");

    vi.setSystemTime(new Date("2026-03-31T08:31:15+09:00"));
    const result = useRoutineGameStore.getState().completeCurrentStep();

    expect(result).toEqual({ ok: true, completedSession: false });

    const state = useRoutineGameStore.getState();
    const session = state.sessionsById[sessionId as string];
    const runtime = state.sessionRuntimeBySessionId[sessionId as string];
    const stepResults = state.stepResultsBySessionId[sessionId as string];

    expect(session.completedStepCount).toBe(1);
    expect(session.wasGraceApplied).toBe(true);
    expect(runtime.currentStepIndex).toBe(1);
    expect(runtime.currentComboCount).toBe(1);
    expect(runtime.graceUsed).toBe(true);
    expect(stepResults).toHaveLength(1);
    expect(stepResults[0]?.status).toBe("grace_completed");
  });

  it("records skipped steps and resets combo", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");

    vi.setSystemTime(new Date("2026-03-31T08:30:40+09:00"));
    useRoutineGameStore.getState().completeCurrentStep();
    vi.setSystemTime(new Date("2026-03-31T08:32:00+09:00"));
    const result = useRoutineGameStore.getState().skipCurrentStep();

    expect(result).toEqual({ ok: true, completedSession: false });

    const state = useRoutineGameStore.getState();
    const session = state.sessionsById[sessionId as string];
    const runtime = state.sessionRuntimeBySessionId[sessionId as string];
    const stepResults = state.stepResultsBySessionId[sessionId as string];

    expect(session.skippedStepCount).toBe(1);
    expect(runtime.currentComboCount).toBe(0);
    expect(runtime.currentStepIndex).toBe(2);
    expect(stepResults[1]?.status).toBe("skipped");
    expect(stepResults[1]?.comboIndexAfterStep).toBe(0);
  });

  it("marks the final step as completed and keeps runtime until dismissed", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");

    for (let stepIndex = 0; stepIndex < 4; stepIndex += 1) {
      vi.setSystemTime(new Date(`2026-03-31T08:${30 + stepIndex}:30+09:00`));
      useRoutineGameStore.getState().skipCurrentStep();
    }

    vi.setSystemTime(new Date("2026-03-31T08:35:00+09:00"));
    const result = useRoutineGameStore.getState().completeCurrentStep();

    expect(result).toEqual({ ok: true, completedSession: true });

    const state = useRoutineGameStore.getState();
    const session = state.sessionsById[sessionId as string];

    expect(session.status).toBe("completed");
    expect(session.endedAt).toBeTruthy();
    expect(state.sessionRuntimeBySessionId[sessionId as string]).toBeTruthy();
    expect(state.floorsById[`floor-${sessionId}`]).toBeUndefined();
    expect(state.dailyBuildingsByDate["2026-03-31"]).toBeUndefined();

    useRoutineGameStore.getState().dismissCompletedSession();
    expect(useRoutineGameStore.getState().activeSessionId).toBeUndefined();
    expect(useRoutineGameStore.getState().sessionRuntimeBySessionId[sessionId as string]).toBeUndefined();
    expect(useRoutineGameStore.getState().sessionsById[sessionId as string]?.status).toBe("reviewed");
  });

  it("creates a floor and daily building cache when a clear+ session finishes", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");

    advanceAndCompleteAllSteps(useRoutineGameStore);

    const state = useRoutineGameStore.getState();
    expect(state.sessionsById[sessionId as string]?.resultGrade).toBe("Perfect");
    expect(state.floorsById[`floor-${sessionId}`]?.qualityTier).toBe("signature");
    expect(state.dailyBuildingsByDate["2026-03-31"]?.successfulSessionCount).toBe(1);
    expect(state.dailyBuildingsByDate["2026-03-31"]?.floorIds).toEqual([`floor-${sessionId}`]);
  });

  it("rebuilds floor and building caches during hydrate from reviewed sessions", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");

    advanceAndCompleteAllSteps(useRoutineGameStore);

    useRoutineGameStore.getState().dismissCompletedSession();
    useRoutineGameStore.setState({
      floorsById: {},
      dailyBuildingsByDate: {}
    });

    useRoutineGameStore.getState().hydrateGame();

    const state = useRoutineGameStore.getState();
    expect(state.sessionsById[sessionId as string]?.status).toBe("reviewed");
    expect(state.floorsById[`floor-${sessionId}`]).toBeTruthy();
    expect(state.dailyBuildingsByDate["2026-03-31"]?.successfulSessionCount).toBe(1);
  });

  it("falls back to launcher when hydration finds an active session without runtime", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(routineId, "manual");

    useRoutineGameStore.setState({
      activeView: "session",
      activeSessionId: sessionId,
      sessionRuntimeBySessionId: {}
    });

    useRoutineGameStore.getState().hydrateGame();

    expect(useRoutineGameStore.getState().activeSessionId).toBeUndefined();
    expect(useRoutineGameStore.getState().activeView).toBe("launcher");
  });

  it("branches to review gate after a successful day-closing routine when surfaced routines remain", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    useRoutineGameStore.getState().openRoutinePrelaunch(NIGHT_ROUTINE_ID);
    vi.setSystemTime(new Date("2026-03-31T21:00:00+09:00"));
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(NIGHT_ROUTINE_ID, "time");

    advanceAndCompleteAllSteps(useRoutineGameStore);
    expect(useRoutineGameStore.getState().sessionsById[sessionId as string]?.resultGrade).toBe("Perfect");

    useRoutineGameStore.getState().dismissCompletedSession();
    expect(useRoutineGameStore.getState().activeView).toBe("review_gate");
  });

  it("branches straight to day review when the day closer finishes and no surfaced routine remains", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    const morningSession = useRoutineGameStore.getState().startRoutineSession(useRoutineGameStore.getState().selectedRoutineId as string, "manual");
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();

    vi.setSystemTime(new Date("2026-03-31T21:00:00+09:00"));
    useRoutineGameStore.getState().openRoutinePrelaunch(NIGHT_ROUTINE_ID);
    const nightSession = useRoutineGameStore.getState().startRoutineSession(NIGHT_ROUTINE_ID, "time");
    advanceAndCompleteAllSteps(useRoutineGameStore);
    expect(useRoutineGameStore.getState().sessionsById[morningSession.sessionId as string]?.resultGrade).toBe("Perfect");
    expect(useRoutineGameStore.getState().sessionsById[nightSession.sessionId as string]?.resultGrade).toBe("Perfect");

    useRoutineGameStore.getState().dismissCompletedSession();
    expect(useRoutineGameStore.getState().activeView).toBe("day_review");
  });

  it("confirms day review and writes roof, summary id, and finalized timestamp", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    useRoutineGameStore.getState().startRoutineSession(useRoutineGameStore.getState().selectedRoutineId as string, "manual");
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();

    useRoutineGameStore.getState().openTodayReview();
    expect(useRoutineGameStore.getState().activeView).toBe("day_review");

    expect(useRoutineGameStore.getState().confirmDayReview()).toEqual({ ok: true });

    const building = useRoutineGameStore.getState().dailyBuildingsByDate["2026-03-31"];
    expect(building?.roofType).toBe("high");
    expect(building?.reviewSummaryId).toBe("review-2026-03-31");
    expect(building?.finalizedAt).toBeTruthy();
    expect(useRoutineGameStore.getState().reviewSummariesById["review-2026-03-31"]?.source).toBe("fallback");
    expect(useRoutineGameStore.getState().activeView).toBe("launcher");
  });

  it("invalidates a finalized review when a new successful session lands on the same game day", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    useRoutineGameStore.getState().startRoutineSession(useRoutineGameStore.getState().selectedRoutineId as string, "manual");
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();
    useRoutineGameStore.getState().confirmDayReview();

    vi.setSystemTime(new Date("2026-03-31T21:00:00+09:00"));
    useRoutineGameStore.getState().openRoutinePrelaunch(NIGHT_ROUTINE_ID);
    useRoutineGameStore.getState().startRoutineSession(NIGHT_ROUTINE_ID, "time");
    advanceAndCompleteAllSteps(useRoutineGameStore);

    const building = useRoutineGameStore.getState().dailyBuildingsByDate["2026-03-31"];
    expect(building?.successfulSessionCount).toBe(2);
    expect(building?.finalizedAt).toBeUndefined();
    expect(building?.reviewSummaryId).toBeUndefined();
    expect(useRoutineGameStore.getState().reviewSummariesById["review-2026-03-31"]).toBeUndefined();
  });

  it("auto-finalizes past game days during sync after the 5AM rollover", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    useRoutineGameStore.getState().startRoutineSession(useRoutineGameStore.getState().selectedRoutineId as string, "manual");
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();

    expect(useRoutineGameStore.getState().dailyBuildingsByDate["2026-03-31"]?.finalizedAt).toBeUndefined();

    vi.setSystemTime(new Date("2026-04-01T05:10:00+09:00"));
    const currentGameDateKey = useRoutineGameStore.getState().syncGameDay();

    expect(currentGameDateKey).toBe("2026-04-01");
    expect(useRoutineGameStore.getState().dailyBuildingsByDate["2026-03-31"]?.finalizedAt).toBeTruthy();
    expect(useRoutineGameStore.getState().reviewSummariesById["review-2026-03-31"]).toBeTruthy();
  });

  it("resets routines and sessions without reintroducing seed data immediately", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    useRoutineGameStore.getState().startRoutineSession(routineId, "manual");
    useRoutineGameStore.getState().resetGameData();

    const state = useRoutineGameStore.getState();
    expect(state.routinesById).toEqual({});
    expect(state.sessionsById).toEqual({});
    expect(state.sessionRuntimeBySessionId).toEqual({});
    expect(state.hasBootstrappedDefaults).toBe(true);
  });

  it("clears legacy quest storage and shows a one-time reset notice", async () => {
    await useRoutineGameStore.persist.rehydrate();
    localStorage.setItem(LEGACY_QUESTOWN_STORAGE_NAME, JSON.stringify({ stale: true }));
    localStorage.setItem(ROUTINE_GAME_STORAGE_NAME, JSON.stringify({ state: {}, version: 1 }));

    useRoutineGameStore.getState().hydrateGame();

    expect(localStorage.getItem(LEGACY_QUESTOWN_STORAGE_NAME)).toBeNull();
    expect(useRoutineGameStore.getState().legacyResetNotice).toContain("Phase 1 routine/session 구조");
  });
});
