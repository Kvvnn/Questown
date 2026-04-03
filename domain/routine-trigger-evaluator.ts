import { addLocalDays, getDefaultLocalTimeContext, getLocalMinuteOfDay, LocalTimeContext } from "./local-time";
import { dateKeyMinuteOfDayToDateInLocalTime, getWeekdayForDateKeyInLocalTime, toGameDateKey } from "./game-day";
import {
  RoutineLaunchAvailability,
  LaunchReasonKey,
  Routine,
  RoutineLaunchContext,
  RoutineNotificationCandidate,
  RoutineRecommendationItem,
  RoutineSession,
  RoutineTrigger,
  TriggerEvaluationResult
} from "./game-types";
import { isClearOrBetterGrade } from "./session-scoring";

export interface TimeTriggerWindow {
  trigger: RoutineTrigger;
  startAt: string;
  endAt: string;
  notificationWindowKey: string;
}

const ACTIVE_REASON_COPY: Record<LaunchReasonKey, string> = {
  time_window_active: "현재 시간 창이 열려 있어서 바로 시작하기 좋습니다.",
  time_window_upcoming: "곧 열릴 시간대 루틴입니다. 미리 step을 확인해 둘 수 있습니다.",
  manual_fallback: "수동으로 언제든 시작할 수 있는 루틴입니다."
};

const compareRoutineNames = (left: Routine, right: Routine) => left.name.localeCompare(right.name, "en");

const compareScheduledAt = (left: string, right: string) => left.localeCompare(right, "en");

const findTriggerById = (triggers: RoutineTrigger[], triggerId: string | undefined) =>
  triggerId ? triggers.find((trigger) => trigger.id === triggerId) : undefined;

const buildTimeWindowKey = (triggerId: string, startAt: string) => `${triggerId}:${startAt}`;

const getTimeTriggerWindowForDate = ({
  dateKey,
  trigger,
  timeContext
}: {
  dateKey: string;
  trigger: RoutineTrigger;
  timeContext: LocalTimeContext;
}): TimeTriggerWindow | null => {
  if (trigger.triggerType !== "time" || trigger.triggerConfig.type !== "time" || !trigger.isEnabled) return null;

  const weekday = getWeekdayForDateKeyInLocalTime(dateKey, timeContext);
  if (!trigger.triggerConfig.weekdayMask.includes(weekday)) return null;

  const startDate = dateKeyMinuteOfDayToDateInLocalTime(dateKey, trigger.triggerConfig.startMinuteOfDay, timeContext);
  const crossesMidnight = trigger.triggerConfig.startMinuteOfDay > trigger.triggerConfig.endMinuteOfDay;
  const endDate = crossesMidnight
    ? dateKeyMinuteOfDayToDateInLocalTime(addLocalDays(dateKey, 1), trigger.triggerConfig.endMinuteOfDay, timeContext)
    : dateKeyMinuteOfDayToDateInLocalTime(dateKey, trigger.triggerConfig.endMinuteOfDay, timeContext);

  return {
    trigger,
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
    notificationWindowKey: buildTimeWindowKey(trigger.id, startDate.toISOString())
  };
};

export const getActiveTimeTriggerWindow = ({
  trigger,
  now = new Date(),
  timeContext = getDefaultLocalTimeContext()
}: {
  trigger: RoutineTrigger;
  now?: Date;
  timeContext?: LocalTimeContext;
}) => {
  const currentDateKey = toGameDateKey(now, timeContext);
  const candidateDateKeys = [currentDateKey, addLocalDays(currentDateKey, -1)];

  for (const dateKey of candidateDateKeys) {
    const window = getTimeTriggerWindowForDate({ dateKey, trigger, timeContext });
    if (!window) continue;

    if (window.startAt <= now.toISOString() && now.toISOString() <= window.endAt) {
      return window;
    }
  }

  return null;
};

export const getNextTimeTriggerWindow = ({
  trigger,
  now = new Date(),
  timeContext = getDefaultLocalTimeContext(),
  horizonDays = 7
}: {
  trigger: RoutineTrigger;
  now?: Date;
  timeContext?: LocalTimeContext;
  horizonDays?: number;
}) => {
  const todayDateKey = toGameDateKey(now, timeContext);

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const dateKey = addLocalDays(todayDateKey, offset);
    const window = getTimeTriggerWindowForDate({ dateKey, trigger, timeContext });
    if (!window) continue;
    if (window.startAt <= now.toISOString()) continue;
    return window;
  }

  return null;
};

export const getLaunchReasonCopy = (reasonKey: LaunchReasonKey) => ACTIVE_REASON_COPY[reasonKey];

export const getTriggerEvaluatorResult = ({
  routinesById,
  triggersByRoutineId,
  sessionsById,
  activeSessionId,
  now = new Date(),
  timeContext = getDefaultLocalTimeContext(),
  upcomingLimit = 3
}: {
  routinesById: Record<string, Routine>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  sessionsById: Record<string, RoutineSession>;
  activeSessionId?: string;
  now?: Date;
  timeContext?: LocalTimeContext;
  upcomingLimit?: number;
}): TriggerEvaluationResult => {
  const todayGameDateKey = toGameDateKey(now, timeContext);
  const sessionsForToday = Object.values(sessionsById).filter((session) => session.dateKey === todayGameDateKey);
  const startedRoutineIds = new Set(sessionsForToday.map((session) => session.routineId));
  const successfulRoutineIds = new Set(
    sessionsForToday.filter((session) => isClearOrBetterGrade(session.resultGrade)).map((session) => session.routineId)
  );

  const activeTimeRecommendations: Array<RoutineRecommendationItem & { hasStartedToday: boolean }> = [];
  const manualRecommendations: Array<RoutineRecommendationItem & { hasStartedToday: boolean; hasSuccessfulToday: boolean }> = [];
  const upcomingRecommendations: RoutineRecommendationItem[] = [];

  Object.values(routinesById)
    .filter((routine) => routine.isEnabled)
    .forEach((routine) => {
      const triggers = triggersByRoutineId[routine.id] ?? [];
      const hasStartedToday = startedRoutineIds.has(routine.id);
      const hasSuccessfulToday = successfulRoutineIds.has(routine.id);
      const manualTrigger = triggers.find((trigger) => trigger.triggerType === "manual" && trigger.isEnabled);

      if (manualTrigger) {
        manualRecommendations.push({
          routine,
          trigger: manualTrigger,
          launchContext: {
            routineId: routine.id,
            triggerSource: "manual",
            triggerId: manualTrigger.id,
            entrySource: "launcher_hero",
            reasonKey: "manual_fallback"
          },
          reasonCopy: getLaunchReasonCopy("manual_fallback"),
          hasStartedToday,
          hasSuccessfulToday
        });
      }

      if (hasSuccessfulToday) return;

      triggers
        .filter((trigger) => trigger.triggerType === "time" && trigger.isEnabled)
        .forEach((trigger) => {
          const activeWindow = getActiveTimeTriggerWindow({ trigger, now, timeContext });
          if (activeWindow) {
            activeTimeRecommendations.push({
              routine,
              trigger,
              launchContext: {
                routineId: routine.id,
                triggerSource: "time",
                triggerId: trigger.id,
                entrySource: "launcher_hero",
                reasonKey: "time_window_active"
              },
              reasonCopy: getLaunchReasonCopy("time_window_active"),
              triggerWindowStartAt: activeWindow.startAt,
              triggerWindowEndAt: activeWindow.endAt,
              notificationWindowKey: activeWindow.notificationWindowKey,
              hasStartedToday
            });
            return;
          }

          const nextWindow = getNextTimeTriggerWindow({ trigger, now, timeContext });
          if (!nextWindow) return;

          upcomingRecommendations.push({
            routine,
            trigger,
            launchContext: {
              routineId: routine.id,
              triggerSource: "time",
              triggerId: trigger.id,
              entrySource: "launcher_queue",
              reasonKey: "time_window_upcoming"
            },
            reasonCopy: getLaunchReasonCopy("time_window_upcoming"),
            scheduledAt: nextWindow.startAt,
            triggerWindowStartAt: nextWindow.startAt,
            triggerWindowEndAt: nextWindow.endAt,
            notificationWindowKey: nextWindow.notificationWindowKey
          });
        });
    });

  activeTimeRecommendations.sort(
    (left, right) =>
      Number(left.hasStartedToday) - Number(right.hasStartedToday) ||
      (right.trigger?.priority ?? 0) - (left.trigger?.priority ?? 0) ||
      compareRoutineNames(left.routine, right.routine)
  );

  manualRecommendations.sort(
    (left, right) =>
      Number(left.hasSuccessfulToday) - Number(right.hasSuccessfulToday) ||
      Number(left.hasStartedToday) - Number(right.hasStartedToday) ||
      compareRoutineNames(left.routine, right.routine)
  );

  upcomingRecommendations.sort(
    (left, right) =>
      compareScheduledAt(left.scheduledAt ?? "", right.scheduledAt ?? "") || compareRoutineNames(left.routine, right.routine)
  );

  const primaryRecommendation = activeTimeRecommendations[0] ?? manualRecommendations[0] ?? null;
  const notificationCandidate =
    primaryRecommendation &&
    primaryRecommendation.launchContext.triggerSource === "time" &&
    primaryRecommendation.trigger &&
    !activeSessionId &&
    !startedRoutineIds.has(primaryRecommendation.routine.id)
      ? ({
          title: `${primaryRecommendation.routine.name}을 열 수 있어요`,
          body: "지금 시간 창이 열렸습니다. 준비 화면에서 바로 시작할 수 있어요.",
          launchContext: {
            ...primaryRecommendation.launchContext,
            entrySource: "notification"
          },
          notificationWindowKey: primaryRecommendation.notificationWindowKey ?? buildTimeWindowKey(primaryRecommendation.trigger.id, primaryRecommendation.triggerWindowStartAt ?? ""),
          triggerWindowStartAt: primaryRecommendation.triggerWindowStartAt ?? now.toISOString(),
          triggerWindowEndAt: primaryRecommendation.triggerWindowEndAt ?? now.toISOString()
        } satisfies RoutineNotificationCandidate)
      : null;

  return {
    primaryRecommendation,
    upcomingRecommendations: upcomingRecommendations.slice(0, upcomingLimit),
    notificationCandidate
  };
};

export const getPendingNotificationCandidate = ({
  evaluation,
  lastNotifiedTriggerWindowKey
}: {
  evaluation: TriggerEvaluationResult;
  lastNotifiedTriggerWindowKey?: string;
}) => {
  const candidate = evaluation.notificationCandidate;
  if (!candidate) return null;
  return candidate.notificationWindowKey === lastNotifiedTriggerWindowKey ? null : candidate;
};

export const canStartTimeTriggerFromContext = ({
  launchContext,
  triggers,
  now = new Date(),
  timeContext = getDefaultLocalTimeContext()
}: {
  launchContext: RoutineLaunchContext;
  triggers: RoutineTrigger[];
  now?: Date;
  timeContext?: LocalTimeContext;
}) => {
  if (launchContext.triggerSource !== "time") return true;

  const trigger = findTriggerById(triggers, launchContext.triggerId);
  if (!trigger) return false;

  return !!getActiveTimeTriggerWindow({ trigger, now, timeContext });
};

export const getRoutineLaunchAvailability = ({
  launchContext,
  triggers,
  now = new Date(),
  timeContext = getDefaultLocalTimeContext()
}: {
  launchContext: RoutineLaunchContext;
  triggers: RoutineTrigger[];
  now?: Date;
  timeContext?: LocalTimeContext;
}): RoutineLaunchAvailability => {
  if (launchContext.triggerSource !== "time") {
    return {
      canStartNow: true,
      windowState: "manual"
    };
  }

  const trigger = findTriggerById(triggers, launchContext.triggerId);
  if (!trigger) {
    return {
      canStartNow: false,
      windowState: "invalid",
      blockedReason: "이 시간 트리거 정보를 찾을 수 없어요."
    };
  }

  const activeWindow = getActiveTimeTriggerWindow({ trigger, now, timeContext });
  if (activeWindow) {
    return {
      canStartNow: true,
      windowState: "active"
    };
  }

  if (launchContext.reasonKey === "time_window_upcoming") {
    return {
      canStartNow: false,
      windowState: "upcoming",
      blockedReason: "지금은 step preview만 가능해요. 시간 창이 열리면 시작할 수 있습니다."
    };
  }

  return {
    canStartNow: false,
    windowState: "closed",
    blockedReason: "이 시간 창은 지금 열려 있지 않아요."
  };
};

export const getCurrentTimeWindowLabel = (now = new Date(), timeContext: LocalTimeContext = getDefaultLocalTimeContext()) => {
  const minuteOfDay = getLocalMinuteOfDay(now, timeContext);
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const minutes = String(minuteOfDay % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
};
