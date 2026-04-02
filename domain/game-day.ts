import { addDays, dateKeyToDate, dateKeyToStartOfDayISOString } from "./date";

const APP_UTC_OFFSET_HOURS = 9;
export const GAME_DAY_START_HOUR = 5;
const GAME_DAY_SHIFT_MS = (APP_UTC_OFFSET_HOURS - GAME_DAY_START_HOUR) * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, "0");

const formatUtcDateKey = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const formatUtcMonthKey = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;

export const toGameDateKey = (date = new Date()) => formatUtcDateKey(new Date(date.getTime() + GAME_DAY_SHIFT_MS));

export const toGameMonthKey = (date = new Date()) => formatUtcMonthKey(new Date(date.getTime() + GAME_DAY_SHIFT_MS));

export const gameDateKeyToStartDate = (dateKey: string) => new Date(dateKeyToDate(dateKey).getTime() - GAME_DAY_SHIFT_MS);

export const getGameDayWindow = (date = new Date()) => {
  const dateKey = toGameDateKey(date);
  const startAt = gameDateKeyToStartDate(dateKey);
  const endAt = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);

  return {
    dateKey,
    monthKey: toGameMonthKey(date),
    startAt,
    endAt,
    nextDateKey: addDays(dateKey, 1)
  };
};

export const getWeekdayForDateKeyInKst = (dateKey: string) => new Date(`${dateKey}T12:00:00+09:00`).getUTCDay();

export const dateKeyMinuteOfDayToDateInKst = (dateKey: string, minuteOfDay: number) => {
  const localMidnight = new Date(dateKeyToStartOfDayISOString(dateKey));
  return new Date(localMidnight.getTime() + minuteOfDay * 60 * 1000);
};
