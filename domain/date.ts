import { emptyQuestTypeCounter } from "./quest";
import { DailyRecord } from "./types";

const APP_TIME_ZONE = "Asia/Seoul";
const DATE_KEY_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PARTS = /^(\d{4})-(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, "0");

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

const parseDateKey = (dateKey: string) => {
  const match = DATE_KEY_PARTS.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
};

const parseMonthKey = (monthKey: string) => {
  const match = MONTH_KEY_PARTS.exec(monthKey);
  if (!match) throw new Error(`Invalid month key: ${monthKey}`);

  return {
    year: Number(match[1]),
    month: Number(match[2])
  };
};

const formatUtcDateKey = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const formatUtcMonthKey = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;

export const toDateKey = (date = new Date()) => {
  const { year, month, day } = toParts(date);
  return `${year}-${month}-${day}`;
};

export const toMonthKey = (date = new Date()) => {
  const { year, month } = toParts(date);
  return `${year}-${month}`;
};

export const dateKeyToDate = (dateKey: string) => {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day));
};

export const monthKeyToDate = (monthKey: string) => {
  const { year, month } = parseMonthKey(monthKey);
  return new Date(Date.UTC(year, month - 1, 1));
};

export const addDays = (dateKey: string, delta: number) => {
  const d = dateKeyToDate(dateKey);
  d.setUTCDate(d.getUTCDate() + delta);
  return formatUtcDateKey(d);
};

export const getDaysInMonth = (monthKey: string) => {
  const { year, month } = parseMonthKey(monthKey);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

export const addMonths = (monthKey: string, delta: number) => {
  const d = monthKeyToDate(monthKey);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return formatUtcMonthKey(d);
};

export const ensureDailyRecord = (dateKey: string): DailyRecord => ({
  date: dateKey,
  quests: [],
  completedCount: 0,
  totalCount: 0,
  completionRate: 0,
  roofType: "none",
  isFinalized: false,
  completedByType: emptyQuestTypeCounter(),
  totalByType: emptyQuestTypeCounter()
});
