import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { createDefaultRoutineSeed, MORNING_ROUTINE_ID } from "../domain/game-seeds";
import { RoutineDevShellContent, RoutineDevShellContentProps } from "./routine-dev-shell";

const noop = () => {};

const buildProps = (): RoutineDevShellContentProps => {
  const seed = createDefaultRoutineSeed();

  return {
    activeView: "launcher" as const,
    selectedRoutineId: MORNING_ROUTINE_ID,
    activeSessionId: undefined,
    routinesById: seed.routinesById,
    stepsByRoutineId: seed.stepsByRoutineId,
    triggersByRoutineId: seed.triggersByRoutineId,
    sessionsById: {},
    stepResultsBySessionId: {},
    dailyBuildingsByDate: {},
    floorsById: {},
    surpriseQuestsById: {},
    townMonthsByKey: {},
    aiSuggestionsById: {},
    reviewSummariesById: {},
    storageHealth: { readable: true, writable: true, degraded: false },
    legacyResetNotice: undefined,
    clearLegacyResetNotice: noop,
    bootstrapDefaultRoutines: noop,
    selectRoutine: noop,
    startRoutineSession: vi.fn(() => ({ ok: true, sessionId: "session-test-1" })),
    setActiveView: noop,
    resetGameData: noop
  };
};

describe("routine dev shell", () => {
  it("renders the routine registry and inspector panels with seeded routines", () => {
    const markup = renderToStaticMarkup(<RoutineDevShellContent {...buildProps()} />);

    expect(markup).toContain("Routine Registry");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("Night Shutdown");
    expect(markup).toContain("Data Inspector");
    expect(markup).toContain("Routine: 2");
  });

  it("shows the active session panel when a draft session is provided", () => {
    const props = buildProps();
    props.activeView = "session";
    props.activeSessionId = "session-test-1";
    props.sessionsById = {
      "session-test-1": {
        id: "session-test-1",
        routineId: MORNING_ROUTINE_ID,
        dateKey: "2026-03-31",
        startedAt: "2026-03-31T08:30:00.000Z",
        triggerSource: "manual",
        status: "idle",
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
      }
    };
    props.stepResultsBySessionId = { "session-test-1": [] };

    const markup = renderToStaticMarkup(<RoutineDevShellContent {...props} />);

    expect(markup).toContain("Active Session");
    expect(markup).toContain("Morning Reset");
    expect(markup).toContain("Phase 3에서 타이머가 들어온다.");
    expect(markup).toContain("Session: 1");
  });
});
