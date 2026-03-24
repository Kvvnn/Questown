"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getBuildingHeight, getCompletionRate, getRoofType } from "@/domain/building";
import { addDays, addMonths, ensureDailyRecord, isDateKey, isMonthKey, toDateKey, toMonthKey } from "@/domain/date";
import {
  getBlockedDependencyIds,
  getCompletedDependentIds,
  normalizeQuestPriority
} from "@/domain/execution";
import { getQuestCounts, getQuestTitleKey } from "@/domain/quest";
import {
  createNextDayQuestCopies,
  mergeGeneratedQuests,
  normalizeRecurrencePattern
} from "@/domain/recurrence";
import {
  AppBackupData,
  DailyRecord,
  QuestItem,
  QuestPriority,
  QuestType,
  RecurrencePattern,
  TabType
} from "@/domain/types";
import { normalizeImportedRecordState } from "@/store/record-normalization";
import { getMonthKeyFromDateKey, resolveSelectedTownDate, resolveTownMonth } from "./town-selection";

const MAX_QUEST_TITLE_LENGTH = 80;

interface LegacyQuestLike {
  id?: string;
  text?: string;
  title?: string;
  type?: string;
  completed?: boolean;
  createdAt?: string;
  completedAt?: string;
  priority?: string;
  dependencyQuestIds?: string[];
  focusPinned?: boolean;
  isRecurring?: boolean;
  recurrenceKey?: string;
  recurrencePattern?: string;
  recurrenceIntervalDays?: number;
  recurrenceAnchorDate?: string;
  carryOverEnabled?: boolean;
  carryOverLimit?: number;
  carryOverCount?: number;
  carryOverSourceQuestId?: string;
}

interface LegacyRecordLike {
  date?: string;
  quests?: LegacyQuestLike[];
  todos?: LegacyQuestLike[];
  isFinalized?: boolean;
}

interface AddQuestInput {
  title: string;
  type: QuestType;
  priority?: QuestPriority;
  dependencyQuestIds?: string[];
  recurrencePattern?: RecurrencePattern;
  recurrenceIntervalDays?: number;
  carryOverEnabled?: boolean;
  carryOverLimit?: number;
}

interface UpdateQuestMetaInput {
  priority?: QuestPriority;
  dependencyQuestIds?: string[];
  focusPinned?: boolean;
}

interface QuestownState {
  currentTab: TabType;
  currentDateKey: string;
  selectedMonth: string;
  dailyGoal: number;
  weeklyMainTarget: number;
  recordsByDate: Record<string, DailyRecord>;
  selectedDateInTown?: string;

  setTab: (tab: TabType) => void;
  setDailyGoal: (goal: number) => void;
  setWeeklyMainTarget: (target: number) => void;
  addQuest: (input: AddQuestInput) => { ok: boolean; reason?: string };
  updateQuestMeta: (questId: string, patch: UpdateQuestMetaInput) => { ok: boolean; reason?: string };
  toggleQuest: (questId: string) => { ok: boolean; reason?: string };
  deleteQuest: (questId: string) => { ok: boolean; reason?: string };
  finalizeCurrentDay: () => void;
  unfinalizeCurrentDay: () => void;
  goNextDayForDev: () => void;
  moveMonth: (delta: number) => void;
  selectDateInTown: (date: string) => void;
  hydrateToday: () => void;
  rolloverToToday: () => void;
  exportBackup: () => AppBackupData;
  importBackup: (data: AppBackupData) => { ok: boolean; reason?: string };
}

const isQuestType = (value: unknown): value is QuestType => value === "daily" || value === "main" || value === "sub";
const isTabType = (value: unknown): value is TabType => value === "today" || value === "town";

const normalizeQuestType = (value: unknown): QuestType => (isQuestType(value) ? value : "daily");
const normalizeTabType = (value: unknown): TabType => (isTabType(value) ? value : "today");

const normalizePositiveInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const normalizeDependencyIds = (ids: unknown, selfId?: string) => {
  if (!Array.isArray(ids)) return undefined;

  const cleaned = Array.from(
    new Set(
      ids
        .filter((value): value is string => typeof value === "string")
        .filter((value) => value !== selfId)
    )
  );

  return cleaned.length > 0 ? cleaned : undefined;
};

const sanitizeDependencyIds = (ids: unknown, availableQuestIds: Set<string>, selfId?: string) => {
  const cleaned = normalizeDependencyIds(ids, selfId)?.filter((value) => availableQuestIds.has(value));

  return cleaned && cleaned.length > 0 ? cleaned : undefined;
};

const hasDependencyPath = (startId: string, targetId: string, questMap: Map<string, QuestItem>) => {
  const visited = new Set<string>();
  const stack = [startId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId)) continue;
    if (currentId === targetId) return true;

    visited.add(currentId);

    const currentQuest = questMap.get(currentId);
    (currentQuest?.dependencyQuestIds ?? []).forEach((dependencyId) => {
      if (!visited.has(dependencyId)) stack.push(dependencyId);
    });
  }

  return false;
};

const sanitizePatchedDependencyIds = (ids: unknown, questId: string, questMap: Map<string, QuestItem>) => {
  const cleaned = normalizeDependencyIds(ids, questId)?.filter((value) => questMap.has(value));
  if (!cleaned || cleaned.length === 0) return undefined;

  const safeDependencies = cleaned.filter((dependencyId) => !hasDependencyPath(dependencyId, questId, questMap));
  return safeDependencies.length > 0 ? safeDependencies : undefined;
};

const recalc = (record: DailyRecord, finalized = record.isFinalized): DailyRecord => {
  const completedCount = record.quests.filter((quest) => quest.completed).length;
  const totalCount = record.quests.length;
  const completionRate = getCompletionRate(completedCount, totalCount);
  const counts = getQuestCounts(record.quests);

  return {
    ...record,
    completedCount,
    totalCount,
    completionRate,
    roofType: finalized ? getRoofType(completionRate) : "none",
    isFinalized: finalized,
    completedByType: counts.completedByType,
    totalByType: counts.totalByType
  };
};

const normalizeQuest = (raw: LegacyQuestLike, dateKey: string, availableQuestIds?: Set<string>): QuestItem | null => {
  const title = (raw.title ?? raw.text ?? "").trim();
  if (!title) return null;

  const type = normalizeQuestType(raw.type);
  const pattern = normalizeRecurrencePattern(raw.recurrencePattern as RecurrencePattern | undefined, raw.isRecurring);
  const isRecurring = pattern !== "none";
  const recurrenceIntervalDays =
    pattern === "interval" ? normalizePositiveInt(raw.recurrenceIntervalDays, 2, 1, 30) : undefined;

  const carryOverEnabled = Boolean(raw.carryOverEnabled);
  const carryOverLimit = carryOverEnabled ? normalizePositiveInt(raw.carryOverLimit, 3, 1, 30) : undefined;

  const id = raw.id ?? crypto.randomUUID();

  const quest: QuestItem = {
    id,
    title,
    type,
    completed: Boolean(raw.completed),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    completedAt: raw.completed ? raw.completedAt ?? new Date().toISOString() : undefined,
    priority: normalizeQuestPriority(raw.priority as QuestPriority | undefined, type),
    focusPinned: Boolean(raw.focusPinned),
    dependencyQuestIds: availableQuestIds
      ? sanitizeDependencyIds(raw.dependencyQuestIds, availableQuestIds, id)
      : normalizeDependencyIds(raw.dependencyQuestIds, id),
    isRecurring,
    recurrencePattern: pattern,
    recurrenceKey: isRecurring ? raw.recurrenceKey ?? raw.id ?? crypto.randomUUID() : undefined,
    recurrenceAnchorDate: isRecurring ? raw.recurrenceAnchorDate ?? dateKey : undefined,
    recurrenceIntervalDays,
    carryOverEnabled,
    carryOverLimit,
    carryOverCount: carryOverEnabled ? normalizePositiveInt(raw.carryOverCount, 0, 0, 365) : undefined,
    carryOverSourceQuestId: carryOverEnabled ? raw.carryOverSourceQuestId : undefined
  };

  return quest;
};

const normalizeRecord = (dateKey: string, raw?: LegacyRecordLike): DailyRecord => {
  const base = ensureDailyRecord(dateKey);
  if (!raw) return base;

  const source = Array.isArray(raw.quests) ? raw.quests : Array.isArray(raw.todos) ? raw.todos : [];

  const initial = source
    .map((quest) => normalizeQuest(quest, dateKey))
    .filter((quest): quest is QuestItem => Boolean(quest));

  const ids = new Set(initial.map((quest) => quest.id));
  const normalizedRecordState = normalizeImportedRecordState(
    dateKey,
    initial.map((quest) => ({
      ...quest,
      dependencyQuestIds: sanitizeDependencyIds(quest.dependencyQuestIds, ids, quest.id)
    }))
  );

  return recalc(
    {
      ...base,
      ...normalizedRecordState,
      isFinalized: Boolean(raw.isFinalized)
    },
    Boolean(raw.isFinalized)
  );
};

const normalizeRecordsByDate = (recordsByDate?: Record<string, LegacyRecordLike>) =>
  Object.entries(recordsByDate ?? {}).reduce<Record<string, DailyRecord>>((acc, [key, value]) => {
    if (!isDateKey(key)) return acc;
    acc[key] = normalizeRecord(key, value);
    return acc;
  }, {});

const getRecord = (recordsByDate: Record<string, DailyRecord>, dateKey: string) =>
  recordsByDate[dateKey] ?? ensureDailyRecord(dateKey);

const prepareNextDayRecord = (fromRecord: DailyRecord, targetRecord: DailyRecord, targetDateKey: string) => {
  const generated = fromRecord.quests.flatMap((quest) => createNextDayQuestCopies(quest, targetDateKey));

  const mergedQuests = mergeGeneratedQuests(targetRecord.quests, generated);

  return recalc(
    {
      ...targetRecord,
      date: targetDateKey,
      quests: mergedQuests,
      isFinalized: false,
      roofType: "none"
    },
    false
  );
};

const rollForwardRecords = (
  recordsByDate: Record<string, DailyRecord>,
  fromDateKey: string,
  toDateKey: string
): Record<string, DailyRecord> => {
  const records = { ...recordsByDate };

  if (fromDateKey >= toDateKey) {
    if (!records[toDateKey]) records[toDateKey] = ensureDailyRecord(toDateKey);
    return records;
  }

  let cursorKey = fromDateKey;
  let cursorRecord = recalc(getRecord(records, cursorKey), true);
  records[cursorKey] = cursorRecord;

  while (cursorKey < toDateKey) {
    const nextKey = addDays(cursorKey, 1);
    const nextBase = getRecord(records, nextKey);
    const nextPrepared = prepareNextDayRecord(cursorRecord, nextBase, nextKey);
    const shouldFinalize = nextKey !== toDateKey;
    const nextRecord = shouldFinalize ? recalc(nextPrepared, true) : nextPrepared;

    records[nextKey] = nextRecord;
    cursorKey = nextKey;
    cursorRecord = nextRecord;
  }

  return records;
};

const syncStateToToday = (recordsByDate: Record<string, DailyRecord>, candidateDateKey: string) => {
  const todayKey = toDateKey();

  if (candidateDateKey < todayKey) {
    return {
      currentDateKey: todayKey,
      recordsByDate: rollForwardRecords(recordsByDate, candidateDateKey, todayKey)
    };
  }

  const todayRecord = getRecord(recordsByDate, todayKey);

  return {
    currentDateKey: todayKey,
    recordsByDate: {
      ...recordsByDate,
      [todayKey]: recalc(todayRecord, todayRecord.isFinalized)
    }
  };
};

export const useQuestownStore = create<QuestownState>()(
  persist(
    (set, get) => ({
      currentTab: "today",
      currentDateKey: toDateKey(),
      selectedMonth: toMonthKey(),
      dailyGoal: 3,
      weeklyMainTarget: 10,
      recordsByDate: {},

      setTab: (tab) => set({ currentTab: tab }),

      setDailyGoal: (goal) => {
        const nextGoal = normalizePositiveInt(goal, 3, 1, 10);
        set({ dailyGoal: nextGoal });
      },

      setWeeklyMainTarget: (target) => {
        const nextTarget = normalizePositiveInt(target, 10, 1, 50);
        set({ weeklyMainTarget: nextTarget });
      },

      addQuest: ({
        title,
        type,
        priority,
        dependencyQuestIds,
        recurrencePattern = "none",
        recurrenceIntervalDays,
        carryOverEnabled = false,
        carryOverLimit
      }) => {
        const trimmed = title.trim();
        if (!trimmed) return { ok: false, reason: "퀘스트를 입력해 주세요." };
        if (!isQuestType(type)) return { ok: false, reason: "올바른 퀘스트 타입이 아니에요." };
        if (trimmed.length > MAX_QUEST_TITLE_LENGTH) {
          return { ok: false, reason: `퀘스트는 ${MAX_QUEST_TITLE_LENGTH}자 이하로 입력해 주세요.` };
        }

        const pattern = normalizeRecurrencePattern(recurrencePattern, false);
        const isRecurring = pattern !== "none";
        const intervalDays = pattern === "interval" ? normalizePositiveInt(recurrenceIntervalDays, 2, 1, 30) : undefined;
        const carryLimit = carryOverEnabled ? normalizePositiveInt(carryOverLimit, 3, 1, 30) : undefined;

        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        if (today.isFinalized) return { ok: false, reason: "이미 마감된 날짜는 수정할 수 없어요." };

        const nextTitleKey = getQuestTitleKey({ title: trimmed, type });
        if (today.quests.some((quest) => getQuestTitleKey(quest) === nextTitleKey)) {
          return { ok: false, reason: "같은 타입에 동일한 퀘스트가 이미 있어요." };
        }

        const availableIds = new Set(today.quests.map((quest) => quest.id));
        const dependencies = sanitizeDependencyIds(dependencyQuestIds, availableIds);

        const next = recalc(
          {
            ...today,
            quests: [
              ...today.quests,
              {
                id: crypto.randomUUID(),
                title: trimmed,
                type,
                completed: false,
                createdAt: new Date().toISOString(),
                priority: normalizeQuestPriority(priority, type),
                dependencyQuestIds: dependencies,
                focusPinned: false,
                isRecurring,
                recurrencePattern: pattern,
                recurrenceKey: isRecurring ? crypto.randomUUID() : undefined,
                recurrenceAnchorDate: isRecurring ? dateKey : undefined,
                recurrenceIntervalDays: intervalDays,
                carryOverEnabled,
                carryOverLimit: carryLimit,
                carryOverCount: carryOverEnabled ? 0 : undefined
              }
            ],
            isFinalized: false,
            roofType: "none"
          },
          false
        );

        set((state) => ({
          recordsByDate: {
            ...state.recordsByDate,
            [dateKey]: next
          }
        }));

        return { ok: true };
      },

      updateQuestMeta: (questId, patch) => {
        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        if (today.isFinalized) return { ok: false, reason: "마감된 날짜는 수정할 수 없어요." };

        const target = today.quests.find((quest) => quest.id === questId);
        if (!target) return { ok: false, reason: "퀘스트를 찾을 수 없어요." };

        const questMap = new Map(today.quests.map((quest) => [quest.id, quest] as const));
        const hasDependencyPatch = Object.prototype.hasOwnProperty.call(patch, "dependencyQuestIds");
        const dependencies = hasDependencyPatch
          ? sanitizePatchedDependencyIds(patch.dependencyQuestIds, questId, questMap)
          : undefined;

        const next = recalc(
          {
            ...today,
            quests: today.quests.map((quest) => {
              if (quest.id !== questId) return quest;

              return {
                ...quest,
                priority:
                  patch.priority !== undefined
                    ? normalizeQuestPriority(patch.priority, quest.type)
                    : normalizeQuestPriority(quest.priority, quest.type),
                focusPinned: patch.focusPinned ?? quest.focusPinned,
                dependencyQuestIds: hasDependencyPatch ? dependencies : quest.dependencyQuestIds
              };
            }),
            isFinalized: false,
            roofType: "none"
          },
          false
        );

        set((state) => ({
          recordsByDate: {
            ...state.recordsByDate,
            [dateKey]: next
          }
        }));

        return { ok: true };
      },

      toggleQuest: (questId) => {
        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        if (today.isFinalized) return { ok: false, reason: "마감된 날짜는 체크 변경이 불가해요." };

        const questMap = new Map(today.quests.map((quest) => [quest.id, quest] as const));
        const target = questMap.get(questId);
        if (!target) return { ok: false, reason: "퀘스트를 찾을 수 없어요." };

        if (!target.completed) {
          const blockedByIds = getBlockedDependencyIds(target, questMap);
          if (blockedByIds.length > 0) {
            const blocker = questMap.get(blockedByIds[0]);
            return { ok: false, reason: `선행 Quest를 먼저 완료하세요: ${blocker?.title ?? blockedByIds[0]}` };
          }
        }

        if (target.completed) {
          const completedDependentIds = getCompletedDependentIds(questId, questMap);
          if (completedDependentIds.length > 0) {
            const titles = completedDependentIds
              .map((id) => questMap.get(id)?.title)
              .filter((title): title is string => Boolean(title));
            const preview = titles.slice(0, 2).join(", ");
            const suffix = titles.length > 2 ? ` 외 ${titles.length - 2}개` : "";
            return { ok: false, reason: `후행 Quest를 먼저 되돌리세요: ${preview}${suffix}` };
          }
        }

        const next = recalc(
          {
            ...today,
            quests: today.quests.map((quest) =>
              quest.id === questId
                ? {
                    ...quest,
                    completed: !quest.completed,
                    completedAt: !quest.completed ? new Date().toISOString() : undefined
                  }
                : quest
            ),
            isFinalized: false,
            roofType: "none"
          },
          false
        );

        set((state) => ({
          recordsByDate: {
            ...state.recordsByDate,
            [dateKey]: next
          }
        }));

        return { ok: true };
      },

      deleteQuest: (questId) => {
        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        if (today.isFinalized) return { ok: false, reason: "마감된 날짜는 삭제할 수 없어요." };
        if (!today.quests.some((quest) => quest.id === questId)) {
          return { ok: false, reason: "퀘스트를 찾을 수 없어요." };
        }

        const nextQuests = today.quests
          .filter((quest) => quest.id !== questId)
          .map((quest) => {
            if (!quest.dependencyQuestIds?.includes(questId)) return quest;
            const deps = quest.dependencyQuestIds.filter((id) => id !== questId);
            return {
              ...quest,
              dependencyQuestIds: deps.length > 0 ? deps : undefined
            };
          });

        const next = recalc(
          {
            ...today,
            quests: nextQuests,
            isFinalized: false,
            roofType: "none"
          },
          false
        );

        set((state) => ({
          recordsByDate: {
            ...state.recordsByDate,
            [dateKey]: next
          }
        }));

        return { ok: true };
      },

      finalizeCurrentDay: () => {
        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        const next = recalc(today, true);
        set((state) => ({ recordsByDate: { ...state.recordsByDate, [dateKey]: next } }));
      },

      unfinalizeCurrentDay: () => {
        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        const next = recalc({ ...today, isFinalized: false, roofType: "none" }, false);
        set((state) => ({ recordsByDate: { ...state.recordsByDate, [dateKey]: next } }));
      },

      goNextDayForDev: () => {
        const todayKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, todayKey);
        const finalizedToday = recalc(today, true);
        const nextKey = addDays(todayKey, 1);
        const nextBase = getRecord(get().recordsByDate, nextKey);
        const nextPrepared = prepareNextDayRecord(finalizedToday, nextBase, nextKey);

        set((state) => ({
          currentDateKey: nextKey,
          selectedMonth: getMonthKeyFromDateKey(nextKey),
          recordsByDate: {
            ...state.recordsByDate,
            [todayKey]: finalizedToday,
            [nextKey]: nextPrepared
          },
          selectedDateInTown: resolveSelectedTownDate(
            getMonthKeyFromDateKey(nextKey),
            nextKey,
            state.selectedDateInTown,
            {
              ...state.recordsByDate,
              [todayKey]: finalizedToday,
              [nextKey]: nextPrepared
            }
          )
        }));
      },

      moveMonth: (delta) =>
        set((state) => {
          const nextMonth = resolveTownMonth(addMonths(state.selectedMonth, delta), state.currentDateKey);
          return {
            selectedMonth: nextMonth,
            selectedDateInTown: resolveSelectedTownDate(
              nextMonth,
              state.currentDateKey,
              state.selectedDateInTown,
              state.recordsByDate
            )
          };
        }),
      selectDateInTown: (date) => set({ selectedDateInTown: date }),

      hydrateToday: () => {
        const fallbackDateKey = toDateKey();
        const activeDateKey = isDateKey(get().currentDateKey) ? get().currentDateKey : fallbackDateKey;
        const synced = syncStateToToday(get().recordsByDate, activeDateKey);

        set((state) => {
          const selectedMonth = resolveTownMonth(state.selectedMonth, synced.currentDateKey);

          return {
            currentDateKey: synced.currentDateKey,
            selectedMonth,
            recordsByDate: synced.recordsByDate,
            selectedDateInTown: resolveSelectedTownDate(
              selectedMonth,
              synced.currentDateKey,
              state.selectedDateInTown,
              synced.recordsByDate
            )
          };
        });
      },

      rolloverToToday: () => {
        const currentKey = get().currentDateKey;
        const todayKey = toDateKey();

        if (currentKey === todayKey) return;

        const activeDateKey = isDateKey(currentKey) ? currentKey : todayKey;
        const synced = syncStateToToday(get().recordsByDate, activeDateKey);
        const selectedMonth = resolveTownMonth(get().selectedMonth, synced.currentDateKey);

        set({
          currentDateKey: synced.currentDateKey,
          selectedMonth,
          recordsByDate: synced.recordsByDate,
          selectedDateInTown: resolveSelectedTownDate(
            selectedMonth,
            synced.currentDateKey,
            get().selectedDateInTown,
            synced.recordsByDate
          )
        });
      },

      exportBackup: () => ({
        version: 4,
        exportedAt: new Date().toISOString(),
        state: {
          currentDateKey: get().currentDateKey,
          selectedMonth: get().selectedMonth,
          dailyGoal: get().dailyGoal,
          weeklyMainTarget: get().weeklyMainTarget,
          recordsByDate: get().recordsByDate
        }
      }),

      importBackup: (data) => {
        if (!data?.state?.recordsByDate || typeof data.state.recordsByDate !== "object") {
          return { ok: false, reason: "백업 데이터 형식이 올바르지 않아요." };
        }

        const nextDate = isDateKey(data.state.currentDateKey) ? data.state.currentDateKey : toDateKey();
        const normalizedRecords = normalizeRecordsByDate(data.state.recordsByDate as Record<string, LegacyRecordLike>);
        const synced = syncStateToToday(normalizedRecords, nextDate);
        const selectedMonth = resolveTownMonth(data.state.selectedMonth, synced.currentDateKey);

        set({
          currentDateKey: synced.currentDateKey,
          selectedMonth,
          dailyGoal: normalizePositiveInt((data.state as { dailyGoal?: number }).dailyGoal, 3, 1, 10),
          weeklyMainTarget: normalizePositiveInt((data.state as { weeklyMainTarget?: number }).weeklyMainTarget, 10, 1, 50),
          recordsByDate: synced.recordsByDate,
          selectedDateInTown: resolveSelectedTownDate(selectedMonth, synced.currentDateKey, undefined, synced.recordsByDate)
        });

        return { ok: true };
      }
    }),
    {
      name: "questown-mvp-storage",
      version: 6,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as Partial<QuestownState> & {
          recordsByDate?: Record<string, LegacyRecordLike>;
          weeklyMainTarget?: number;
        };

        const currentDateKey = isDateKey(state.currentDateKey) ? state.currentDateKey : toDateKey();
        const recordsByDate = normalizeRecordsByDate(state.recordsByDate);
        const selectedMonth = isMonthKey(state.selectedMonth) ? state.selectedMonth : getMonthKeyFromDateKey(currentDateKey);
        const selectedDateInTown = isDateKey(state.selectedDateInTown) ? state.selectedDateInTown : undefined;

        return {
          currentTab: normalizeTabType(state.currentTab),
          currentDateKey,
          selectedMonth,
          dailyGoal: normalizePositiveInt(state.dailyGoal, 3, 1, 10),
          weeklyMainTarget: normalizePositiveInt(state.weeklyMainTarget, 10, 1, 50),
          recordsByDate,
          selectedDateInTown: resolveSelectedTownDate(selectedMonth, currentDateKey, selectedDateInTown, recordsByDate)
        } as QuestownState;
      }
    }
  )
);

export const useTodayRecord = () =>
  useQuestownStore((state) => {
    const key = state.currentDateKey;
    return state.recordsByDate[key] ?? ensureDailyRecord(key);
  });

export const useTodayBuildingHeight = () =>
  useQuestownStore((state) => {
    const key = state.currentDateKey;
    const record = state.recordsByDate[key] ?? ensureDailyRecord(key);
    return getBuildingHeight(record.completedCount);
  });
