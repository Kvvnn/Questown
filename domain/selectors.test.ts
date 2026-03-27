import { describe, expect, it } from "vitest";
import { ensureDailyRecord } from "./date";
import { addQuestToRecord, updateQuestMetaInRecord } from "./record-ops";
import { getHeroQuestCandidate } from "./selectors";

describe("hero selector", () => {
  it("prefers an unfinished pinned quest over the automatic queue", () => {
    let record = ensureDailyRecord("2026-03-25");

    const first = addQuestToRecord(record, { title: "메인 작업", type: "main" }, "2026-03-25T00:00:00.000Z");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    record = first.record;

    const second = addQuestToRecord(record, { title: "서브 작업", type: "sub" }, "2026-03-25T00:05:00.000Z");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    record = second.record;

    const pinned = updateQuestMetaInRecord(record, record.quests[1].id, { focusPinned: true });
    expect(pinned.ok).toBe(true);
    if (!pinned.ok) return;
    record = pinned.record;

    const candidate = getHeroQuestCandidate(record);
    expect(candidate?.source).toBe("focus");
    expect(candidate?.quest.title).toBe("서브 작업");
    expect(candidate?.isFocused).toBe(true);
  });

  it("falls back to the automatic queue when only a completed pinned quest remains", () => {
    const record = {
      ...ensureDailyRecord("2026-03-25"),
      quests: [
        {
          id: "focused-done",
          title: "대표 완료",
          type: "main" as const,
          completed: true,
          createdAt: "2026-03-25T00:00:00.000Z",
          completedAt: "2026-03-25T00:05:00.000Z",
          focusPinned: true
        },
        {
          id: "next-up",
          title: "다음 작업",
          type: "daily" as const,
          completed: false,
          createdAt: "2026-03-25T00:10:00.000Z"
        }
      ],
      completedCount: 1,
      totalCount: 2,
      completionRate: 0.5,
      roofType: "none" as const,
      isFinalized: false,
      completedByType: { daily: 0, main: 1, sub: 0 },
      totalByType: { daily: 1, main: 1, sub: 0 }
    };

    const candidate = getHeroQuestCandidate(record);
    expect(candidate?.source).toBe("queue");
    expect(candidate?.quest.title).toBe("다음 작업");
    expect(candidate?.isFocused).toBe(false);
  });

  it("returns a blocked reason when the focused hero quest is locked by a dependency", () => {
    let record = ensureDailyRecord("2026-03-25");

    const leader = addQuestToRecord(record, { title: "선행 퀘스트", type: "main" }, "2026-03-25T00:00:00.000Z");
    expect(leader.ok).toBe(true);
    if (!leader.ok) return;
    record = leader.record;

    const follower = addQuestToRecord(
      record,
      { title: "대표 퀘스트", type: "sub", dependencyQuestIds: [record.quests[0].id] },
      "2026-03-25T00:05:00.000Z"
    );
    expect(follower.ok).toBe(true);
    if (!follower.ok) return;
    record = follower.record;

    const pinned = updateQuestMetaInRecord(record, record.quests[1].id, { focusPinned: true });
    expect(pinned.ok).toBe(true);
    if (!pinned.ok) return;

    const candidate = getHeroQuestCandidate(pinned.record);
    expect(candidate?.source).toBe("focus");
    expect(candidate?.blockedByIds).toEqual([pinned.record.quests[0].id]);
    expect(candidate?.blockedReason).toContain("선행 퀘스트");
  });
});
