import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getExecutionQueue } from "../domain/execution";
import { getCompletedQuestTypes } from "../domain/quest";

type QuestownStoreModule = typeof import("./questown-store");

const createLocalStorageMock = () => {
  const storage = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    })
  };
};

describe("questown store safeguards", () => {
  let useQuestownStore: QuestownStoreModule["useQuestownStore"];
  const createBackupData = (currentDateKey: string, recordsByDate: Record<string, unknown>) => ({
    version: 4,
    exportedAt: "2026-03-25T00:00:00.000Z",
    state: {
      currentDateKey,
      selectedMonth: currentDateKey.slice(0, 7),
      dailyGoal: 3,
      weeklyMainTarget: 10,
      recordsByDate
    }
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createLocalStorageMock());

    ({ useQuestownStore } = await import("./questown-store"));
    useQuestownStore.setState(useQuestownStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects deleting a missing quest id", () => {
    const result = useQuestownStore.getState().deleteQuest("missing-quest-id");

    expect(result).toEqual({ ok: false, reason: "퀘스트를 찾을 수 없어요." });
  });

  it("blocks deleting a quest that other quests still depend on", () => {
    const addMain = useQuestownStore.getState().addQuest({ title: "선행 작업", type: "main" });
    expect(addMain.ok).toBe(true);

    const dateKey = useQuestownStore.getState().currentDateKey;
    const mainQuestId = useQuestownStore
      .getState()
      .recordsByDate[dateKey].quests.find((quest) => quest.title === "선행 작업")?.id;
    expect(mainQuestId).toBeTruthy();

    const addSub = useQuestownStore
      .getState()
      .addQuest({ title: "후행 작업", type: "sub", dependencyQuestIds: [mainQuestId as string] });
    expect(addSub.ok).toBe(true);

    const result = useQuestownStore.getState().deleteQuest(mainQuestId as string);

    expect(result).toEqual({ ok: false, reason: "후행 Quest를 먼저 정리하세요: 후행 작업" });
    expect(useQuestownStore.getState().recordsByDate[dateKey]?.quests).toHaveLength(2);
  });

  it("rejects dependency patches that would create a cycle", () => {
    const addMain = useQuestownStore.getState().addQuest({ title: "메인 작업", type: "main" });
    expect(addMain.ok).toBe(true);

    const dateKey = useQuestownStore.getState().currentDateKey;
    const mainQuestId = useQuestownStore
      .getState()
      .recordsByDate[dateKey].quests.find((quest) => quest.title === "메인 작업")?.id;
    expect(mainQuestId).toBeTruthy();

    const addSub = useQuestownStore
      .getState()
      .addQuest({ title: "후행 작업", type: "sub", dependencyQuestIds: [mainQuestId as string] });
    expect(addSub.ok).toBe(true);

    const subQuestId = useQuestownStore
      .getState()
      .recordsByDate[dateKey].quests.find((quest) => quest.title === "후행 작업")?.id;
    expect(subQuestId).toBeTruthy();

    const result = useQuestownStore
      .getState()
      .updateQuestMeta(mainQuestId as string, { dependencyQuestIds: [subQuestId as string] });

    expect(result).toEqual({ ok: false, reason: "순환 선행 관계는 만들 수 없어요: 후행 작업" });

    const quests = useQuestownStore.getState().recordsByDate[dateKey].quests;
    expect(quests.find((quest) => quest.id === mainQuestId)?.dependencyQuestIds).toBeUndefined();
    expect(quests.find((quest) => quest.id === subQuestId)?.dependencyQuestIds).toEqual([mainQuestId]);
  });

  it("rejects add-time dependencies that do not point to an existing quest", () => {
    const result = useQuestownStore
      .getState()
      .addQuest({ title: "후행 작업", type: "sub", dependencyQuestIds: ["missing-quest-id"] });

    expect(result).toEqual({ ok: false, reason: "선행 퀘스트를 찾을 수 없어요." });

    const dateKey = useQuestownStore.getState().currentDateKey;
    expect(useQuestownStore.getState().recordsByDate[dateKey]?.quests ?? []).toHaveLength(0);
  });

  it("rejects duplicate titles that only differ by case or extra spaces", () => {
    const first = useQuestownStore.getState().addQuest({ title: "Read   Book", type: "main" });
    expect(first.ok).toBe(true);

    const second = useQuestownStore.getState().addQuest({ title: "  read book  ", type: "main" });
    expect(second).toEqual({ ok: false, reason: "같은 타입에 동일한 퀘스트가 이미 있어요." });
  });

  it("normalizes an invalid persisted currentTab during migration", async () => {
    const migrate = useQuestownStore.persist.getOptions().migrate;
    expect(migrate).toBeTypeOf("function");

    const migrated = (await migrate?.(
      {
        currentTab: "broken-tab",
        currentDateKey: "2026-03-25",
        selectedMonth: "2026-03",
        dailyGoal: 3,
        weeklyMainTarget: 10,
        recordsByDate: {}
      },
      5
    )) as { currentTab?: string } | undefined;

    expect(migrated?.currentTab).toBe("today");
  });

  it("reassigns duplicate imported quest ids so single-quest actions stay scoped", () => {
    const { currentDateKey } = useQuestownStore.getState();

    const result = useQuestownStore.getState().importBackup(
      createBackupData(currentDateKey, {
        [currentDateKey]: {
          quests: [
            {
              id: "duplicate-id",
              title: "첫 번째 퀘스트",
              type: "main",
              completed: false,
              createdAt: "2026-03-25T00:00:00.000Z"
            },
            {
              id: "duplicate-id",
              title: "두 번째 퀘스트",
              type: "sub",
              completed: false,
              createdAt: "2026-03-25T00:05:00.000Z"
            }
          ]
        }
      }) as never
    );

    expect(result.ok).toBe(true);

    const quests = useQuestownStore.getState().recordsByDate[currentDateKey]?.quests ?? [];
    expect(new Set(quests.map((quest) => quest.id)).size).toBe(2);

    const firstQuestId = quests.find((quest) => quest.title === "첫 번째 퀘스트")?.id;
    expect(firstQuestId).toBeTruthy();

    const toggleResult = useQuestownStore.getState().toggleQuest(firstQuestId as string);
    expect(toggleResult.ok).toBe(true);

    const nextQuests = useQuestownStore.getState().recordsByDate[currentDateKey]?.quests ?? [];
    expect(nextQuests.find((quest) => quest.title === "첫 번째 퀘스트")?.completed).toBe(true);
    expect(nextQuests.find((quest) => quest.title === "두 번째 퀘스트")?.completed).toBe(false);
  });

  it("builds a backup preview before applying imported records", () => {
    const { currentDateKey } = useQuestownStore.getState();
    useQuestownStore.getState().addQuest({ title: "원본 유지", type: "main" });

    const previewResult = useQuestownStore.getState().previewBackupImport(
      createBackupData(currentDateKey, {
        [currentDateKey]: {
          quests: [
            {
              id: "preview-main",
              title: "미리보기 메인",
              type: "main",
              completed: true,
              createdAt: "2026-03-25T00:00:00.000Z"
            }
          ]
        },
        [currentDateKey.slice(0, 8) + "26"]: {
          quests: [
            {
              id: "preview-sub",
              title: "미리보기 서브",
              type: "sub",
              completed: false,
              createdAt: "2026-03-26T00:00:00.000Z"
            }
          ]
        }
      }) as never
    );

    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) return;

    expect(previewResult.preview.dateCount).toBeGreaterThanOrEqual(2);
    expect(previewResult.preview.overwriteDateCount).toBe(1);
    expect(previewResult.preview.newDateCount).toBeGreaterThanOrEqual(1);

    const applyResult = useQuestownStore.getState().applyBackupImport(previewResult.preview);
    expect(applyResult.ok).toBe(true);
    expect(
      useQuestownStore.getState().recordsByDate[currentDateKey]?.quests.some((quest) => quest.title === "미리보기 메인")
    ).toBe(true);
  });

  it("falls back to legacy text when an imported title is empty", () => {
    const { currentDateKey } = useQuestownStore.getState();

    const result = useQuestownStore.getState().importBackup(
      createBackupData(currentDateKey, {
        [currentDateKey]: {
          quests: [
            {
              id: "legacy-title",
              title: "",
              text: "레거시 제목 복구",
              type: "main",
              completed: false,
              createdAt: "2026-03-25T00:00:00.000Z"
            }
          ]
        }
      }) as never
    );

    expect(result.ok).toBe(true);

    const quests = useQuestownStore.getState().recordsByDate[currentDateKey]?.quests ?? [];
    expect(quests).toHaveLength(1);
    expect(quests[0]?.title).toBe("레거시 제목 복구");
  });

  it("skips malformed imported quest entries instead of throwing during normalization", () => {
    const { currentDateKey } = useQuestownStore.getState();

    const result = useQuestownStore.getState().importBackup(
      createBackupData(currentDateKey, {
        [currentDateKey]: {
          quests: [
            null as never,
            123 as never,
            {
              id: "broken-title",
              title: 456 as never,
              type: "daily",
              completed: false,
              createdAt: "2026-03-25T00:00:00.000Z"
            },
            {
              id: "valid-text",
              text: "정상 복원",
              type: "sub",
              completed: false,
              createdAt: "2026-03-25T00:05:00.000Z"
            }
          ]
        }
      }) as never
    );

    expect(result.ok).toBe(true);

    const quests = useQuestownStore.getState().recordsByDate[currentDateKey]?.quests ?? [];
    expect(quests).toHaveLength(1);
    expect(quests[0]).toMatchObject({ title: "정상 복원", type: "sub" });
  });

  it("normalizes string booleans from imported backups without flipping false values to true", () => {
    const { currentDateKey } = useQuestownStore.getState();

    const result = useQuestownStore.getState().importBackup(
      createBackupData(currentDateKey, {
        [currentDateKey]: {
          isFinalized: "false" as never,
          quests: [
            {
              id: "string-bools",
              title: "문자열 불리언",
              type: "main",
              completed: "false" as never,
              createdAt: "2026-03-25T00:00:00.000Z",
              focusPinned: "false" as never,
              isRecurring: "false" as never,
              carryOverEnabled: "false" as never
            }
          ]
        }
      }) as never
    );

    expect(result.ok).toBe(true);

    const record = useQuestownStore.getState().recordsByDate[currentDateKey];
    const quest = record?.quests[0];

    expect(record?.isFinalized).toBe(false);
    expect(quest?.completed).toBe(false);
    expect(quest?.completedAt).toBeUndefined();
    expect(quest?.focusPinned).toBe(false);
    expect(quest?.isRecurring).toBe(false);
    expect(quest?.recurrencePattern).toBe("none");
    expect(quest?.carryOverEnabled).toBe(false);
    expect(quest?.carryOverLimit).toBeUndefined();
  });

  it("sanitizes malformed imported timestamps before queue and completion sorting", () => {
    const { currentDateKey } = useQuestownStore.getState();

    const result = useQuestownStore.getState().importBackup(
      createBackupData(currentDateKey, {
        [currentDateKey]: {
          quests: [
            {
              id: "incomplete-1",
              title: "진행 1",
              type: "main",
              completed: false,
              createdAt: 123 as never
            },
            {
              id: "incomplete-2",
              title: "진행 2",
              type: "daily",
              completed: false,
              createdAt: { broken: true } as never
            },
            {
              id: "complete-1",
              title: "완료 1",
              type: "sub",
              completed: true,
              createdAt: "2026-03-24T00:00:00.000Z",
              completedAt: 456 as never
            },
            {
              id: "complete-2",
              title: "완료 2",
              type: "sub",
              completed: true,
              createdAt: [] as never,
              completedAt: { broken: true } as never
            }
          ]
        }
      }) as never
    );

    expect(result.ok).toBe(true);

    const quests = useQuestownStore.getState().recordsByDate[currentDateKey]?.quests ?? [];
    expect(quests.every((quest) => typeof quest.createdAt === "string")).toBe(true);
    expect(
      quests.filter((quest) => quest.completed).every((quest) => typeof quest.completedAt === "string")
    ).toBe(true);
    expect(() => getExecutionQueue(quests)).not.toThrow();
    expect(() => getCompletedQuestTypes(quests)).not.toThrow();
  });

  it("rejects backup imports when recordsByDate is not a plain object", () => {
    const { currentDateKey } = useQuestownStore.getState();
    useQuestownStore.getState().addQuest({ title: "원본 유지", type: "main" });

    const result = useQuestownStore.getState().importBackup({
      version: 4,
      exportedAt: "2026-03-25T00:00:00.000Z",
      state: {
        currentDateKey,
        selectedMonth: currentDateKey.slice(0, 7),
        dailyGoal: 3,
        weeklyMainTarget: 10,
        recordsByDate: [] as never
      }
    });

    expect(result).toEqual({ ok: false, reason: "백업 데이터 형식이 올바르지 않아요." });
    expect(useQuestownStore.getState().recordsByDate[currentDateKey]?.quests.map((quest) => quest.title)).toContain("원본 유지");
  });

  it("rejects backup imports when every date key is malformed", () => {
    const { currentDateKey } = useQuestownStore.getState();
    useQuestownStore.getState().addQuest({ title: "원본 유지", type: "main" });

    const result = useQuestownStore.getState().importBackup(
      createBackupData(currentDateKey, {
        broken: {
          quests: [
            {
              id: "broken-record",
              title: "깨진 기록",
              type: "main",
              completed: false,
              createdAt: "2026-03-25T00:00:00.000Z"
            }
          ]
        }
      }) as never
    );

    expect(result).toEqual({ ok: false, reason: "백업 데이터의 날짜 기록 형식이 올바르지 않아요." });
    expect(useQuestownStore.getState().recordsByDate[currentDateKey]?.quests.map((quest) => quest.title)).toContain("원본 유지");
  });

  it("rejects backup imports when the top-level schema metadata is malformed", () => {
    const { currentDateKey } = useQuestownStore.getState();
    useQuestownStore.getState().addQuest({ title: "원본 유지", type: "main" });

    const result = useQuestownStore.getState().importBackup({
      version: "4" as never,
      exportedAt: "broken-date",
      state: {
        currentDateKey,
        selectedMonth: currentDateKey.slice(0, 7),
        dailyGoal: 3,
        weeklyMainTarget: 10,
        recordsByDate: {}
      }
    });

    expect(result).toEqual({ ok: false, reason: "백업 버전 정보가 올바르지 않아요." });
    expect(useQuestownStore.getState().recordsByDate[currentDateKey]?.quests.map((quest) => quest.title)).toContain("원본 유지");
  });

  it("rejects backup imports when the backup version is newer than supported", () => {
    const { currentDateKey } = useQuestownStore.getState();

    const result = useQuestownStore.getState().importBackup({
      version: 99,
      exportedAt: "2026-03-25T00:00:00.000Z",
      state: {
        currentDateKey,
        selectedMonth: currentDateKey.slice(0, 7),
        dailyGoal: 3,
        weeklyMainTarget: 10,
        recordsByDate: {}
      }
    });

    expect(result).toEqual({ ok: false, reason: "지원하지 않는 백업 버전이에요." });
  });

  it("rejects backup imports when state schema fields have invalid types", () => {
    const { currentDateKey } = useQuestownStore.getState();
    useQuestownStore.getState().addQuest({ title: "원본 유지", type: "main" });

    const result = useQuestownStore.getState().importBackup({
      version: 4,
      exportedAt: "2026-03-25T00:00:00.000Z",
      state: {
        currentDateKey,
        selectedMonth: currentDateKey.slice(0, 7),
        dailyGoal: "3" as never,
        weeklyMainTarget: 10,
        recordsByDate: {}
      }
    });

    expect(result).toEqual({ ok: false, reason: "백업 목표 설정 형식이 올바르지 않아요." });
    expect(useQuestownStore.getState().recordsByDate[currentDateKey]?.quests.map((quest) => quest.title)).toContain("원본 유지");
  });

  it("normalizes malformed recurrence anchors during backup import so day rollover does not throw", () => {
    const { currentDateKey } = useQuestownStore.getState();

    const result = useQuestownStore.getState().importBackup(
      createBackupData(currentDateKey, {
        [currentDateKey]: {
          quests: [
            {
              id: "recurring-quest",
              title: "매일 운동",
              type: "daily",
              completed: false,
              createdAt: "2026-03-25T00:00:00.000Z",
              isRecurring: true,
              recurrencePattern: "daily",
              recurrenceAnchorDate: "broken-anchor" as never
            }
          ]
        }
      }) as never
    );

    expect(result.ok).toBe(true);
    expect(() => useQuestownStore.getState().goNextDayForDev()).not.toThrow();

    const nextDateKey = useQuestownStore.getState().currentDateKey;
    const nextQuests = useQuestownStore.getState().recordsByDate[nextDateKey]?.quests ?? [];
    expect(nextQuests.some((quest) => quest.title === "매일 운동")).toBe(true);
  });

  it("reassigns duplicate imported recurrence keys so recurring quests do not collapse on rollover", () => {
    const { currentDateKey } = useQuestownStore.getState();

    const result = useQuestownStore.getState().importBackup(
      createBackupData(currentDateKey, {
        [currentDateKey]: {
          quests: [
            {
              id: "recurring-1",
              title: "아침 산책",
              type: "daily",
              completed: false,
              createdAt: "2026-03-25T00:00:00.000Z",
              isRecurring: true,
              recurrencePattern: "daily",
              recurrenceKey: "shared-rk"
            },
            {
              id: "recurring-2",
              title: "물 마시기",
              type: "daily",
              completed: false,
              createdAt: "2026-03-25T00:05:00.000Z",
              isRecurring: true,
              recurrencePattern: "daily",
              recurrenceKey: "shared-rk"
            }
          ]
        }
      }) as never
    );

    expect(result.ok).toBe(true);

    const importedQuests = useQuestownStore.getState().recordsByDate[currentDateKey]?.quests ?? [];
    expect(new Set(importedQuests.map((quest) => quest.recurrenceKey)).size).toBe(2);

    useQuestownStore.getState().goNextDayForDev();

    const nextDateKey = useQuestownStore.getState().currentDateKey;
    const nextQuests = useQuestownStore.getState().recordsByDate[nextDateKey]?.quests ?? [];
    expect(nextQuests.map((quest) => quest.title)).toEqual(expect.arrayContaining(["아침 산책", "물 마시기"]));
  });

  it("keeps exactly one focusPinned quest when setFocusQuest is called repeatedly", () => {
    const addMain = useQuestownStore.getState().addQuest({ title: "대표 후보 1", type: "main" });
    const addSub = useQuestownStore.getState().addQuest({ title: "대표 후보 2", type: "sub" });
    expect(addMain.ok).toBe(true);
    expect(addSub.ok).toBe(true);

    const dateKey = useQuestownStore.getState().currentDateKey;
    const quests = useQuestownStore.getState().recordsByDate[dateKey]?.quests ?? [];
    const firstQuestId = quests.find((quest) => quest.title === "대표 후보 1")?.id;
    const secondQuestId = quests.find((quest) => quest.title === "대표 후보 2")?.id;
    expect(firstQuestId).toBeTruthy();
    expect(secondQuestId).toBeTruthy();

    expect(useQuestownStore.getState().setFocusQuest(firstQuestId as string)).toEqual({ ok: true });
    expect(useQuestownStore.getState().setFocusQuest(secondQuestId as string)).toEqual({ ok: true });

    const nextQuests = useQuestownStore.getState().recordsByDate[dateKey]?.quests ?? [];
    expect(nextQuests.filter((quest) => quest.focusPinned)).toHaveLength(1);
    expect(nextQuests.find((quest) => quest.id === secondQuestId)?.focusPinned).toBe(true);
    expect(nextQuests.find((quest) => quest.id === firstQuestId)?.focusPinned).toBe(false);
  });

  it("clears focusPinned quests and blocks focus changes on finalized days", () => {
    const addMain = useQuestownStore.getState().addQuest({ title: "대표 후보", type: "main" });
    expect(addMain.ok).toBe(true);

    const dateKey = useQuestownStore.getState().currentDateKey;
    const questId = useQuestownStore.getState().recordsByDate[dateKey]?.quests[0]?.id;
    expect(questId).toBeTruthy();

    expect(useQuestownStore.getState().setFocusQuest(questId as string)).toEqual({ ok: true });
    expect(useQuestownStore.getState().clearFocusQuest()).toEqual({ ok: true });

    const clearedQuests = useQuestownStore.getState().recordsByDate[dateKey]?.quests ?? [];
    expect(clearedQuests.some((quest) => quest.focusPinned)).toBe(false);

    useQuestownStore.getState().finalizeCurrentDay();

    expect(useQuestownStore.getState().setFocusQuest(questId as string)).toEqual({
      ok: false,
      reason: "마감된 날짜는 수정할 수 없어요."
    });
    expect(useQuestownStore.getState().clearFocusQuest()).toEqual({
      ok: false,
      reason: "마감된 날짜는 대표 퀘스트를 바꿀 수 없어요."
    });
  });

  it("surfaces a recovery notice when persisted JSON is malformed", async () => {
    vi.resetModules();

    const brokenStorage = {
      getItem: vi.fn(() => "{broken-json"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    };

    vi.stubGlobal("localStorage", brokenStorage);
    ({ useQuestownStore } = await import("./questown-store"));

    await useQuestownStore.persist.rehydrate();

    expect(useQuestownStore.getState().recoveryNotice).toBe("저장된 앱 데이터를 읽는 중 문제가 있어 안전한 상태로 복구했어요.");
    expect(brokenStorage.removeItem).toHaveBeenCalledWith("questown-mvp-storage");
  });

  it("marks storage health as degraded when reading persisted state throws", async () => {
    vi.resetModules();

    const brokenStorage = {
      getItem: vi.fn(() => {
        throw new Error("read failed");
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    };

    vi.stubGlobal("localStorage", brokenStorage);
    ({ useQuestownStore } = await import("./questown-store"));

    await useQuestownStore.persist.rehydrate();

    expect(useQuestownStore.getState().storageHealth).toMatchObject({
      readable: false,
      degraded: true,
      lastError: "read failed"
    });
    expect(useQuestownStore.getState().storageNotice).toBe(
      "브라우저 저장소 접근에 문제가 있어 일부 변경이 저장되지 않을 수 있어요."
    );
  });

  it("keeps in-memory state alive when writing to storage fails", async () => {
    vi.resetModules();

    const brokenStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error("write failed");
      }),
      removeItem: vi.fn(),
      clear: vi.fn()
    };

    vi.stubGlobal("localStorage", brokenStorage);
    ({ useQuestownStore } = await import("./questown-store"));
    useQuestownStore.setState(useQuestownStore.getInitialState(), true);

    const result = useQuestownStore.getState().addQuest({ title: "메모리 유지", type: "main" });

    expect(result.ok).toBe(true);
    expect(useQuestownStore.getState().storageHealth).toMatchObject({
      writable: false,
      degraded: true,
      lastError: "write failed"
    });
    expect(useQuestownStore.getState().recordsByDate[useQuestownStore.getState().currentDateKey]?.quests).toHaveLength(1);
  });

  it("normalizes malformed persisted state and preserves app startup", async () => {
    vi.resetModules();

    const persistedState = JSON.stringify({
      state: {
        currentTab: "broken-tab",
        currentDateKey: "broken-date",
        selectedMonth: "2099-13",
        dailyGoal: "bad",
        weeklyMainTarget: "bad",
        recordsByDate: {
          broken: {
            quests: [
              {
                id: "broken",
                title: "복구 대상",
                type: "main",
                completed: true,
                createdAt: "2026-03-25T00:00:00.000Z"
              }
            ]
          }
        }
      },
      version: 6
    });

    const brokenStorage = createLocalStorageMock();
    brokenStorage.getItem.mockReturnValue(persistedState);

    vi.stubGlobal("localStorage", brokenStorage);
    ({ useQuestownStore } = await import("./questown-store"));

    await useQuestownStore.persist.rehydrate();

    const state = useQuestownStore.getState();
    expect(state.currentTab).toBe("today");
    expect(state.currentDateKey).toBeTruthy();
    expect(state.selectedMonth).toBe(state.currentDateKey.slice(0, 7));
    expect(state.recoveryNotice).toBe("저장된 기록 일부를 자동 복구했어요.");
  });
});
