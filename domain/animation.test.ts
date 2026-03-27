import { describe, expect, it } from "vitest";
import { buildQuestRewardQueue, findNewlyCompletedQuest, getRoofPreviewType } from "./animation";
import { ensureDailyRecord } from "./date";
import { addQuestToRecord, recalcRecord, toggleQuestInRecord } from "./record-ops";

describe("animation rewards", () => {
  it("prefers focus-independent reward events in the intended order", () => {
    let record = ensureDailyRecord("2026-03-25");

    const mainQuest = addQuestToRecord(record, { title: "메인", type: "main" }, "2026-03-25T00:00:00.000Z");
    expect(mainQuest.ok).toBe(true);
    if (!mainQuest.ok) return;
    record = mainQuest.record;

    const subQuest = addQuestToRecord(record, { title: "서브", type: "sub" }, "2026-03-25T00:05:00.000Z");
    expect(subQuest.ok).toBe(true);
    if (!subQuest.ok) return;
    record = subQuest.record;

    const firstToggle = toggleQuestInRecord(record, record.quests[0].id, "2026-03-25T00:10:00.000Z");
    expect(firstToggle.ok).toBe(true);
    if (!firstToggle.ok) return;
    const previous = firstToggle.record;

    const secondToggle = toggleQuestInRecord(previous, previous.quests[1].id, "2026-03-25T00:12:00.000Z");
    expect(secondToggle.ok).toBe(true);
    if (!secondToggle.ok) return;
    const next = secondToggle.record;

    const queue = buildQuestRewardQueue({
      previous,
      next,
      previousStreak: 0,
      nextStreak: 1,
      dailyGoal: 2,
      newlyCompletedQuest: findNewlyCompletedQuest(previous.quests, next.quests)
    });

    expect(queue.map((event) => event.type)).toEqual([
      "goal-reached",
      "roof-preview",
      "combo-up",
      "quest-complete",
      "streak-up"
    ]);
  });

  it("adds main-quest-clear when the newly completed quest is main", () => {
    let record = ensureDailyRecord("2026-03-25");

    const added = addQuestToRecord(record, { title: "메인", type: "main" }, "2026-03-25T00:00:00.000Z");
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const previous = added.record;
    const toggled = toggleQuestInRecord(previous, previous.quests[0].id, "2026-03-25T00:05:00.000Z");
    expect(toggled.ok).toBe(true);
    if (!toggled.ok) return;

    const queue = buildQuestRewardQueue({
      previous,
      next: toggled.record,
      previousStreak: 0,
      nextStreak: 0,
      dailyGoal: 5,
      newlyCompletedQuest: findNewlyCompletedQuest(previous.quests, toggled.record.quests)
    });

    expect(queue.map((event) => event.type)).toEqual(["main-quest-clear", "roof-preview", "quest-complete"]);
  });

  it("detects roof preview upgrades only on upward thresholds", () => {
    const emptyPreview = getRoofPreviewType(ensureDailyRecord("2026-03-25"));
    expect(emptyPreview).toBe("none");

    const lowPreview = getRoofPreviewType(
      recalcRecord(
        {
          ...ensureDailyRecord("2026-03-25"),
          quests: [
            {
              id: "a",
              title: "첫 번째",
              type: "main",
              completed: true,
              createdAt: "2026-03-25T00:00:00.000Z",
              completedAt: "2026-03-25T00:05:00.000Z"
            },
            {
              id: "b",
              title: "두 번째",
              type: "sub",
              completed: false,
              createdAt: "2026-03-25T00:10:00.000Z"
            },
            {
              id: "c",
              title: "세 번째",
              type: "sub",
              completed: false,
              createdAt: "2026-03-25T00:15:00.000Z"
            }
          ]
        },
        false
      )
    );

    expect(lowPreview).toBe("low");
  });
});
