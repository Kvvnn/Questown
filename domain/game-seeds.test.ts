import { describe, expect, it } from "vitest";
import { createDefaultRoutineSeed, MORNING_ROUTINE_ID, NIGHT_ROUTINE_ID } from "./game-seeds";

describe("game seed defaults", () => {
  it("creates exactly two default routines with five steps and two triggers each", () => {
    const seed = createDefaultRoutineSeed();

    expect(Object.keys(seed.routinesById)).toEqual([MORNING_ROUTINE_ID, NIGHT_ROUTINE_ID]);
    expect(seed.stepsByRoutineId[MORNING_ROUTINE_ID]).toHaveLength(5);
    expect(seed.stepsByRoutineId[NIGHT_ROUTINE_ID]).toHaveLength(5);
    expect(seed.triggersByRoutineId[MORNING_ROUTINE_ID]).toHaveLength(2);
    expect(seed.triggersByRoutineId[NIGHT_ROUTINE_ID]).toHaveLength(2);
  });

  it("includes the expected routine ids and time trigger windows", () => {
    const seed = createDefaultRoutineSeed();
    const morningTimeTrigger = seed.triggersByRoutineId[MORNING_ROUTINE_ID].find((trigger) => trigger.triggerType === "time");
    const nightTimeTrigger = seed.triggersByRoutineId[NIGHT_ROUTINE_ID].find((trigger) => trigger.triggerType === "time");

    expect(seed.routinesById[MORNING_ROUTINE_ID]?.name).toBe("Morning Reset");
    expect(seed.routinesById[NIGHT_ROUTINE_ID]?.name).toBe("Night Shutdown");
    expect(morningTimeTrigger?.triggerConfig.type).toBe("time");
    expect(nightTimeTrigger?.triggerConfig.type).toBe("time");

    if (morningTimeTrigger?.triggerConfig.type === "time") {
      expect(morningTimeTrigger.triggerConfig.startMinuteOfDay).toBe(300);
      expect(morningTimeTrigger.triggerConfig.endMinuteOfDay).toBe(600);
    }

    if (nightTimeTrigger?.triggerConfig.type === "time") {
      expect(nightTimeTrigger.triggerConfig.startMinuteOfDay).toBe(1200);
      expect(nightTimeTrigger.triggerConfig.endMinuteOfDay).toBe(1439);
    }
  });
});
