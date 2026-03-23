"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getBuildingHeight, getCompletionRate, getRoofType } from "@/domain/building";
import { addDays, addMonths, ensureDailyRecord, toDateKey, toMonthKey } from "@/domain/date";
import { getQuestCounts } from "@/domain/quest";
import { AppBackupData, DailyRecord, QuestItem, QuestType, TabType } from "@/domain/types";

const MAX_QUEST_TITLE_LENGTH = 80;

interface LegacyTodoLike {
  id?: string;
  text?: string;
  title?: string;
  type?: string;
  completed?: boolean;
  createdAt?: string;
  completedAt?: string;
  isRecurring?: boolean;
  recurrenceKey?: string;
}

interface LegacyRecordLike {
  date?: string;
  quests?: LegacyTodoLike[];
  todos?: LegacyTodoLike[];
  isFinalized?: boolean;
}

interface QuestownState {
  currentTab: TabType;
  currentDateKey: string;
  selectedMonth: string;
  dailyGoal: number;
  recordsByDate: Record<string, DailyRecord>;
  selectedDateInTown?: string;

  setTab: (tab: TabType) => void;
  setDailyGoal: (goal: number) => void;
  addQuest: (title: string, type: QuestType) => { ok: boolean; reason?: string };
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

const normalizeQuest = (raw: LegacyTodoLike): QuestItem | null => {
  const title = (raw.title ?? raw.text ?? "").trim();
  if (!title) return null;

  return {
    id: raw.id ?? crypto.randomUUID(),
    title,
    type: isQuestType(raw.type) ? raw.type : "daily",
    completed: Boolean(raw.completed),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    completedAt: raw.completed ? raw.completedAt ?? new Date().toISOString() : undefined,
    isRecurring: raw.isRecurring,
    recurrenceKey: raw.recurrenceKey
  };
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

const normalizeRecord = (dateKey: string, raw?: LegacyRecordLike): DailyRecord => {
  const base = ensureDailyRecord(dateKey);
  if (!raw) return base;

  const source = Array.isArray(raw.quests) ? raw.quests : Array.isArray(raw.todos) ? raw.todos : [];
  const quests = source.map(normalizeQuest).filter((quest): quest is QuestItem => Boolean(quest));

  return recalc(
    {
      ...base,
      date: raw.date ?? dateKey,
      quests,
      isFinalized: Boolean(raw.isFinalized)
    },
    Boolean(raw.isFinalized)
  );
};

const getRecord = (recordsByDate: Record<string, DailyRecord>, dateKey: string) => {
  return recordsByDate[dateKey] ?? ensureDailyRecord(dateKey);
};

export const useQuestownStore = create<QuestownState>()(
  persist(
    (set, get) => ({
      currentTab: "today",
      currentDateKey: toDateKey(),
      selectedMonth: toMonthKey(),
      dailyGoal: 3,
      recordsByDate: {},

      setTab: (tab) => set({ currentTab: tab }),

      setDailyGoal: (goal) => {
        const nextGoal = Math.min(10, Math.max(1, Math.round(goal || 1)));
        set({ dailyGoal: nextGoal });
      },

      addQuest: (title, type) => {
        const trimmed = title.trim();
        if (!trimmed) return { ok: false, reason: "퀘스트를 입력해 주세요." };
        if (!isQuestType(type)) return { ok: false, reason: "올바른 퀘스트 타입이 아니에요." };
        if (trimmed.length > MAX_QUEST_TITLE_LENGTH) {
          return { ok: false, reason: `퀘스트는 ${MAX_QUEST_TITLE_LENGTH}자 이하로 입력해 주세요.` };
        }

        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        if (today.isFinalized) return { ok: false, reason: "이미 마감된 날짜는 수정할 수 없어요." };

        if (today.quests.some((quest) => quest.type === type && quest.title === trimmed)) {
          return { ok: false, reason: "같은 타입에 동일한 퀘스트가 이미 있어요." };
        }

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
                createdAt: new Date().toISOString()
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

      toggleQuest: (questId) => {
        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        if (today.isFinalized) return { ok: false, reason: "마감된 날짜는 체크 변경이 불가해요." };

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

        const next = recalc(
          {
            ...today,
            quests: today.quests.filter((quest) => quest.id !== questId),
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
        const finalized = recalc(today, true);
        const nextKey = addDays(todayKey, 1);

        set((state) => ({
          currentDateKey: nextKey,
          selectedMonth: toMonthKey(new Date(`${nextKey}T00:00:00+09:00`)),
          recordsByDate: {
            ...state.recordsByDate,
            [todayKey]: finalized,
            [nextKey]: state.recordsByDate[nextKey] ?? ensureDailyRecord(nextKey)
          }
        }));
      },

      moveMonth: (delta) => set((state) => ({ selectedMonth: addMonths(state.selectedMonth, delta) })),
      selectDateInTown: (date) => set({ selectedDateInTown: date }),

      hydrateToday: () => {
        const actualTodayKey = toDateKey();
        const activeDateKey = get().currentDateKey || actualTodayKey;
        const dateKey = activeDateKey < actualTodayKey ? actualTodayKey : activeDateKey;
        const rec = getRecord(get().recordsByDate, dateKey);

        set((state) => ({
          currentDateKey: dateKey,
          selectedMonth: toMonthKey(new Date(`${dateKey}T00:00:00+09:00`)),
          recordsByDate: { ...state.recordsByDate, [dateKey]: recalc(rec, rec.isFinalized) }
        }));
      },

      rolloverToToday: () => {
        const todayKey = toDateKey();
        const currentKey = get().currentDateKey;
        if (todayKey === currentKey) return;

        const currentRecord = getRecord(get().recordsByDate, currentKey);
        const finalizedCurrent = currentRecord.isFinalized ? currentRecord : recalc(currentRecord, true);

        set((state) => ({
          currentDateKey: todayKey,
          selectedMonth: toMonthKey(),
          recordsByDate: {
            ...state.recordsByDate,
            [currentKey]: finalizedCurrent,
            [todayKey]: state.recordsByDate[todayKey] ?? ensureDailyRecord(todayKey)
          }
        }));
      },

      exportBackup: () => ({
        version: 2,
        exportedAt: new Date().toISOString(),
        state: {
          currentDateKey: get().currentDateKey,
          selectedMonth: get().selectedMonth,
          dailyGoal: get().dailyGoal,
          recordsByDate: get().recordsByDate
        }
      }),

      importBackup: (data) => {
        if (!data?.state?.recordsByDate) return { ok: false, reason: "백업 데이터 형식이 올바르지 않아요." };

        const nextDate = data.state.currentDateKey || toDateKey();
        const normalizedRecords = Object.entries(data.state.recordsByDate).reduce<Record<string, DailyRecord>>(
          (acc, [key, value]) => {
            acc[key] = normalizeRecord(key, value as LegacyRecordLike);
            return acc;
          },
          {}
        );

        set({
          currentDateKey: nextDate,
          selectedMonth: data.state.selectedMonth || toMonthKey(new Date(`${nextDate}T00:00:00+09:00`)),
          dailyGoal: data.state.dailyGoal || 3,
          recordsByDate: normalizedRecords
        });

        return { ok: true };
      }
    }),
    {
      name: "questown-mvp-storage",
      version: 4,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as Partial<QuestownState> & {
          recordsByDate?: Record<string, LegacyRecordLike>;
        };

        const recordsByDate = Object.entries(state.recordsByDate ?? {}).reduce<Record<string, DailyRecord>>(
          (acc, [key, value]) => {
            acc[key] = normalizeRecord(key, value);
            return acc;
          },
          {}
        );

        return {
          currentTab: state.currentTab ?? "today",
          currentDateKey: state.currentDateKey ?? toDateKey(),
          selectedMonth: state.selectedMonth ?? toMonthKey(),
          dailyGoal: state.dailyGoal ?? 3,
          recordsByDate,
          selectedDateInTown: state.selectedDateInTown
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
