import { describe, expect, it } from "vitest";
import {
  canCarryOver,
  createCarryOverQuestCopy,
  createRecurringQuestCopy,
  isRecurringDueOnDate,
  mergeGeneratedQuests
} from "./recurrence";
import { QuestItem } from "./types";

const baseQuest: QuestItem = {
  id: "q1",
  title: "운동",
  type: "daily",
  completed: false,
  createdAt: "2026-03-24T00:00:00.000Z",
  isRecurring: true,
  recurrencePattern: "daily",
  recurrenceKey: "rk-1",
  recurrenceAnchorDate: "2026-03-24",
  carryOverEnabled: true,
  carryOverLimit: 3,
  carryOverCount: 0
};

describe("recurrence utils", () => {
  it("checks recurrence due correctly", () => {
    expect(isRecurringDueOnDate(baseQuest, "2026-03-25")).toBe(true);
    expect(isRecurringDueOnDate(baseQuest, "2026-03-24")).toBe(false);

    const weekly: QuestItem = { ...baseQuest, recurrencePattern: "weekly" };
    expect(isRecurringDueOnDate(weekly, "2026-03-31")).toBe(true);
  });

  it("creates recurring and carry-over copies", () => {
    const recurring = createRecurringQuestCopy(baseQuest, "2026-03-25");
    expect(recurring.completed).toBe(false);
    expect(recurring.recurrenceKey).toBe("rk-1");

    const carry = createCarryOverQuestCopy(baseQuest);
    expect(carry?.carryOverCount).toBe(1);
    expect(canCarryOver({ ...baseQuest, carryOverCount: 3 })).toBe(false);
  });

  it("deduplicates generated quests", () => {
    const existing: QuestItem[] = [
      {
        ...baseQuest,
        id: "existing",
        completed: false,
        carryOverSourceQuestId: "q1"
      }
    ];

    const generated = [
      {
        ...createRecurringQuestCopy(baseQuest, "2026-03-25"),
        recurrenceKey: "rk-1"
      },
      {
        ...baseQuest,
        id: "carry-dup",
        carryOverSourceQuestId: "q1"
      }
    ];

    const merged = mergeGeneratedQuests(existing, generated);
    expect(merged).toHaveLength(1);
  });
});
