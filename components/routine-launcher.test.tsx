import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { MORNING_ROUTINE_ID, NIGHT_ROUTINE_ID, createDefaultRoutineSeed } from "../domain/game-seeds";
import { TownDetailOverlay } from "./monthly-town-view";
import { RoutineLauncherContent, RoutineLauncherContentProps } from "./routine-launcher";

const noop = () => {};

const buildProps = (): RoutineLauncherContentProps => {
  const seed = createDefaultRoutineSeed();

  return {
    activeView: "launcher",
    selectedRoutineId: MORNING_ROUTINE_ID,
    activeSessionId: undefined,
    routinesById: seed.routinesById,
    stepsByRoutineId: seed.stepsByRoutineId,
    triggersByRoutineId: seed.triggersByRoutineId,
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
    migrationMetaBySourceFingerprint: {},
    selectedTownMonthKey: undefined,
    selectedTownDateKey: undefined,
    notificationPermission: "default",
    storageHealth: { readable: true, writable: true, degraded: false },
    migrationNotice: undefined,
    recoveryNotice: undefined,
    openRoutinePrelaunch: noop,
    openTodayReview: noop,
    openTownView: noop,
    closeTownView: noop,
    openManageView: noop,
    closeManageView: noop,
    returnToLauncher: noop,
    openActiveSession: noop,
    selectTownMonth: noop,
    selectTownDate: noop,
    ensureTownMonthSnapshot: vi.fn(() => undefined),
    startRoutineSession: vi.fn(() => ({ ok: true, sessionId: "session-phase2" })),
    requestNotificationPermission: vi.fn(async (): Promise<NotificationPermission | "unsupported"> => "granted"),
    pauseActiveSession: vi.fn(() => ({ ok: true })),
    resumeActiveSession: vi.fn(() => ({ ok: true })),
    completeCurrentStep: vi.fn(() => ({ ok: true })),
    skipCurrentStep: vi.fn(() => ({ ok: true })),
    dismissCompletedSession: noop,
    requestLauncherSuggestions: vi.fn(async () => undefined),
    requestDurationSuggestion: vi.fn(async () => undefined),
    requestReviewSuggestion: vi.fn(async () => undefined),
    applyAiSuggestion: vi.fn(() => ({ ok: true })),
    dismissAiSuggestion: vi.fn(() => ({ ok: true })),
    acceptSurpriseQuest: vi.fn(() => ({ ok: true })),
    completeSurpriseQuest: vi.fn(() => ({ ok: true })),
    skipSurpriseQuest: vi.fn(() => ({ ok: true })),
    dismissRemainingRoutineForToday: noop,
    confirmDayReview: vi.fn(() => ({ ok: true })),
    closeDayReview: noop,
    exportBackup: vi.fn(() => ({ version: 1, exportedAt: "2026-03-31T00:00:00.000Z", state: {} as never })),
    previewBackupImport: vi.fn(() => ({ ok: false as const, reason: "not used" })),
    applyBackupImport: vi.fn(() => ({ ok: true })),
    clearRecoveryNotice: noop,
    clearMigrationNotice: noop,
    setActiveView: noop,
    now: new Date("2026-03-31T08:30:00+09:00")
  };
};

const addTownFixture = (props: RoutineLauncherContentProps) => {
  props.selectedTownMonthKey = "2026-03";
  props.selectedTownDateKey = "2026-03-31";
  props.townMonthsByKey = {
    "2026-03": {
      monthKey: "2026-03",
      seasonTheme: "spring",
      plotSnapshots: [
        {
          dateKey: "2026-03-31",
          floorCount: 1,
          roofType: "high",
          ornamentIds: ["quest-ornament"]
        }
      ],
      landmarkIds: ["district:주거지"],
      totalFloorCount: 1,
      generatedAt: "2026-03-31T00:00:00.000Z"
    }
  };
  props.dailyBuildingsByDate = {
    "2026-03-31": {
      dateKey: "2026-03-31",
      sessionIds: ["session-town"],
      floorIds: ["floor-town"],
      roofType: "high",
      ornamentIds: ["quest-ornament"],
      totalScore: 1200,
      successfulSessionCount: 1,
      averageNormalizedScore: 0.88,
      streakSnapshot: {}
    }
  };
  props.floorsById = {
    "floor-town": {
      id: "floor-town",
      sessionId: "session-town",
      dateKey: "2026-03-31",
      routineCategory: "morning_reset",
      visualStyleKey: "floor:town",
      qualityTier: "signature",
      ornamentIds: []
    }
  };
  props.surpriseQuestsById = {
    "quest-ornament": {
      id: "quest-ornament",
      dateKey: "2026-03-31",
      title: "입구 화분 놓기",
      contextType: "home",
      difficulty: 1,
      rewardType: "ornament",
      status: "completed",
      completedAt: "2026-03-31T11:00:00.000Z"
    }
  };
  props.reviewSummariesById = {
    "review-2026-03-31": {
      id: "review-2026-03-31",
      dateKey: "2026-03-31",
      generatedAt: "2026-03-31T14:00:00.000Z",
      headline: "단단한 지붕으로 하루를 닫았습니다.",
      body: "오늘은 리듬이 깨지지 않고 이어졌어요.",
      stableRoutines: ["Morning Reset"],
      frictionPoints: [],
      tomorrowHints: ["Morning Reset으로 시작하세요."],
      source: "fallback"
    }
  };
  props.openTownView = vi.fn();
};

describe("routine launcher", () => {
  it("renders launcher cards without exposing the dev shell", () => {
    const markup = renderToStaticMarkup(<RoutineLauncherContent {...buildProps()} />);

    expect(markup).toContain("지금 시작 가능한 루틴");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("오늘 building 진행");
    expect(markup).toContain("이번 달 타운 보기");
    expect(markup).toContain("관리 화면 열기");
    expect(markup).toContain("보조 정보 보기");
    expect(markup).not.toContain("시간대 알림 켜기");
    expect(markup).not.toContain("surprise quest");
    expect(markup).not.toContain("Routine Registry");
  });

  it("hides the notification opt-in CTA after permission is granted", () => {
    const props = buildProps();
    props.notificationPermission = "granted";

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).not.toContain("시간대 알림 켜기");
  });

  it("renders the town and manage CTAs between today building and surprise quest", () => {
    const props = buildProps();
    addTownFixture(props);

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("이번 달 타운 보기");
    expect(markup).toContain("관리 화면 열기");
    expect(markup.indexOf("오늘 building 진행")).toBeLessThan(markup.indexOf("이번 달 타운 보기"));
    expect(markup.indexOf("이번 달 타운 보기")).toBeLessThan(markup.indexOf("관리 화면 열기"));
    expect(markup.indexOf("관리 화면 열기")).toBeLessThan(markup.indexOf("보조 정보 보기"));
  });

  it("renders the launcher AI note and confidence chip when a suggestion exists", () => {
    const props = buildProps();
    props.aiSuggestionsById = {
      "ai-routine-2026-03-31-routine-morning-reset": {
        id: "ai-routine-2026-03-31-routine-morning-reset",
        type: "routine_recommendation",
        targetDateKey: "2026-03-31",
        targetRoutineId: MORNING_ROUTINE_ID,
        generatedAt: "2026-03-30T23:30:00.000Z",
        reasoningSummary: "아침 첫 판으로 리듬을 여는 편이 오늘 building을 안정적으로 시작하게 해줍니다.",
        confidence: 0.84,
        status: "pending",
        source: "ai",
        payload: {
          kind: "routine_recommendation",
          routineId: MORNING_ROUTINE_ID,
          launchContext: {
            routineId: MORNING_ROUTINE_ID,
            triggerSource: "time",
            triggerId: "trigger-morning-time",
            entrySource: "launcher_hero",
            reasonKey: "time_window_active"
          },
          directorNote: "Morning Reset으로 하루 페이스를 먼저 고정해 두세요."
        }
      }
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("AI Director Note");
    expect(markup).toContain("Morning Reset으로 하루 페이스를 먼저 고정해 두세요.");
    expect(markup).toContain("high confidence");
  });

  it("renders a neutral fallback note when the suggestion source is not AI", () => {
    const props = buildProps();
    props.aiSuggestionsById = {
      "fallback-routine-2026-03-31-routine-morning-reset": {
        id: "fallback-routine-2026-03-31-routine-morning-reset",
        type: "routine_recommendation",
        targetDateKey: "2026-03-31",
        targetRoutineId: MORNING_ROUTINE_ID,
        generatedAt: "2026-03-30T23:30:00.000Z",
        reasoningSummary: "브라우저 로컬 fallback이 현재 시간대와 building 상태를 기준으로 추천했습니다.",
        confidence: 0.63,
        status: "pending",
        source: "fallback",
        payload: {
          kind: "routine_recommendation",
          routineId: MORNING_ROUTINE_ID,
          launchContext: {
            routineId: MORNING_ROUTINE_ID,
            triggerSource: "manual",
            entrySource: "launcher_hero",
            reasonKey: "manual_fallback"
          },
          directorNote: "오늘 첫 판으로 Morning Reset이 가장 부담이 낮습니다."
        }
      }
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("추천 근거");
    expect(markup).toContain("오늘 첫 판으로 Morning Reset이 가장 부담이 낮습니다.");
    expect(markup).not.toContain("AI Director Note");
    expect(markup).not.toContain("high confidence");
  });

  it("keeps surprise quest content inside the collapsed secondary section by default", () => {
    const props = buildProps();
    props.surpriseQuestsById = {
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
    };
    props.aiSuggestionsById = {
      "ai-surprise-2026-03-31": {
        id: "ai-surprise-2026-03-31",
        type: "surprise_quest",
        targetDateKey: "2026-03-31",
        generatedAt: "2026-03-30T23:31:00.000Z",
        reasoningSummary: "부담 없는 사이드 미션으로 water check를 하나 surfaced 했습니다.",
        confidence: 0.66,
        status: "pending",
        source: "ai",
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
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("보조 정보 보기");
    expect(markup).not.toContain("출발 전 물 한 컵 챙기기");
    expect(markup).not.toContain("받기");
    expect(markup).not.toContain("오늘은 넘기기");
  });

  it("renders the prelaunch screen with step preview", () => {
    const props = buildProps();
    props.activeView = "prelaunch";

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Prelaunch");
    expect(markup).toContain("침구 정리");
    expect(markup).toContain("세션 열기");
  });

  it("keeps upcoming prelaunch entries in preview mode until the time window opens", () => {
    const props = buildProps();
    props.activeView = "prelaunch";
    props.selectedRoutineId = NIGHT_ROUTINE_ID;
    props.selectedLaunchContext = {
      routineId: NIGHT_ROUTINE_ID,
      triggerSource: "time",
      triggerId: "trigger-night-time",
      entrySource: "launcher_queue",
      reasonKey: "time_window_upcoming"
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("곧 열릴 시간대 루틴을 미리 준비 중입니다.");
    expect(markup).toContain("지금은 step preview만 가능해요. 시간 창이 열리면 시작할 수 있습니다.");
    expect(markup).toContain("시간 창 대기 중");
    expect(markup).not.toContain(">세션 열기<");
  });

  it("preserves notification-origin entry messaging on prelaunch", () => {
    const props = buildProps();
    props.activeView = "prelaunch";
    props.selectedLaunchContext = {
      routineId: MORNING_ROUTINE_ID,
      triggerSource: "time",
      triggerId: "trigger-morning-time",
      entrySource: "notification",
      reasonKey: "time_window_active"
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("알림에서 바로 진입한 세션입니다.");
  });

  it("renders the session runtime once an active session exists", () => {
    const props = buildProps();
    props.activeView = "session";
    props.activeSessionId = "session-phase2";
    props.sessionsById = {
      "session-phase2": {
        id: "session-phase2",
        routineId: MORNING_ROUTINE_ID,
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T08:30:00.000Z",
        triggerSource: "manual",
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
      }
    };
    props.sessionRuntimeBySessionId = {
      "session-phase2": {
        sessionId: "session-phase2",
        currentStepIndex: 0,
        stepStartedAt: "2026-03-31T08:30:00.000Z",
        accumulatedPauseMs: 0,
        currentComboCount: 0,
        graceUsed: false,
        currentStepPauseCount: 0
      }
    };
    props.stepResultsBySessionId = { "session-phase2": [] };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Routine Session");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("침구 정리");
    expect(markup).toContain("완료");
    expect(markup).toContain("길게 눌러 skip");
  });

  it("renders the result loop when the session is finished", () => {
    const props = buildProps();
    props.activeView = "session";
    props.activeSessionId = "session-phase3-complete";
    props.sessionsById = {
      "session-phase3-complete": {
        id: "session-phase3-complete",
        routineId: MORNING_ROUTINE_ID,
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T08:30:00.000Z",
        endedAt: "2026-03-31T08:59:00.000Z",
        triggerSource: "manual",
        status: "completed",
        resultGrade: "Clear",
        baseScore: 400,
        timeBonus: 120,
        comboBonus: 75,
        clearBonus: 150,
        cleanRunBonus: 0,
        firstSessionBonus: 100,
        focusBonus: 0,
        streakBonus: 0,
        totalScore: 845,
        normalizedScore: 0.65,
        completedStepCount: 4,
        skippedStepCount: 1,
        pausedCount: 1,
        wasGraceApplied: true
      }
    };
    props.floorsById = {
      "floor-session-phase3-complete": {
        id: "floor-session-phase3-complete",
        sessionId: "session-phase3-complete",
        dateKey: "2026-03-31",
        routineCategory: "morning_reset",
        visualStyleKey: "floor:sunrise-home:standard",
        qualityTier: "standard",
        ornamentIds: []
      }
    };
    props.stepResultsBySessionId = {
      "session-phase3-complete": [
        {
          id: "result-1",
          sessionId: "session-phase3-complete",
          stepId: "step-morning-bed",
          order: 1,
          status: "success",
          startedAt: "2026-03-31T08:30:00.000Z",
          endedAt: "2026-03-31T08:31:00.000Z",
          elapsedSec: 60,
          targetDurationSec: 60,
          overtimeSec: 0,
          pauseCount: 0,
          comboIndexAfterStep: 1,
          scoreEarned: 0
        }
      ]
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Result Loop");
    expect(markup).toContain("Clear");
    expect(markup).toContain("score 845");
    expect(markup).toContain("normalized 0.65");
    expect(markup).toContain("floor:sunrise-home:standard");
    expect(markup).toContain("완주했습니다. 다음엔 더 매끄럽게 줄일 수 있어요.");
    expect(markup).toContain("이번 세션 ornament 없음");
    expect(markup).toContain("즉시 닫기");
  });

  it("renders a duration tune card for the just-finished session", () => {
    const props = buildProps();
    props.activeView = "session";
    props.activeSessionId = "session-phase3-complete";
    props.sessionsById = {
      "session-phase3-complete": {
        id: "session-phase3-complete",
        routineId: MORNING_ROUTINE_ID,
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T08:30:00.000Z",
        endedAt: "2026-03-31T08:59:00.000Z",
        triggerSource: "manual",
        status: "completed",
        resultGrade: "Clear",
        baseScore: 400,
        timeBonus: 120,
        comboBonus: 75,
        clearBonus: 150,
        cleanRunBonus: 0,
        firstSessionBonus: 100,
        focusBonus: 0,
        streakBonus: 0,
        totalScore: 845,
        normalizedScore: 0.65,
        completedStepCount: 4,
        skippedStepCount: 1,
        pausedCount: 1,
        wasGraceApplied: true
      }
    };
    props.aiSuggestionsById = {
      "ai-duration-session-phase3-complete": {
        id: "ai-duration-session-phase3-complete",
        type: "duration_tune",
        targetDateKey: "2026-03-31",
        targetRoutineId: MORNING_ROUTINE_ID,
        targetSessionId: "session-phase3-complete",
        generatedAt: "2026-03-30T23:35:00.000Z",
        reasoningSummary: "세수/샤워 step에서 overtime이 반복돼 시간을 조금 늘리는 편이 더 안정적입니다.",
        confidence: 0.71,
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
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Duration Tune");
    expect(markup).toContain("세수/샤워");
    expect(markup).toContain("12분 → 15분");
    expect(markup).toContain("이번부터 반영");
  });

  it("renders launcher building data when a daily building exists", () => {
    const props = buildProps();
    props.dailyBuildingsByDate = {
      "2026-03-31": {
        dateKey: "2026-03-31",
        sessionIds: ["session-1"],
        floorIds: ["floor-session-1"],
        roofType: "none",
        ornamentIds: [],
        totalScore: 980,
        successfulSessionCount: 1,
        averageNormalizedScore: 0.91,
        streakSnapshot: {
          [MORNING_ROUTINE_ID]: 3
        }
      }
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("floor 1");
    expect(markup).toContain("score 980");
    expect(markup).toContain("오늘 리뷰");
    expect(markup).not.toContain("streak 3");
  });

  it("renders the review gate with remaining routines", () => {
    const props = buildProps();
    props.activeView = "review_gate";
    props.sessionsById = {
      "session-night": {
        id: "session-night",
        routineId: "routine-night-shutdown",
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T21:00:00.000+09:00",
        endedAt: "2026-03-31T21:20:00.000+09:00",
        triggerSource: "time",
        status: "reviewed",
        resultGrade: "Great",
        baseScore: 500,
        timeBonus: 200,
        comboBonus: 120,
        clearBonus: 150,
        cleanRunBonus: 120,
        firstSessionBonus: 0,
        focusBonus: 80,
        streakBonus: 0,
        totalScore: 1070,
        normalizedScore: 0.9,
        completedStepCount: 5,
        skippedStepCount: 0,
        pausedCount: 0,
        wasGraceApplied: false
      }
    };
    props.now = new Date("2026-03-31T21:30:00+09:00");

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Review Gate");
    expect(markup).toContain("남은 세션을 수행하면 지붕을 더 높일 수 있습니다.");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("세션 열기");
    expect(markup).toContain("지금 리뷰 보기");
  });

  it("renders the day review screen with building summary", () => {
    const seed = createDefaultRoutineSeed();
    const props = buildProps();
    props.activeView = "day_review";
    props.dailyBuildingsByDate = {
      "2026-03-31": {
        dateKey: "2026-03-31",
        sessionIds: ["session-1"],
        floorIds: ["floor-session-1"],
        roofType: "high",
        ornamentIds: [],
        totalScore: 980,
        successfulSessionCount: 1,
        averageNormalizedScore: 0.91,
        streakSnapshot: {
          [MORNING_ROUTINE_ID]: 3
        }
      }
    };
    props.floorsById = {
      "floor-session-1": {
        id: "floor-session-1",
        sessionId: "session-1",
        dateKey: "2026-03-31",
        routineCategory: "morning_reset",
        visualStyleKey: "floor:sunrise-home:signature",
        qualityTier: "signature",
        ornamentIds: []
      }
    };
    props.sessionsById = {
      "session-1": {
        id: "session-1",
        routineId: MORNING_ROUTINE_ID,
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T08:30:00.000+09:00",
        endedAt: "2026-03-31T08:50:00.000+09:00",
        triggerSource: "manual",
        status: "reviewed",
        resultGrade: "Perfect",
        baseScore: 500,
        timeBonus: 200,
        comboBonus: 150,
        clearBonus: 150,
        cleanRunBonus: 120,
        firstSessionBonus: 100,
        focusBonus: 80,
        streakBonus: 30,
        totalScore: 1180,
        normalizedScore: 0.98,
        completedStepCount: 5,
        skippedStepCount: 0,
        pausedCount: 0,
        wasGraceApplied: false
      }
    };
    props.stepResultsBySessionId = {
      "session-1": seed.stepsByRoutineId[MORNING_ROUTINE_ID].map((step, index) => ({
        id: `step-result-${index + 1}`,
        sessionId: "session-1",
        stepId: step.id,
        order: step.order,
        status: "success" as const,
        startedAt: "2026-03-31T08:30:00.000+09:00",
        endedAt: "2026-03-31T08:31:00.000+09:00",
        elapsedSec: step.recommendedDurationSec,
        targetDurationSec: step.recommendedDurationSec,
        overtimeSec: 0,
        pauseCount: 0,
        comboIndexAfterStep: index + 1,
        scoreEarned: 140 + index * 25
      }))
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Day Review");
    expect(markup).toContain("오늘 정산을 확인하고 지붕을 닫습니다.");
    expect(markup).toContain("Today Building");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("오늘 정산 확정");
    expect(markup).toContain("Tomorrow Hint");
  });

  it("renders AI review commentary when a pending review suggestion exists", () => {
    const props = buildProps();
    props.activeView = "day_review";
    props.dailyBuildingsByDate = {
      "2026-03-31": {
        dateKey: "2026-03-31",
        sessionIds: [],
        floorIds: [],
        roofType: "high",
        ornamentIds: [],
        totalScore: 980,
        successfulSessionCount: 1,
        averageNormalizedScore: 0.91,
        streakSnapshot: {}
      }
    };
    props.aiSuggestionsById = {
      "ai-review-2026-03-31": {
        id: "ai-review-2026-03-31",
        type: "review_commentary",
        targetDateKey: "2026-03-31",
        generatedAt: "2026-03-30T23:40:00.000Z",
        reasoningSummary: "AI가 fallback summary를 더 또렷하게 다듬었습니다.",
        confidence: 0.77,
        status: "pending",
        source: "ai",
        payload: {
          kind: "review_commentary",
          summary: {
            id: "review-2026-03-31",
            dateKey: "2026-03-31",
            generatedAt: "2026-03-30T23:40:00.000Z",
            headline: "오늘 흐름이 안정적으로 닫혔어요.",
            body: "아침 루틴이 building의 첫 페이스를 잡아 줬고, 남은 friction은 밤 루틴 준비만 다듬으면 됩니다.",
            stableRoutines: ["Morning Reset"],
            frictionPoints: ["Night Shutdown 보류"],
            tomorrowHints: ["내일 첫 루틴은 Morning Reset으로 바로 시작하세요."],
            source: "ai",
            sourceSuggestionId: "ai-review-2026-03-31"
          }
        }
      }
    };

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("AI commentary");
    expect(markup).toContain("오늘 흐름이 안정적으로 닫혔어요.");
    expect(markup).toContain("내일 첫 루틴은 Morning Reset으로 바로 시작하세요.");
  });

  it("renders the town view with the month snapshot when active", () => {
    const props = buildProps();
    addTownFixture(props);
    props.activeView = "town";

    const markup = renderToStaticMarkup(<RoutineLauncherContent {...props} />);

    expect(markup).toContain("Quest Town");
    expect(markup).toContain("2026년 3월");
    expect(markup).toContain("봄 테마");
    expect(markup).toContain("floor 1");
  });

  it("renders the town detail overlay with review and ornament data", () => {
    const markup = renderToStaticMarkup(
      <TownDetailOverlay
        date="2026-03-31"
        currentDateKey="2026-03-31"
        plot={{ day: 31, date: "2026-03-31", col: 2, row: 4, district: "축제 확장지" }}
        floorCount={1}
        roofType="high"
        ornamentIds={["quest-ornament"]}
        building={{
          dateKey: "2026-03-31",
          sessionIds: ["session-town"],
          floorIds: ["floor-town"],
          roofType: "high",
          ornamentIds: ["quest-ornament"],
          totalScore: 1200,
          successfulSessionCount: 1,
          averageNormalizedScore: 0.88,
          streakSnapshot: {}
        }}
        reviewSummary={{
          id: "review-2026-03-31",
          dateKey: "2026-03-31",
          generatedAt: "2026-03-31T14:00:00.000Z",
          headline: "단단한 지붕으로 하루를 닫았습니다.",
          body: "오늘은 리듬이 깨지지 않고 이어졌어요.",
          stableRoutines: ["Morning Reset"],
          frictionPoints: [],
          tomorrowHints: ["Morning Reset으로 시작하세요."],
          source: "fallback"
        }}
        districtProgress={{
          district: "축제 확장지",
          activePlotCount: 1,
          completedMain: 1,
          totalMain: 1,
          targetMain: 1,
          unlocked: true,
          remainingMain: 0,
          isCore: false
        }}
        districtRewardMessage="축제 장식이 해금됐어요."
        surpriseQuestsById={{
          "quest-ornament": {
            id: "quest-ornament",
            dateKey: "2026-03-31",
            title: "입구 화분 놓기",
            contextType: "home",
            difficulty: 1,
            rewardType: "ornament",
            status: "completed"
          }
        }}
        onClose={noop}
      />
    );

    expect(markup).toContain("Town Detail");
    expect(markup).toContain("단단한 지붕으로 하루를 닫았습니다.");
    expect(markup).toContain("입구 화분 놓기");
    expect(markup).toContain("축제 장식이 해금됐어요.");
  });
});
