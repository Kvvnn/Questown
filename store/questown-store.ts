"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getBuildingHeight, getCompletionRate, getRoofType } from "@/domain/building";
import { addMonths, ensureDailyRecord, toDateKey, toMonthKey } from "@/domain/date";
import { DailyRecord, TabType } from "@/domain/types";

interface QuestownState {
  currentTab: TabType;
  currentDateKey: string;
  selectedMonth: string;
  recordsByDate: Record<string, DailyRecord>;
  selectedDateInTown?: string;
  setTab: (tab: TabType) => void;
  addTodo: (text: string) => void;
  toggleTodo: (todoId: string) => void;
  deleteTodo: (todoId: string) => void;
  finalizeCurrentDay: () => void;
  goNextDayForDev: () => void;
  moveMonth: (delta: number) => void;
  selectDateInTown: (date: string) => void;
  hydrateToday: () => void;
}

const recalc = (record: DailyRecord, finalized = record.isFinalized): DailyRecord => {
  const completedCount = record.todos.filter((t) => t.completed).length;
  const totalCount = record.todos.length;
  const completionRate = getCompletionRate(completedCount, totalCount);

  return {
    ...record,
    completedCount,
    totalCount,
    completionRate,
    roofType: finalized ? getRoofType(completionRate) : "none",
    isFinalized: finalized
  };
};

const getTodayRecord = (recordsByDate: Record<string, DailyRecord>, dateKey = toDateKey()) => {
  return recordsByDate[dateKey] ?? ensureDailyRecord(dateKey);
};

export const useQuestownStore = create<QuestownState>()(
  persist(
    (set, get) => ({
      currentTab: "today",
      currentDateKey: toDateKey(),
      selectedMonth: toMonthKey(),
      recordsByDate: {},
      setTab: (tab) => set({ currentTab: tab }),
      addTodo: (text) => {
        if (!text.trim()) return;
        const dateKey = get().currentDateKey;
        const today = getTodayRecord(get().recordsByDate, dateKey);
        const next = recalc({
          ...today,
          todos: [
            ...today.todos,
            {
              id: crypto.randomUUID(),
              text: text.trim(),
              completed: false,
              createdAt: new Date().toISOString()
            }
          ],
          isFinalized: false,
          roofType: "none"
        });

        set((state) => ({
          recordsByDate: { ...state.recordsByDate, [dateKey]: next }
        }));
      },
      toggleTodo: (todoId) => {
        const dateKey = get().currentDateKey;
        const today = getTodayRecord(get().recordsByDate, dateKey);
        const next = recalc({
          ...today,
          todos: today.todos.map((todo) =>
            todo.id === todoId
              ? {
                  ...todo,
                  completed: !todo.completed,
                  completedAt: !todo.completed ? new Date().toISOString() : undefined
                }
              : todo
          ),
          isFinalized: false,
          roofType: "none"
        });

        set((state) => ({ recordsByDate: { ...state.recordsByDate, [dateKey]: next } }));
      },
      deleteTodo: (todoId) => {
        const dateKey = get().currentDateKey;
        const today = getTodayRecord(get().recordsByDate, dateKey);
        const next = recalc({
          ...today,
          todos: today.todos.filter((todo) => todo.id !== todoId),
          isFinalized: false,
          roofType: "none"
        });

        set((state) => ({ recordsByDate: { ...state.recordsByDate, [dateKey]: next } }));
      },
      finalizeCurrentDay: () => {
        const dateKey = get().currentDateKey;
        const today = getTodayRecord(get().recordsByDate, dateKey);
        const next = recalc(today, true);
        set((state) => ({ recordsByDate: { ...state.recordsByDate, [dateKey]: next } }));
      },
      goNextDayForDev: () => {
        const todayKey = get().currentDateKey;
        const today = getTodayRecord(get().recordsByDate, todayKey);
        const finalized = recalc(today, true);

        const nextDate = new Date(`${todayKey}T00:00:00`);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextKey = toDateKey(nextDate);

        set((state) => ({
          currentDateKey: nextKey,
          selectedMonth: toMonthKey(nextDate),
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
        const rec = getTodayRecord(get().recordsByDate, dateKey);
        set((state) => ({
          currentDateKey: dateKey,
          selectedMonth: toMonthKey(new Date(`${dateKey}T00:00:00`)),
          recordsByDate: { ...state.recordsByDate, [dateKey]: recalc(rec, rec.isFinalized) }
        }));
      }
    }),
    {
      name: "questown-mvp-storage",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: unknown, version) => {
        const state = (persistedState ?? {}) as Partial<QuestownState>;

        if (version < 2) {
          return {
            currentTab: state.currentTab ?? "today",
            currentDateKey: state.currentDateKey ?? toDateKey(),
            selectedMonth: state.selectedMonth ?? toMonthKey(),
            recordsByDate: state.recordsByDate ?? {},
            selectedDateInTown: state.selectedDateInTown
          };
        }

        return {
          currentTab: state.currentTab ?? "today",
          currentDateKey: state.currentDateKey ?? toDateKey(),
          selectedMonth: state.selectedMonth ?? toMonthKey(),
          recordsByDate: state.recordsByDate ?? {},
          selectedDateInTown: state.selectedDateInTown
        };
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
