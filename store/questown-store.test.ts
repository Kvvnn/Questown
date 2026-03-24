import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
});
