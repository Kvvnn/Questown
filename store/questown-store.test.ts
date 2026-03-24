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

  it("drops only the newly patched dependency when it would create a cycle", () => {
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

    expect(result.ok).toBe(true);

    const quests = useQuestownStore.getState().recordsByDate[dateKey].quests;
    expect(quests.find((quest) => quest.id === mainQuestId)?.dependencyQuestIds).toBeUndefined();
    expect(quests.find((quest) => quest.id === subQuestId)?.dependencyQuestIds).toEqual([mainQuestId]);
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
});
