import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureDailyRecord } from "./date";
import { addQuestToRecord, finalizeRecord, toggleQuestInRecord } from "./record-ops";
import { prepareNextDayRecord, rollForwardRecords, syncStateToToday } from "./rollover";

describe("rollover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolls forward several missing days and lands on today", () => {
    let startRecord = ensureDailyRecord("2026-03-18");
    const added = addQuestToRecord(startRecord, {
      title: "매일 운동",
      type: "daily",
      recurrencePattern: "daily"
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    startRecord = finalizeRecord(added.record);

    const synced = syncStateToToday({ "2026-03-18": startRecord }, "2026-03-18");

    expect(synced.currentDateKey).toBe("2026-03-25");
    expect(Object.keys(synced.recordsByDate)).toEqual(
      expect.arrayContaining(["2026-03-18", "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22", "2026-03-23", "2026-03-24", "2026-03-25"])
    );
    expect(synced.recordsByDate["2026-03-24"]?.isFinalized).toBe(true);
    expect(synced.recordsByDate["2026-03-25"]?.isFinalized).toBe(false);
  });

  it("creates only one next-day copy when recurrence and carry-over both apply", () => {
    let record = ensureDailyRecord("2026-03-25");
    const added = addQuestToRecord(record, {
      title: "계속되는 퀘스트",
      type: "main",
      recurrencePattern: "daily",
      carryOverEnabled: true,
      carryOverLimit: 3
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const nextRecord = prepareNextDayRecord(finalizeRecord(added.record), ensureDailyRecord("2026-03-26"), "2026-03-26");

    expect(nextRecord.quests.filter((quest) => quest.title === "계속되는 퀘스트")).toHaveLength(1);
  });

  it("generates recurring quests for the next day after a finalized day", () => {
    let record = ensureDailyRecord("2026-03-25");
    const added = addQuestToRecord(record, {
      title: "루틴 유지",
      type: "daily",
      recurrencePattern: "daily"
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const nextRecord = prepareNextDayRecord(finalizeRecord(added.record), ensureDailyRecord("2026-03-26"), "2026-03-26");

    expect(nextRecord.quests.some((quest) => quest.title === "루틴 유지")).toBe(true);
    expect(nextRecord.isFinalized).toBe(false);
  });

  it("keeps current and future candidate dates pinned to today while preserving consistency", () => {
    const todayRecord = ensureDailyRecord("2026-03-25");
    const current = syncStateToToday({ "2026-03-25": todayRecord }, "2026-03-25");
    const future = syncStateToToday({ "2026-03-25": todayRecord }, "2026-03-27");

    expect(current.currentDateKey).toBe("2026-03-25");
    expect(future.currentDateKey).toBe("2026-03-25");
    expect(future.recordsByDate["2026-03-25"]?.isFinalized).toBe(false);
  });

  it("reopens a finalized record when it becomes the current day again", () => {
    let todayRecord = ensureDailyRecord("2026-03-25");
    const added = addQuestToRecord(todayRecord, { title: "오늘 리뷰 대상", type: "main" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    todayRecord = added.record;

    const toggled = toggleQuestInRecord(todayRecord, todayRecord.quests[0].id);
    expect(toggled.ok).toBe(true);
    if (!toggled.ok) return;

    const synced = syncStateToToday({ "2026-03-25": finalizeRecord(toggled.record) }, "2026-03-25");

    expect(synced.recordsByDate["2026-03-25"]?.isFinalized).toBe(false);
    expect(synced.recordsByDate["2026-03-25"]?.roofType).toBe("none");
    expect(synced.recordsByDate["2026-03-25"]?.completedCount).toBe(1);
  });

  it("preserves completion data when rolling forward a finalized day", () => {
    let record = ensureDailyRecord("2026-03-24");
    const added = addQuestToRecord(record, { title: "메인 작업", type: "main" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    record = added.record;

    const toggled = toggleQuestInRecord(record, record.quests[0].id);
    expect(toggled.ok).toBe(true);
    if (!toggled.ok) return;

    const rolled = rollForwardRecords({ "2026-03-24": finalizeRecord(toggled.record) }, "2026-03-24", "2026-03-25");
    expect(rolled["2026-03-24"]?.completedCount).toBe(1);
    expect(rolled["2026-03-24"]?.isFinalized).toBe(true);
    expect(rolled["2026-03-25"]?.isFinalized).toBe(false);
  });
});
