import { RoutineLaunchContext, TriggerType } from "./game-types";

const ENTRY_SOURCE_VALUES = new Set(["notification"]);
const TRIGGER_SOURCE_VALUES = new Set<TriggerType>(["manual", "time", "location", "ai_recommended"]);
const REASON_KEY_VALUES = new Set(["time_window_active", "time_window_upcoming", "manual_fallback"]);

export interface AppEntryPayload {
  source: "notification";
  launchContext: RoutineLaunchContext;
}

export const serializeAppEntryPayload = (payload: AppEntryPayload) => {
  const params = new URLSearchParams();
  params.set("entry", payload.source);
  params.set("routineId", payload.launchContext.routineId);
  params.set("triggerSource", payload.launchContext.triggerSource);
  params.set("entrySource", payload.launchContext.entrySource);
  params.set("reasonKey", payload.launchContext.reasonKey);
  if (payload.launchContext.triggerId) {
    params.set("triggerId", payload.launchContext.triggerId);
  }
  return `/?${params.toString()}`;
};

export const parseAppEntryPayload = (searchParams: URLSearchParams) => {
  const source = searchParams.get("entry");
  if (source !== "notification") return null;

  const routineId = searchParams.get("routineId");
  const triggerSource = searchParams.get("triggerSource");
  const triggerId = searchParams.get("triggerId") ?? undefined;
  const entrySource = searchParams.get("entrySource");
  const reasonKey = searchParams.get("reasonKey");

  if (!routineId || !triggerSource || !entrySource || !reasonKey) {
    return null;
  }

  if (
    !ENTRY_SOURCE_VALUES.has(entrySource) ||
    !TRIGGER_SOURCE_VALUES.has(triggerSource as TriggerType) ||
    !REASON_KEY_VALUES.has(reasonKey)
  ) {
    return null;
  }

  return {
    source,
    launchContext: {
      routineId,
      triggerSource: triggerSource as TriggerType,
      triggerId,
      entrySource: entrySource as RoutineLaunchContext["entrySource"],
      reasonKey: reasonKey as RoutineLaunchContext["reasonKey"]
    }
  } satisfies AppEntryPayload;
};
