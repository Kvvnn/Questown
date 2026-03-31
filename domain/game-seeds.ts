import { Routine, RoutineStep, RoutineTrigger } from "./game-types";

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const SEED_CREATED_AT = "2026-03-31T00:00:00.000Z";

export const MORNING_ROUTINE_ID = "routine-morning-reset";
export const NIGHT_ROUTINE_ID = "routine-night-shutdown";

const createManualTrigger = (id: string, routineId: string): RoutineTrigger => ({
  id,
  routineId,
  triggerType: "manual",
  triggerConfig: { type: "manual" },
  priority: 100,
  cooldownMinutes: 0,
  isEnabled: true
});

const createTimeTrigger = (
  id: string,
  routineId: string,
  startMinuteOfDay: number,
  endMinuteOfDay: number
): RoutineTrigger => ({
  id,
  routineId,
  triggerType: "time",
  triggerConfig: {
    type: "time",
    weekdayMask: ALL_WEEKDAYS,
    startMinuteOfDay,
    endMinuteOfDay
  },
  priority: 80,
  cooldownMinutes: 0,
  isEnabled: true
});

const createStep = (
  id: string,
  routineId: string,
  title: string,
  order: number,
  recommendedDurationSec: number,
  tags: string[]
): RoutineStep => ({
  id,
  routineId,
  title,
  order,
  recommendedDurationSec,
  minimumCompletion: "complete",
  difficulty: 2,
  tags,
  completionFxKey: "pulse",
  isOptional: false
});

export const createDefaultRoutineSeed = () => {
  const morningRoutine: Routine = {
    id: MORNING_ROUTINE_ID,
    name: "Morning Reset",
    category: "morning_reset",
    estimatedDurationSec: 60 + 720 + 120 + 300 + 180,
    themeKey: "sunrise-home",
    difficulty: 2,
    successProfile: "gentle",
    isEnabled: true,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT
  };

  const nightRoutine: Routine = {
    id: NIGHT_ROUTINE_ID,
    name: "Night Shutdown",
    category: "night_shutdown",
    estimatedDurationSec: 180 + 600 + 300 + 120 + 300,
    themeKey: "night-lamp",
    difficulty: 2,
    successProfile: "gentle",
    isEnabled: true,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT
  };

  const routinesById: Record<string, Routine> = {
    [morningRoutine.id]: morningRoutine,
    [nightRoutine.id]: nightRoutine
  };

  const stepsByRoutineId: Record<string, RoutineStep[]> = {
    [MORNING_ROUTINE_ID]: [
      createStep("step-morning-bed", MORNING_ROUTINE_ID, "침구 정리", 1, 60, ["reset", "bedroom"]),
      createStep("step-morning-wash", MORNING_ROUTINE_ID, "세수/샤워", 2, 720, ["wash", "body"]),
      createStep("step-morning-supplement", MORNING_ROUTINE_ID, "영양제 먹기", 3, 120, ["health", "supplement"]),
      createStep("step-morning-dress", MORNING_ROUTINE_ID, "옷 갈아입기", 4, 300, ["dress", "prepare"]),
      createStep("step-morning-bag", MORNING_ROUTINE_ID, "가방 챙기기", 5, 180, ["bag", "exit"])
    ],
    [NIGHT_ROUTINE_ID]: [
      createStep("step-night-desk", NIGHT_ROUTINE_ID, "책상 정리", 1, 180, ["desk", "tidy"]),
      createStep("step-night-wash", NIGHT_ROUTINE_ID, "세안/샤워", 2, 600, ["wash", "night"]),
      createStep("step-night-prepare", NIGHT_ROUTINE_ID, "내일 옷/가방 준비", 3, 300, ["prepare", "tomorrow"]),
      createStep("step-night-water", NIGHT_ROUTINE_ID, "물/영양제 정리", 4, 120, ["health", "water"]),
      createStep("step-night-sleep", NIGHT_ROUTINE_ID, "취침 준비", 5, 300, ["sleep", "shutdown"])
    ]
  };

  const triggersByRoutineId: Record<string, RoutineTrigger[]> = {
    [MORNING_ROUTINE_ID]: [
      createManualTrigger("trigger-morning-manual", MORNING_ROUTINE_ID),
      createTimeTrigger("trigger-morning-time", MORNING_ROUTINE_ID, 5 * 60, 10 * 60)
    ],
    [NIGHT_ROUTINE_ID]: [
      createManualTrigger("trigger-night-manual", NIGHT_ROUTINE_ID),
      createTimeTrigger("trigger-night-time", NIGHT_ROUTINE_ID, 20 * 60, 23 * 60 + 59)
    ]
  };

  return {
    routinesById,
    stepsByRoutineId,
    triggersByRoutineId
  };
};
