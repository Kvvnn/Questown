import { describe, expect, it } from "vitest";
import { MORNING_ROUTINE_ID, NIGHT_ROUTINE_ID, createDefaultRoutineSeed } from "./game-seeds";
import { createFixedOffsetTimeContext } from "./local-time";
import { Routine, RoutineTrigger } from "./game-types";
import {
  getPendingNotificationCandidate,
  getRoutineLaunchAvailability,
  getTriggerEvaluatorResult
} from "./routine-trigger-evaluator";

const createExtraRoutine = (id: string, name: string): Routine => ({
  id,
  name,
  category: "custom",
  sessionRole: "standard",
  estimatedDurationSec: 300,
  themeKey: "custom-theme",
  difficulty: 2,
  successProfile: "gentle",
  isEnabled: true,
  createdAt: "2026-03-31T00:00:00.000Z",
  updatedAt: "2026-03-31T00:00:00.000Z"
});

const createExtraTimeTrigger = (id: string, routineId: string, startMinuteOfDay: number): RoutineTrigger => ({
  id,
  routineId,
  triggerType: "time",
  triggerConfig: {
    type: "time",
    weekdayMask: [0, 1, 2, 3, 4, 5, 6],
    startMinuteOfDay,
    endMinuteOfDay: startMinuteOfDay + 30
  },
  priority: 80,
  cooldownMinutes: 0,
  isEnabled: true
});

describe("routine trigger evaluator", () => {
  it("surfaces the active morning routine and upcoming night routine", () => {
    const seed = createDefaultRoutineSeed();
    const evaluation = getTriggerEvaluatorResult({
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      now: new Date("2026-03-31T08:30:00+09:00")
    });

    expect(evaluation.primaryRecommendation?.routine.id).toBe(MORNING_ROUTINE_ID);
    expect(evaluation.primaryRecommendation?.launchContext.triggerSource).toBe("time");
    expect(evaluation.upcomingRecommendations[0]?.routine.id).toBe(NIGHT_ROUTINE_ID);
    expect(evaluation.upcomingRecommendations[0]?.launchContext.triggerSource).toBe("time");
    expect(evaluation.upcomingRecommendations[0]?.launchContext.reasonKey).toBe("time_window_upcoming");
    expect(evaluation.notificationCandidate?.notificationWindowKey).toContain("trigger-morning-time");
  });

  it("falls back to a manual recommendation only when no time window is active", () => {
    const seed = createDefaultRoutineSeed();
    const evaluation = getTriggerEvaluatorResult({
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      now: new Date("2026-03-31T14:00:00+09:00")
    });

    expect(evaluation.primaryRecommendation?.launchContext.triggerSource).toBe("manual");
    expect(evaluation.primaryRecommendation?.launchContext.reasonKey).toBe("manual_fallback");
    expect(evaluation.notificationCandidate).toBeNull();
  });

  it("orders and truncates the upcoming queue", () => {
    const seed = createDefaultRoutineSeed();
    const routinesById = {
      ...seed.routinesById,
      "routine-extra-1": createExtraRoutine("routine-extra-1", "Extra One"),
      "routine-extra-2": createExtraRoutine("routine-extra-2", "Extra Two"),
      "routine-extra-3": createExtraRoutine("routine-extra-3", "Extra Three")
    };
    const triggersByRoutineId = {
      ...seed.triggersByRoutineId,
      "routine-extra-1": [createExtraTimeTrigger("trigger-extra-1", "routine-extra-1", 11 * 60)],
      "routine-extra-2": [createExtraTimeTrigger("trigger-extra-2", "routine-extra-2", 13 * 60)],
      "routine-extra-3": [createExtraTimeTrigger("trigger-extra-3", "routine-extra-3", 15 * 60)]
    };

    const evaluation = getTriggerEvaluatorResult({
      routinesById,
      triggersByRoutineId,
      sessionsById: {},
      now: new Date("2026-03-31T08:30:00+09:00"),
      upcomingLimit: 3
    });

    expect(evaluation.upcomingRecommendations).toHaveLength(3);
    expect(evaluation.upcomingRecommendations.map((item) => item.routine.id)).toEqual([
      "routine-extra-1",
      "routine-extra-2",
      "routine-extra-3"
    ]);
  });

  it("respects the 05:00 local rollover with an injected time context", () => {
    const seed = createDefaultRoutineSeed();
    const pacificTime = createFixedOffsetTimeContext(-7 * 60);

    const beforeRollover = getTriggerEvaluatorResult({
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      now: new Date("2026-04-01T04:59:00-07:00"),
      timeContext: pacificTime
    });
    const afterRollover = getTriggerEvaluatorResult({
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      now: new Date("2026-04-01T05:00:00-07:00"),
      timeContext: pacificTime
    });

    expect(beforeRollover.primaryRecommendation?.launchContext.triggerSource).toBe("manual");
    expect(beforeRollover.upcomingRecommendations[0]?.routine.id).toBe(MORNING_ROUTINE_ID);
    expect(afterRollover.primaryRecommendation?.routine.id).toBe(MORNING_ROUTINE_ID);
    expect(afterRollover.primaryRecommendation?.launchContext.triggerSource).toBe("time");
  });

  it("uses a stable trigger-window key for notification de-duping", () => {
    const seed = createDefaultRoutineSeed();
    const evaluation = getTriggerEvaluatorResult({
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      now: new Date("2026-03-31T08:30:00+09:00")
    });

    const candidate = evaluation.notificationCandidate;
    expect(candidate).not.toBeNull();
    expect(
      getPendingNotificationCandidate({
        evaluation,
        lastNotifiedTriggerWindowKey: candidate?.notificationWindowKey
      })
    ).toBeNull();
  });

  it("blocks upcoming time-window starts until the trigger window actually opens", () => {
    const seed = createDefaultRoutineSeed();
    const evaluation = getTriggerEvaluatorResult({
      routinesById: seed.routinesById,
      triggersByRoutineId: seed.triggersByRoutineId,
      sessionsById: {},
      now: new Date("2026-03-31T08:30:00+09:00")
    });

    const upcomingRecommendation = evaluation.upcomingRecommendations[0];
    expect(upcomingRecommendation).toBeDefined();

    const availability = getRoutineLaunchAvailability({
      launchContext: upcomingRecommendation?.launchContext ?? {
        routineId: NIGHT_ROUTINE_ID,
        triggerSource: "time",
        triggerId: "trigger-night-time",
        entrySource: "launcher_queue",
        reasonKey: "time_window_upcoming"
      },
      triggers: seed.triggersByRoutineId[NIGHT_ROUTINE_ID] ?? [],
      now: new Date("2026-03-31T08:30:00+09:00")
    });

    expect(availability.canStartNow).toBe(false);
    expect(availability.windowState).toBe("upcoming");
    expect(availability.blockedReason).toContain("step preview");
  });
});
