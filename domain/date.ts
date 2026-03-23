import { DailyRecord } from "./types";

export const toDateKey = (date = new Date()) => date.toISOString().slice(0, 10);
export const toMonthKey = (date = new Date()) => date.toISOString().slice(0, 7);

export const startOfMonth = (monthKey: string) => new Date(`${monthKey}-01T00:00:00`);

export const getDaysInMonth = (monthKey: string) => {
  const d = startOfMonth(monthKey);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

export const addMonths = (monthKey: string, delta: number) => {
  const d = startOfMonth(monthKey);
  d.setMonth(d.getMonth() + delta);
  return toMonthKey(d);
};

export const ensureDailyRecord = (dateKey: string): DailyRecord => ({
  date: dateKey,
  todos: [],
  completedCount: 0,
  totalCount: 0,
  completionRate: 0,
  roofType: "none",
  isFinalized: false
});
