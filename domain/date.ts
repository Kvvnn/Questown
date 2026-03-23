import { DailyRecord } from "./types";

const APP_TIME_ZONE = "Asia/Seoul";

const formatInTimeZone = (date: Date, format: "date" | "month") => {
  const locale = format === "date" ? "sv-SE" : "sv-SE";
  const value = new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    ...(format === "date" ? { day: "2-digit" } : {})
  }).format(date);

  return format === "date" ? value : value.slice(0, 7);
};

export const toDateKey = (date = new Date()) => formatInTimeZone(date, "date");
export const toMonthKey = (date = new Date()) => formatInTimeZone(date, "month");

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
