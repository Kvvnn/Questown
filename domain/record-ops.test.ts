import { describe, expect, it } from "vitest";
import { ensureDailyRecord } from "./date";
import {
  addQuestToRecord,
  assertRecordConsistency,
  deleteQuestFromRecord,
  finalizeRecord,
  toggleQuestInRecord,
  unfinalizeRecord,
  updateQuestMetaInRecord
} from "./record-ops";

describe("record ops", () => {
  it("keeps derived fields consistent across add, toggle, finalize, and unfinalize", () => {
    let record = ensureDailyRecord("2026-03-25");

    const added = addQuestToRecord(record, { title: "메인 작업", type: "main" }, "2026-03-25T00:00:00.000Z");
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    record = added.record;
    expect(() => assertRecordConsistency(record)).not.toThrow();
    expect(record.totalCount).toBe(1);

    const toggled = toggleQuestInRecord(record, record.quests[0].id, "2026-03-25T00:05:00.000Z");
    expect(toggled.ok).toBe(true);
    if (!toggled.ok) return;

    record = toggled.record;
    expect(record.completedCount).toBe(1);
    expect(() => assertRecordConsistency(record)).not.toThrow();

    record = finalizeRecord(record);
    expect(record.isFinalized).toBe(true);
    expect(record.roofType).toBe("high");
    expect(() => assertRecordConsistency(record)).not.toThrow();

    record = unfinalizeRecord(record);
    expect(record.isFinalized).toBe(false);
    expect(record.roofType).toBe("none");
    expect(() => assertRecordConsistency(record)).not.toThrow();
  });

  it("enforces a single focused quest when focusPinned is updated", () => {
    let record = ensureDailyRecord("2026-03-25");

    const first = addQuestToRecord(record, { title: "첫 번째", type: "main" }, "2026-03-25T00:00:00.000Z");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    record = first.record;

    const second = addQuestToRecord(record, { title: "두 번째", type: "sub" }, "2026-03-25T00:05:00.000Z");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    record = second.record;

    const pinFirst = updateQuestMetaInRecord(record, record.quests[0].id, { focusPinned: true });
    expect(pinFirst.ok).toBe(true);
    if (!pinFirst.ok) return;
    record = pinFirst.record;
    expect(record.quests.filter((quest) => quest.focusPinned)).toHaveLength(1);
    expect(record.quests[0]?.focusPinned).toBe(true);

    const pinSecond = updateQuestMetaInRecord(record, record.quests[1].id, { focusPinned: true });
    expect(pinSecond.ok).toBe(true);
    if (!pinSecond.ok) return;
    record = pinSecond.record;

    expect(record.quests.filter((quest) => quest.focusPinned)).toHaveLength(1);
    expect(record.quests[0]?.focusPinned).toBe(false);
    expect(record.quests[1]?.focusPinned).toBe(true);
    expect(() => assertRecordConsistency(record)).not.toThrow();
  });

  it("blocks dependency cycles during updates", () => {
    let record = ensureDailyRecord("2026-03-25");

    const first = addQuestToRecord(record, { title: "메인", type: "main" }, "2026-03-25T00:00:00.000Z");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    record = first.record;

    const second = addQuestToRecord(
      record,
      { title: "서브", type: "sub", dependencyQuestIds: [record.quests[0].id] },
      "2026-03-25T00:05:00.000Z"
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    record = second.record;

    const result = updateQuestMetaInRecord(record, record.quests[0].id, {
      dependencyQuestIds: [record.quests[1].id]
    });

    expect(result).toEqual({ ok: false, reason: "순환 선행 관계는 만들 수 없어요: 서브" });
  });

  it("blocks undo when a completed dependent still exists and keeps delete consistent", () => {
    let record = ensureDailyRecord("2026-03-25");

    const first = addQuestToRecord(record, { title: "선행", type: "main" }, "2026-03-25T00:00:00.000Z");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    record = first.record;

    const second = addQuestToRecord(
      record,
      { title: "후행", type: "sub", dependencyQuestIds: [record.quests[0].id] },
      "2026-03-25T00:05:00.000Z"
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    record = second.record;

    const toggleLeader = toggleQuestInRecord(record, record.quests[0].id, "2026-03-25T00:10:00.000Z");
    expect(toggleLeader.ok).toBe(true);
    if (!toggleLeader.ok) return;
    record = toggleLeader.record;

    const toggleFollower = toggleQuestInRecord(record, record.quests[1].id, "2026-03-25T00:12:00.000Z");
    expect(toggleFollower.ok).toBe(true);
    if (!toggleFollower.ok) return;
    record = toggleFollower.record;

    const undoLeader = toggleQuestInRecord(record, record.quests[0].id, "2026-03-25T00:14:00.000Z");
    expect(undoLeader).toEqual({ ok: false, reason: "후행 Quest를 먼저 되돌리세요: 후행" });

    const deleteFollower = deleteQuestFromRecord(record, record.quests[1].id);
    expect(deleteFollower.ok).toBe(true);
    if (!deleteFollower.ok) return;

    expect(deleteFollower.record.quests).toHaveLength(1);
    expect(() => assertRecordConsistency(deleteFollower.record)).not.toThrow();
  });
});
