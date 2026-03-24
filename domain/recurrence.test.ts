import { describe, expect, it } from "vitest";
import {
  createNextDayQuestCopies,
  canCarryOver,
  createCarryOverQuestCopy,
  createRecurringQuestCopy,
  isRecurringDueOnDate,
  mergeGeneratedQuests,
  normalizeRecurrencePattern
} from "./recurrence";
import { QuestItem } from "./types";

const withTimeZone = (timeZone: string, run: () => void) => {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;

  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
      return;
    }

    process.env.TZ = previous;
  }
};

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
  it("falls back to supported recurrence patterns only", () => {
    expect(normalizeRecurrencePattern("daily", false)).toBe("daily");
    expect(normalizeRecurrencePattern("monthly" as never, true)).toBe("daily");
    expect(normalizeRecurrencePattern("monthly" as never, false)).toBe("none");
  });

  it("checks recurrence due correctly", () => {
    expect(isRecurringDueOnDate(baseQuest, "2026-03-25")).toBe(true);
    expect(isRecurringDueOnDate(baseQuest, "2026-03-24")).toBe(false);

    const weekly: QuestItem = { ...baseQuest, recurrencePattern: "weekly" };
    expect(isRecurringDueOnDate(weekly, "2026-03-31")).toBe(true);
  });

  it("keeps weekday recurrence aligned to Seoul calendar days", () => {
    const weekdays: QuestItem = {
      ...baseQuest,
      recurrencePattern: "weekdays",
      recurrenceAnchorDate: "2026-03-01"
    };

    withTimeZone("America/Los_Angeles", () => {
      expect(isRecurringDueOnDate(weekdays, "2026-03-02")).toBe(true);
      expect(isRecurringDueOnDate(weekdays, "2026-03-08")).toBe(false);
    });
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

  it("keeps recurring carry-over quests to a single next-day copy", () => {
    const generated = createNextDayQuestCopies(baseQuest, "2026-03-25");

    expect(generated).toHaveLength(1);
    expect(generated[0]?.carryOverCount).toBe(1);
    expect(generated[0]?.recurrencePattern).toBe("daily");
  });

  it("drops carry-over provenance when recurrence resumes after the carry-over limit", () => {
    const generated = createNextDayQuestCopies(
      {
        ...baseQuest,
        id: "q2",
        carryOverCount: 3,
        carryOverSourceQuestId: "q1"
      },
      "2026-03-25"
    );

    expect(generated).toHaveLength(1);
    expect(generated[0]?.carryOverCount).toBe(0);
    expect(generated[0]?.carryOverSourceQuestId).toBeUndefined();
  });
});
