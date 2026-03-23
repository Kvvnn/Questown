import { DailyRecord } from "./types";

const APP_TIME_ZONE = "Asia/Seoul";

const toParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const pick = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";
  return { year: pick("year"), month: pick("month"), day: pick("day") };
};

export const toDateKey = (date = new Date()) => {
  const { year, month, day } = toParts(date);
  return `${year}-${month}-${day}`;
};

export const toMonthKey = (date = new Date()) => {
  const { year, month } = toParts(date);
  return `${year}-${month}`;
};

export const dateKeyToDate = (dateKey: string) => new Date(`${dateKey}T00:00:00+09:00`);

export const monthKeyToDate = (monthKey: string) => new Date(`${monthKey}-01T00:00:00+09:00`);

export const addDays = (dateKey: string, delta: number) => {
  const d = dateKeyToDate(dateKey);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
};

export const getDaysInMonth = (monthKey: string) => {
  const d = monthKeyToDate(monthKey);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

export const addMonths = (monthKey: string, delta: number) => {
  const d = monthKeyToDate(monthKey);
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
