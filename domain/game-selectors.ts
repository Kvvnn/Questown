import { toDateKey } from "./date";
import {
  ActiveStepTiming,
  LauncherSurpriseQuestPreview,
  NextScheduledRoutineCandidate,
  Routine,
  RoutineSession,
  SessionProgressSnapshot,
  SessionRuntime,
  RoutineStep,
  RoutineStreakSummary,
  RoutineTrigger,
  SessionStepResult,
  SessionDraftSummary,
  StartableRoutineCandidate,
  SurpriseQuest,
  TodayBuildingPreview
} from "./game-types";

const toMinuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

const buildDateAtMinuteOfDay = (date: Date, minuteOfDay: number) => {
  const candidate = new Date(date);
  candidate.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  return candidate;
};

const parseTimestamp = (value: string | undefined) => {
  if (!value) return NaN;
  return new Date(value).getTime();
};

const getElapsedMsFromRuntime = (runtime: SessionRuntime, now: Date) => {
  const stepStartedAt = parseTimestamp(runtime.stepStartedAt);
  if (Number.isNaN(stepStartedAt)) return 0;

  const pausedAt = parseTimestamp(runtime.pausedAt);
  const referenceTime = Number.isNaN(pausedAt) ? now.getTime() : pausedAt;
  return Math.max(0, referenceTime - stepStartedAt - runtime.accumulatedPauseMs);
};

const matchesTimeWindow = (trigger: RoutineTrigger, now: Date) => {
  if (trigger.triggerType !== "time" || trigger.triggerConfig.type !== "time") return false;
  if (!trigger.isEnabled) return false;

  const weekday = now.getDay();
  if (!trigger.triggerConfig.weekdayMask.includes(weekday)) return false;

  const minuteOfDay = toMinuteOfDay(now);
  const { startMinuteOfDay, endMinuteOfDay } = trigger.triggerConfig;

  if (startMinuteOfDay <= endMinuteOfDay) {
    return minuteOfDay >= startMinuteOfDay && minuteOfDay <= endMinuteOfDay;
  }

  return minuteOfDay >= startMinuteOfDay || minuteOfDay <= endMinuteOfDay;
};

export const getRoutineList = (routinesById: Record<string, Routine>) =>
  Object.values(routinesById).sort((left, right) => left.name.localeCompare(right.name, "en"));

export const getRoutineById = (routinesById: Record<string, Routine>, routineId: string | undefined) =>
  routineId ? routinesById[routineId] : undefined;

export const getStepsForRoutine = (stepsByRoutineId: Record<string, RoutineStep[]>, routineId: string | undefined) =>
  routineId ? [...(stepsByRoutineId[routineId] ?? [])].sort((left, right) => left.order - right.order) : [];

export const getStartableRoutines = (
  routinesById: Record<string, Routine>,
  triggersByRoutineId: Record<string, RoutineTrigger[]>,
  now = new Date()
): StartableRoutineCandidate[] =>
  getRoutineList(routinesById)
    .filter((routine) => routine.isEnabled)
    .map((routine) => {
      const triggers = triggersByRoutineId[routine.id] ?? [];
      const matchedTriggers = triggers.filter((trigger) => {
        if (!trigger.isEnabled) return false;
        if (trigger.triggerType === "manual" && trigger.triggerConfig.type === "manual") return true;
        return matchesTimeWindow(trigger, now);
      });

      return {
        routine,
        matchedTriggers,
        isManualAvailable: matchedTriggers.some((trigger) => trigger.triggerType === "manual"),
        isTimeWindowActive: matchedTriggers.some((trigger) => trigger.triggerType === "time")
      };
    })
    .filter((candidate) => candidate.matchedTriggers.length > 0)
    .sort((left, right) => Number(right.isTimeWindowActive) - Number(left.isTimeWindowActive) || left.routine.name.localeCompare(right.routine.name, "en"));

export const getLauncherHeroRoutine = (
  routinesById: Record<string, Routine>,
  triggersByRoutineId: Record<string, RoutineTrigger[]>,
  now = new Date()
) => getStartableRoutines(routinesById, triggersByRoutineId, now)[0] ?? null;

const getNextTimeTriggerStart = (trigger: RoutineTrigger, now: Date, horizonDays: number) => {
  if (trigger.triggerType !== "time" || trigger.triggerConfig.type !== "time") return null;
  if (!trigger.isEnabled) return null;

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const candidateDate = new Date(now);
    candidateDate.setHours(0, 0, 0, 0);
    candidateDate.setDate(candidateDate.getDate() + offset);

    if (!trigger.triggerConfig.weekdayMask.includes(candidateDate.getDay())) continue;

    const start = buildDateAtMinuteOfDay(candidateDate, trigger.triggerConfig.startMinuteOfDay);
    if (start <= now) continue;

    return start;
  }

  return null;
};

export const getNextScheduledRoutine = (
  routinesById: Record<string, Routine>,
  triggersByRoutineId: Record<string, RoutineTrigger[]>,
  excludedRoutineId: string | undefined,
  now = new Date(),
  horizonDays = 7
): NextScheduledRoutineCandidate | null => {
  let best: NextScheduledRoutineCandidate | null = null;

  getRoutineList(routinesById)
    .filter((routine) => routine.isEnabled && routine.id !== excludedRoutineId)
    .forEach((routine) => {
      const triggers = triggersByRoutineId[routine.id] ?? [];

      triggers.forEach((trigger) => {
        const nextStart = getNextTimeTriggerStart(trigger, now, horizonDays);
        if (!nextStart) return;

        const candidate: NextScheduledRoutineCandidate = {
          routine,
          trigger,
          scheduledAt: nextStart.toISOString()
        };

        if (!best) {
          best = candidate;
          return;
        }

        if (candidate.scheduledAt < best.scheduledAt) {
          best = candidate;
          return;
        }

        if (candidate.scheduledAt === best.scheduledAt && candidate.routine.name.localeCompare(best.routine.name, "en") < 0) {
          best = candidate;
        }
      });
    });

  return best;
};

export const getTodayBuildingPreview = (
  dailyBuildingsByDate: Record<string, { floorIds: string[]; successfulSessionCount: number; roofType: TodayBuildingPreview["roofType"]; totalScore: number }>,
  now = new Date()
): TodayBuildingPreview => {
  const todayBuilding = dailyBuildingsByDate[toDateKey(now)];
  if (!todayBuilding) {
    return {
      hasBuilding: false,
      floorCount: 0,
      successfulSessionCount: 0,
      roofType: "none",
      totalScore: 0
    };
  }

  return {
    hasBuilding: true,
    floorCount: todayBuilding.floorIds.length,
    successfulSessionCount: todayBuilding.successfulSessionCount,
    roofType: todayBuilding.roofType,
    totalScore: todayBuilding.totalScore
  };
};

export const getRoutineStreakSummary = (
  dailyBuildingsByDate: Record<string, { streakSnapshot: Record<string, number> }>,
  routinesById: Record<string, Routine>
): RoutineStreakSummary => {
  let topRoutineId: string | undefined;
  let topRoutineStreak = 0;

  Object.values(dailyBuildingsByDate).forEach((building) => {
    Object.entries(building.streakSnapshot).forEach(([routineId, streak]) => {
      if (streak > topRoutineStreak) {
        topRoutineStreak = streak;
        topRoutineId = routineId;
      }
    });
  });

  return {
    hasData: topRoutineStreak > 0,
    topRoutineName: topRoutineId ? routinesById[topRoutineId]?.name ?? topRoutineId : undefined,
    topRoutineStreak,
    currentComboCount: 0
  };
};

export const getLauncherSurpriseQuest = (
  surpriseQuestsById: Record<string, SurpriseQuest>,
  now = new Date()
): LauncherSurpriseQuestPreview => {
  const todayDateKey = toDateKey(now);
  const candidate = Object.values(surpriseQuestsById)
    .filter((quest) => quest.dateKey === todayDateKey && (quest.status === "accepted" || quest.status === "proposed"))
    .sort((left, right) => Number(right.status === "accepted") - Number(left.status === "accepted"))[0];

  if (!candidate) {
    return { hasQuest: false };
  }

  return {
    hasQuest: true,
    quest: candidate
  };
};

export const getActiveSession = (sessionsById: Record<string, RoutineSession>, activeSessionId: string | undefined) =>
  activeSessionId ? sessionsById[activeSessionId] : undefined;

export const getSessionDraftSummary = (
  sessionsById: Record<string, RoutineSession>,
  routinesById: Record<string, Routine>,
  stepsByRoutineId: Record<string, RoutineStep[]>,
  activeSessionId: string | undefined
): SessionDraftSummary | null => {
  const session = getActiveSession(sessionsById, activeSessionId);
  if (!session) return null;

  const routine = routinesById[session.routineId];
  if (!routine) return null;

  return {
    sessionId: session.id,
    routineId: routine.id,
    routineName: routine.name,
    stepCount: stepsByRoutineId[routine.id]?.length ?? 0,
    status: session.status,
    triggerSource: session.triggerSource,
    startedAt: session.startedAt
  };
};

export const getCurrentStep = (
  sessionId: string | undefined,
  sessionsById: Record<string, RoutineSession>,
  sessionRuntimeBySessionId: Record<string, SessionRuntime>,
  stepsByRoutineId: Record<string, RoutineStep[]>
) => {
  if (!sessionId) return undefined;

  const session = sessionsById[sessionId];
  const runtime = sessionRuntimeBySessionId[sessionId];
  if (!session || !runtime) return undefined;

  const steps = getStepsForRoutine(stepsByRoutineId, session.routineId);
  return steps[runtime.currentStepIndex];
};

export const getNextStepPreview = (
  sessionId: string | undefined,
  sessionsById: Record<string, RoutineSession>,
  sessionRuntimeBySessionId: Record<string, SessionRuntime>,
  stepsByRoutineId: Record<string, RoutineStep[]>
) => {
  if (!sessionId) return undefined;

  const session = sessionsById[sessionId];
  const runtime = sessionRuntimeBySessionId[sessionId];
  if (!session || !runtime) return undefined;

  const steps = getStepsForRoutine(stepsByRoutineId, session.routineId);
  return steps[runtime.currentStepIndex + 1];
};

export const getActiveStepTiming = (
  sessionId: string | undefined,
  sessionsById: Record<string, RoutineSession>,
  sessionRuntimeBySessionId: Record<string, SessionRuntime>,
  stepsByRoutineId: Record<string, RoutineStep[]>,
  now = new Date()
): ActiveStepTiming | null => {
  const currentStep = getCurrentStep(sessionId, sessionsById, sessionRuntimeBySessionId, stepsByRoutineId);
  if (!currentStep || !sessionId) return null;

  const runtime = sessionRuntimeBySessionId[sessionId];
  if (!runtime) return null;

  const elapsedMs = getElapsedMsFromRuntime(runtime, now);
  const targetMs = currentStep.recommendedDurationSec * 1000;
  const remainingMs = Math.max(0, targetMs - elapsedMs);
  const overtimeMs = Math.max(0, elapsedMs - targetMs);

  return {
    elapsedMs,
    remainingMs,
    overtimeMs,
    isOvertime: overtimeMs > 0,
    targetMs
  };
};

export const getSessionProgress = (
  sessionId: string | undefined,
  sessionsById: Record<string, RoutineSession>,
  stepsByRoutineId: Record<string, RoutineStep[]>,
  stepResultsBySessionId: Record<string, SessionStepResult[]>
): SessionProgressSnapshot | null => {
  if (!sessionId) return null;

  const session = sessionsById[sessionId];
  if (!session) return null;

  const steps = getStepsForRoutine(stepsByRoutineId, session.routineId);
  const totalSteps = steps.length;
  const finishedSteps = stepResultsBySessionId[sessionId]?.length ?? 0;

  return {
    totalSteps,
    finishedSteps,
    completedSteps: session.completedStepCount,
    skippedSteps: session.skippedStepCount,
    progressRatio: totalSteps === 0 ? 0 : Math.min(1, finishedSteps / totalSteps)
  };
};
