import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MORNING_ROUTINE_ID, NIGHT_ROUTINE_ID } from "../domain/game-seeds";
import { RoutineLaunchContext } from "../domain/game-types";

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

const buildLaunchContext = ({
  routineId,
  triggerSource = "manual",
  triggerId,
  entrySource = "launcher_hero",
  reasonKey = triggerSource === "time" ? "time_window_active" : "manual_fallback"
}: {
  routineId: string;
  triggerSource?: RoutineLaunchContext["triggerSource"];
  triggerId?: string;
  entrySource?: RoutineLaunchContext["entrySource"];
  reasonKey?: RoutineLaunchContext["reasonKey"];
}): RoutineLaunchContext => ({
  routineId,
  triggerSource,
  triggerId,
  entrySource,
  reasonKey
});

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

    const result = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));

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

    useRoutineGameStore.getState().openRoutinePrelaunch(buildLaunchContext({ routineId }));
    expect(useRoutineGameStore.getState().activeView).toBe("prelaunch");
    expect(useRoutineGameStore.getState().selectedRoutineId).toBe(routineId);

    useRoutineGameStore.getState().returnToLauncher();
    expect(useRoutineGameStore.getState().activeView).toBe("launcher");
  });

  it("rejects time-based session starts before the trigger window opens", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    vi.setSystemTime(new Date("2026-03-31T19:30:00+09:00"));
    const result = useRoutineGameStore.getState().startRoutineSession(
      buildLaunchContext({ routineId: NIGHT_ROUTINE_ID, triggerSource: "time", triggerId: "trigger-night-time" })
    );

    expect(result).toEqual({ ok: false, reason: "이 시간 창은 지금 열려 있지 않아요." });
  });

  it("keeps upcoming time-trigger entries in preview mode until the window opens", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    vi.setSystemTime(new Date("2026-03-31T08:30:00+09:00"));
    const result = useRoutineGameStore.getState().startRoutineSession(
      buildLaunchContext({
        routineId: NIGHT_ROUTINE_ID,
        triggerSource: "time",
        triggerId: "trigger-night-time",
        reasonKey: "time_window_upcoming",
        entrySource: "launcher_queue"
      })
    );

    expect(result).toEqual({
      ok: false,
      reason: "지금은 step preview만 가능해요. 시간 창이 열리면 시작할 수 있습니다."
    });
  });

  it("restores the active session view and blocks duplicate session creation", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;

    const first = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));
    expect(first.ok).toBe(true);

    useRoutineGameStore.getState().returnToLauncher();
    expect(useRoutineGameStore.getState().activeView).toBe("launcher");

    useRoutineGameStore.getState().openActiveSession();
    expect(useRoutineGameStore.getState().activeView).toBe("session");

    const duplicate = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));
    expect(duplicate).toEqual({ ok: false, reason: "이미 진행 중인 세션이 있어요." });
  });

  it("subtracts paused time when resuming a session", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));

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
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));

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
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));

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
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));

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
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));

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
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));

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
    const { sessionId } = useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));

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
    useRoutineGameStore
      .getState()
      .openRoutinePrelaunch(buildLaunchContext({ routineId: NIGHT_ROUTINE_ID, triggerSource: "time", triggerId: "trigger-night-time" }));
    vi.setSystemTime(new Date("2026-03-31T21:00:00+09:00"));
    const { sessionId } = useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: NIGHT_ROUTINE_ID, triggerSource: "time", triggerId: "trigger-night-time" }));

    advanceAndCompleteAllSteps(useRoutineGameStore);
    expect(useRoutineGameStore.getState().sessionsById[sessionId as string]?.resultGrade).toBe("Perfect");

    useRoutineGameStore.getState().dismissCompletedSession();
    expect(useRoutineGameStore.getState().activeView).toBe("review_gate");
  });

  it("branches straight to day review when the day closer finishes and no surfaced routine remains", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    const morningSession = useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: useRoutineGameStore.getState().selectedRoutineId as string }));
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();

    vi.setSystemTime(new Date("2026-03-31T21:00:00+09:00"));
    useRoutineGameStore
      .getState()
      .openRoutinePrelaunch(buildLaunchContext({ routineId: NIGHT_ROUTINE_ID, triggerSource: "time", triggerId: "trigger-night-time" }));
    const nightSession = useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: NIGHT_ROUTINE_ID, triggerSource: "time", triggerId: "trigger-night-time" }));
    advanceAndCompleteAllSteps(useRoutineGameStore);
    expect(useRoutineGameStore.getState().sessionsById[morningSession.sessionId as string]?.resultGrade).toBe("Perfect");
    expect(useRoutineGameStore.getState().sessionsById[nightSession.sessionId as string]?.resultGrade).toBe("Perfect");

    useRoutineGameStore.getState().dismissCompletedSession();
    expect(useRoutineGameStore.getState().activeView).toBe("day_review");
  });

  it("confirms day review and writes roof, summary id, and finalized timestamp", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: useRoutineGameStore.getState().selectedRoutineId as string }));
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

    useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: useRoutineGameStore.getState().selectedRoutineId as string }));
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();
    useRoutineGameStore.getState().confirmDayReview();

    vi.setSystemTime(new Date("2026-03-31T21:00:00+09:00"));
    useRoutineGameStore
      .getState()
      .openRoutinePrelaunch(buildLaunchContext({ routineId: NIGHT_ROUTINE_ID, triggerSource: "time", triggerId: "trigger-night-time" }));
    useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: NIGHT_ROUTINE_ID, triggerSource: "time", triggerId: "trigger-night-time" }));
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
    useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: useRoutineGameStore.getState().selectedRoutineId as string }));
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();

    expect(useRoutineGameStore.getState().dailyBuildingsByDate["2026-03-31"]?.finalizedAt).toBeUndefined();

    vi.setSystemTime(new Date("2026-04-01T05:10:00+09:00"));
    const currentGameDateKey = useRoutineGameStore.getState().syncGameDay();

    expect(currentGameDateKey).toBe("2026-04-01");
    expect(useRoutineGameStore.getState().dailyBuildingsByDate["2026-03-31"]?.finalizedAt).toBeTruthy();
    expect(useRoutineGameStore.getState().reviewSummariesById["review-2026-03-31"]).toBeTruthy();
  });

  it("consumes a notification entry by opening prelaunch when no active session exists", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    useRoutineGameStore.getState().consumeAppEntry({
      source: "notification",
      launchContext: buildLaunchContext({
        routineId: NIGHT_ROUTINE_ID,
        triggerSource: "time",
        triggerId: "trigger-night-time",
        entrySource: "notification",
        reasonKey: "time_window_active"
      })
    });

    expect(useRoutineGameStore.getState().activeView).toBe("prelaunch");
    expect(useRoutineGameStore.getState().selectedLaunchContext?.entrySource).toBe("notification");
    expect(useRoutineGameStore.getState().selectedRoutineId).toBe(NIGHT_ROUTINE_ID);
  });

  it("consumes a notification entry by resuming the current active session when one exists", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;

    useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));
    useRoutineGameStore.getState().returnToLauncher();

    useRoutineGameStore.getState().consumeAppEntry({
      source: "notification",
      launchContext: buildLaunchContext({
        routineId: NIGHT_ROUTINE_ID,
        triggerSource: "time",
        triggerId: "trigger-night-time",
        entrySource: "notification",
        reasonKey: "time_window_active"
      })
    });

    expect(useRoutineGameStore.getState().activeView).toBe("session");
    expect(useRoutineGameStore.getState().activeSessionId).toBeTruthy();
  });

  it("stores the last notified trigger window key for in-app notification de-duping", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().markTriggerWindowNotified("trigger-night-time:2026-03-31T11:00:00.000Z");

    expect(useRoutineGameStore.getState().lastNotifiedTriggerWindowKey).toBe("trigger-night-time:2026-03-31T11:00:00.000Z");
  });

  it("creates launcher suggestions and lets the user dismiss the AI note for the day", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));

    await useRoutineGameStore.getState().requestLauncherSuggestions();

    const suggestion = Object.values(useRoutineGameStore.getState().aiSuggestionsById).find(
      (candidate) => candidate.type === "routine_recommendation"
    );
    expect(suggestion?.source).toBe("fallback");
    expect(suggestion?.status).toBe("pending");

    expect(useRoutineGameStore.getState().dismissAiSuggestion(suggestion?.id ?? "")).toEqual({ ok: true });
    expect(useRoutineGameStore.getState().aiSuggestionsById[suggestion?.id ?? ""]?.status).toBe("dismissed");
  });

  it("keeps the browser-local fallback when the AI route returns degraded", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            kind: "launcher",
            responseSource: "degraded",
            degradedReason: "missing_env",
            routineSuggestion: null,
            surpriseQuestSuggestion: null
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
    );

    await useRoutineGameStore.getState().requestLauncherSuggestions();

    const suggestion = Object.values(useRoutineGameStore.getState().aiSuggestionsById).find(
      (candidate) => candidate.type === "routine_recommendation"
    );

    expect(suggestion?.source).toBe("fallback");
    expect(suggestion?.status).toBe("pending");
  });

  it("applies a duration tune suggestion by updating the step duration and routine estimate", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    const suggestionId = "ai-duration-session-1";
    useRoutineGameStore.setState((state) => ({
      aiSuggestionsById: {
        ...state.aiSuggestionsById,
        [suggestionId]: {
          id: suggestionId,
          type: "duration_tune",
          targetDateKey: "2026-03-31",
          targetRoutineId: MORNING_ROUTINE_ID,
          targetSessionId: "session-1",
          generatedAt: "2026-03-31T00:00:00.000Z",
          reasoningSummary: "세수/샤워 step에 시간 여유를 조금 더 두는 편이 안정적입니다.",
          confidence: 0.72,
          status: "pending",
          source: "ai",
          payload: {
            kind: "duration_tune",
            routineId: MORNING_ROUTINE_ID,
            stepId: "step-morning-wash",
            stepTitle: "세수/샤워",
            currentDurationSec: 720,
            proposedDurationSec: 900,
            deltaSec: 180,
            frictionSignals: ["overtime", "grace"]
          }
        }
      }
    }));

    expect(useRoutineGameStore.getState().applyAiSuggestion(suggestionId)).toEqual({ ok: true });
    expect(useRoutineGameStore.getState().stepsByRoutineId[MORNING_ROUTINE_ID][1]?.recommendedDurationSec).toBe(900);
    expect(useRoutineGameStore.getState().routinesById[MORNING_ROUTINE_ID]?.estimatedDurationSec).toBe(1560);
    expect(useRoutineGameStore.getState().aiSuggestionsById[suggestionId]?.status).toBe("applied");
  });

  it("tracks surprise quest accept, complete, and skip transitions", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    useRoutineGameStore.setState((state) => ({
      surpriseQuestsById: {
        ...state.surpriseQuestsById,
        "surprise-2026-03-31": {
          id: "surprise-2026-03-31",
          dateKey: "2026-03-31",
          title: "출발 전 물 한 컵 챙기기",
          contextType: "health",
          difficulty: 1,
          rewardType: "score",
          status: "proposed",
          sourceSuggestionId: "ai-surprise-2026-03-31"
        }
      },
      aiSuggestionsById: {
        ...state.aiSuggestionsById,
        "ai-surprise-2026-03-31": {
          id: "ai-surprise-2026-03-31",
          type: "surprise_quest",
          targetDateKey: "2026-03-31",
          generatedAt: "2026-03-31T00:00:00.000Z",
          reasoningSummary: "core routine을 막지 않는 사이드 미션입니다.",
          confidence: 0.63,
          status: "pending",
          source: "fallback",
          payload: {
            kind: "surprise_quest",
            questId: "surprise-2026-03-31",
            quest: {
              id: "surprise-2026-03-31",
              dateKey: "2026-03-31",
              title: "출발 전 물 한 컵 챙기기",
              contextType: "health",
              difficulty: 1,
              rewardType: "score",
              status: "proposed",
              sourceSuggestionId: "ai-surprise-2026-03-31"
            }
          }
        }
      }
    }));

    expect(useRoutineGameStore.getState().acceptSurpriseQuest("surprise-2026-03-31")).toEqual({ ok: true });
    expect(useRoutineGameStore.getState().surpriseQuestsById["surprise-2026-03-31"]?.status).toBe("accepted");
    expect(useRoutineGameStore.getState().aiSuggestionsById["ai-surprise-2026-03-31"]?.status).toBe("applied");

    expect(useRoutineGameStore.getState().completeSurpriseQuest("surprise-2026-03-31")).toEqual({ ok: true });
    expect(useRoutineGameStore.getState().surpriseQuestsById["surprise-2026-03-31"]?.status).toBe("completed");

    useRoutineGameStore.setState((state) => ({
      surpriseQuestsById: {
        ...state.surpriseQuestsById,
        "surprise-2026-03-31": {
          ...state.surpriseQuestsById["surprise-2026-03-31"],
          status: "proposed"
        }
      },
      aiSuggestionsById: {
        ...state.aiSuggestionsById,
        "ai-surprise-2026-03-31": {
          ...state.aiSuggestionsById["ai-surprise-2026-03-31"],
          status: "pending"
        }
      }
    }));
    expect(useRoutineGameStore.getState().skipSurpriseQuest("surprise-2026-03-31")).toEqual({ ok: true });
    expect(useRoutineGameStore.getState().surpriseQuestsById["surprise-2026-03-31"]?.status).toBe("skipped");
    expect(useRoutineGameStore.getState().aiSuggestionsById["ai-surprise-2026-03-31"]?.status).toBe("dismissed");
  });

  it("persists the AI review summary when one is ready at confirm time", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: useRoutineGameStore.getState().selectedRoutineId as string }));
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();

    useRoutineGameStore.setState((state) => ({
      aiSuggestionsById: {
        ...state.aiSuggestionsById,
        "ai-review-2026-03-31": {
          id: "ai-review-2026-03-31",
          type: "review_commentary",
          targetDateKey: "2026-03-31",
          generatedAt: "2026-03-31T14:00:00.000Z",
          reasoningSummary: "AI가 review commentary를 준비했습니다.",
          confidence: 0.8,
          status: "pending",
          source: "ai",
          payload: {
            kind: "review_commentary",
            summary: {
              id: "review-2026-03-31",
              dateKey: "2026-03-31",
              generatedAt: "2026-03-31T14:00:00.000Z",
              headline: "AI 정산 헤드라인",
              body: "AI가 오늘 흐름을 더 또렷하게 정리했습니다.",
              stableRoutines: ["Morning Reset"],
              frictionPoints: [],
              tomorrowHints: ["내일도 Morning Reset으로 시작하세요."],
              source: "ai",
              sourceSuggestionId: "ai-review-2026-03-31"
            }
          }
        }
      }
    }));

    expect(useRoutineGameStore.getState().confirmDayReview()).toEqual({ ok: true });
    expect(useRoutineGameStore.getState().reviewSummariesById["review-2026-03-31"]?.source).toBe("ai");
    expect(useRoutineGameStore.getState().reviewSummariesById["review-2026-03-31"]?.sourceSuggestionId).toBe("ai-review-2026-03-31");
    expect(useRoutineGameStore.getState().aiSuggestionsById["ai-review-2026-03-31"]?.status).toBe("applied");
  });

  it("opens the town view on the current game month and builds a snapshot cache", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    useRoutineGameStore.getState().openTownView();

    const state = useRoutineGameStore.getState();
    expect(state.activeView).toBe("town");
    expect(state.selectedTownMonthKey).toBe("2026-03");
    expect(state.selectedTownDateKey).toBe("2026-03-31");
    expect(state.townMonthsByKey["2026-03"]).toBeTruthy();
  });

  it("selects the last built plot when moving to a past month in town view", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    useRoutineGameStore.setState((state) => ({
      sessionsById: {
        ...state.sessionsById,
        "session-feb-03": {
          id: "session-feb-03",
          routineId: MORNING_ROUTINE_ID,
          dateKey: "2026-02-03",
          startedAt: "2026-02-03T08:00:00.000+09:00",
          endedAt: "2026-02-03T08:10:00.000+09:00",
          triggerSource: "manual",
          status: "reviewed",
          resultGrade: "Clear",
          baseScore: 200,
          timeBonus: 100,
          comboBonus: 50,
          clearBonus: 150,
          cleanRunBonus: 0,
          firstSessionBonus: 0,
          focusBonus: 0,
          streakBonus: 0,
          totalScore: 500,
          normalizedScore: 0.7,
          completedStepCount: 5,
          skippedStepCount: 0,
          pausedCount: 0,
          wasGraceApplied: false
        },
        "session-feb-18": {
          id: "session-feb-18",
          routineId: NIGHT_ROUTINE_ID,
          dateKey: "2026-02-18",
          startedAt: "2026-02-18T21:00:00.000+09:00",
          endedAt: "2026-02-18T21:12:00.000+09:00",
          triggerSource: "manual",
          status: "reviewed",
          resultGrade: "Great",
          baseScore: 220,
          timeBonus: 120,
          comboBonus: 60,
          clearBonus: 150,
          cleanRunBonus: 0,
          firstSessionBonus: 0,
          focusBonus: 0,
          streakBonus: 0,
          totalScore: 550,
          normalizedScore: 0.8,
          completedStepCount: 5,
          skippedStepCount: 0,
          pausedCount: 0,
          wasGraceApplied: false
        }
      }
    }));
    useRoutineGameStore.getState().hydrateGame();

    useRoutineGameStore.getState().openTownView();
    useRoutineGameStore.getState().selectTownMonth("2026-02");

    const state = useRoutineGameStore.getState();
    expect(state.selectedTownMonthKey).toBe("2026-02");
    expect(state.selectedTownDateKey).toBe("2026-02-18");
    expect(state.townMonthsByKey["2026-02"]?.totalFloorCount).toBe(2);
  });

  it("refreshes the town snapshot when day review and ornament rewards land", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: useRoutineGameStore.getState().selectedRoutineId as string }));
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();

    const pendingSnapshot = useRoutineGameStore.getState().townMonthsByKey["2026-03"]?.plotSnapshots.find((plot) => plot.dateKey === "2026-03-31");
    expect(pendingSnapshot?.roofType).toBe("none");

    useRoutineGameStore.getState().confirmDayReview();

    const reviewedSnapshot = useRoutineGameStore.getState().townMonthsByKey["2026-03"]?.plotSnapshots.find((plot) => plot.dateKey === "2026-03-31");
    expect(reviewedSnapshot?.roofType).toBe("high");

    useRoutineGameStore.setState((state) => ({
      surpriseQuestsById: {
        ...state.surpriseQuestsById,
        "quest-town-ornament": {
          id: "quest-town-ornament",
          dateKey: "2026-03-31",
          title: "입구 화분 놓기",
          contextType: "home",
          difficulty: 1,
          rewardType: "ornament",
          status: "accepted",
          acceptedAt: "2026-03-31T09:00:00.000Z"
        }
      }
    }));

    expect(useRoutineGameStore.getState().completeSurpriseQuest("quest-town-ornament")).toEqual({ ok: true });
    expect(useRoutineGameStore.getState().dailyBuildingsByDate["2026-03-31"]?.ornamentIds).toEqual(["quest-town-ornament"]);
    expect(
      useRoutineGameStore.getState().townMonthsByKey["2026-03"]?.plotSnapshots.find((plot) => plot.dateKey === "2026-03-31")?.ornamentIds
    ).toEqual(["quest-town-ornament"]);
  });

  it("rebuilds stale town month caches during hydrate", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    useRoutineGameStore
      .getState()
      .startRoutineSession(buildLaunchContext({ routineId: useRoutineGameStore.getState().selectedRoutineId as string }));
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();

    useRoutineGameStore.setState((state) => ({
      townMonthsByKey: {
        ...state.townMonthsByKey,
        "2026-03": {
          monthKey: "2026-03",
          seasonTheme: "spring",
          plotSnapshots: [],
          landmarkIds: [],
          totalFloorCount: 999,
          generatedAt: "2026-03-31T00:00:00.000Z"
        }
      }
    }));

    useRoutineGameStore.getState().hydrateGame();

    const townMonth = useRoutineGameStore.getState().townMonthsByKey["2026-03"];
    expect(townMonth?.totalFloorCount).toBe(1);
    expect(townMonth?.plotSnapshots).toHaveLength(1);
  });

  it("resets routines and sessions without reintroducing seed data immediately", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();

    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));
    useRoutineGameStore.getState().resetGameData();

    const state = useRoutineGameStore.getState();
    expect(state.routinesById).toEqual({});
    expect(state.sessionsById).toEqual({});
    expect(state.sessionRuntimeBySessionId).toEqual({});
    expect(state.hasBootstrappedDefaults).toBe(true);
  });

  it("auto-migrates legacy quest storage without deleting the source payload", async () => {
    await useRoutineGameStore.persist.rehydrate();
    localStorage.setItem(
      LEGACY_QUESTOWN_STORAGE_NAME,
      JSON.stringify({
        state: {
          currentDateKey: "2026-03-31",
          selectedMonth: "2026-03",
          recordsByDate: {
            "2026-03-31": {
              quests: [{ title: "가방 챙기기", type: "main", completed: true }],
              isFinalized: true,
              roofType: "high"
            }
          }
        }
      })
    );
    localStorage.setItem(ROUTINE_GAME_STORAGE_NAME, JSON.stringify({ state: {}, version: 1 }));

    useRoutineGameStore.getState().hydrateGame();

    const firstState = useRoutineGameStore.getState();
    expect(localStorage.getItem(LEGACY_QUESTOWN_STORAGE_NAME)).toContain("가방 챙기기");
    expect(firstState.migrationNotice?.body).toContain("routine history");
    expect(Object.keys(firstState.migrationMetaBySourceFingerprint)).toHaveLength(1);
    expect(Object.keys(firstState.sessionsById)).toHaveLength(1);
    expect(firstState.dailyBuildingsByDate["2026-03-31"]?.roofType).toBe("high");

    useRoutineGameStore.getState().hydrateGame();

    expect(Object.keys(useRoutineGameStore.getState().sessionsById)).toHaveLength(1);
  });

  it("previews and applies a routine backup through the unified import flow", async () => {
    await useRoutineGameStore.persist.rehydrate();
    useRoutineGameStore.getState().hydrateGame();
    const routineId = useRoutineGameStore.getState().selectedRoutineId as string;
    useRoutineGameStore.getState().startRoutineSession(buildLaunchContext({ routineId }));
    advanceAndCompleteAllSteps(useRoutineGameStore);
    useRoutineGameStore.getState().dismissCompletedSession();
    useRoutineGameStore.getState().confirmDayReview();

    const backup = useRoutineGameStore.getState().exportBackup();
    useRoutineGameStore.getState().resetGameData();

    const preview = useRoutineGameStore.getState().previewBackupImport(backup);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    expect(preview.preview.sourceKind).toBe("routine_backup");
    expect(preview.preview.dateCount).toBe(1);

    expect(useRoutineGameStore.getState().applyBackupImport(preview.preview)).toEqual({ ok: true });
    expect(useRoutineGameStore.getState().activeView).toBe("manage");
    expect(useRoutineGameStore.getState().dailyBuildingsByDate["2026-03-31"]?.finalizedAt).toBeTruthy();
  });
});
