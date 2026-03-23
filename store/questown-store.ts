"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getBuildingHeight, getCompletionRate, getRoofType } from "@/domain/building";
import { addDays, addMonths, ensureDailyRecord, toDateKey, toMonthKey } from "@/domain/date";
import { AppBackupData, DailyRecord, TabType } from "@/domain/types";

const MAX_TODO_LENGTH = 80;

interface QuestownState {
  currentTab: TabType;
  currentDateKey: string;
  selectedMonth: string;
  dailyGoal: number;
  recordsByDate: Record<string, DailyRecord>;
  selectedDateInTown?: string;

  setTab: (tab: TabType) => void;
  setDailyGoal: (goal: number) => void;
  addTodo: (text: string) => { ok: boolean; reason?: string };
  toggleTodo: (todoId: string) => { ok: boolean; reason?: string };
  deleteTodo: (todoId: string) => { ok: boolean; reason?: string };
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

      addTodo: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return { ok: false, reason: "할 일을 입력해 주세요." };
        if (trimmed.length > MAX_TODO_LENGTH) return { ok: false, reason: `할 일은 ${MAX_TODO_LENGTH}자 이하로 입력해 주세요.` };

        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        if (today.isFinalized) return { ok: false, reason: "이미 마감된 날짜는 수정할 수 없어요." };
        if (today.todos.some((t) => t.text === trimmed)) return { ok: false, reason: "같은 할 일이 이미 있어요." };

        const next = recalc({
          ...today,
          todos: [
            ...today.todos,
            {
              id: crypto.randomUUID(),
              text: trimmed,
              completed: false,
              createdAt: new Date().toISOString()
            }
          ],
          isFinalized: false,
          roofType: "none"
        });

        set((state) => ({ recordsByDate: { ...state.recordsByDate, [dateKey]: next } }));
        return { ok: true };
      },

      toggleTodo: (todoId) => {
        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        if (today.isFinalized) return { ok: false, reason: "마감된 날짜는 체크 변경이 불가해요." };

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
        return { ok: true };
      },

      deleteTodo: (todoId) => {
        const dateKey = get().currentDateKey;
        const today = getRecord(get().recordsByDate, dateKey);
        if (today.isFinalized) return { ok: false, reason: "마감된 날짜는 삭제할 수 없어요." };

        const next = recalc({
          ...today,
          todos: today.todos.filter((todo) => todo.id !== todoId),
          isFinalized: false,
          roofType: "none"
        });

        set((state) => ({ recordsByDate: { ...state.recordsByDate, [dateKey]: next } }));
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
        version: 1,
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
        set({
          currentDateKey: nextDate,
          selectedMonth: data.state.selectedMonth || toMonthKey(new Date(`${nextDate}T00:00:00+09:00`)),
          dailyGoal: data.state.dailyGoal || 3,
          recordsByDate: data.state.recordsByDate
        });

        return { ok: true };
      }
    }),
    {
      name: "questown-mvp-storage",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as Partial<QuestownState>;
        return {
          currentTab: state.currentTab ?? "today",
          currentDateKey: state.currentDateKey ?? toDateKey(),
          selectedMonth: state.selectedMonth ?? toMonthKey(),
          dailyGoal: state.dailyGoal ?? 3,
          recordsByDate: state.recordsByDate ?? {},
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
