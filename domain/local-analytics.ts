import { addDays, dateKeyToDate } from "./date";
import { DailyRecord, LocalAnalyticsSnapshot } from "./types";

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
};

const getDateRange = (endDateKey: string, days: number) =>
  Array.from({ length: days }, (_, index) => addDays(endDateKey, -(days - 1) + index));

const getWeekStartMonday = (dateKey: string) => {
  const utcDate = dateKeyToDate(dateKey);
  const dayOfWeek = utcDate.getUTCDay();
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return addDays(dateKey, -offset);
};

const getWeeklyMainCompleted = (recordsByDate: Record<string, DailyRecord>, weekStartDateKey: string) =>
  Array.from({ length: 7 }, (_, index) => addDays(weekStartDateKey, index)).reduce(
    (sum, dateKey) => sum + (recordsByDate[dateKey]?.completedByType.main ?? 0),
    0
  );

export const getLocalAnalyticsSnapshot = (
  recordsByDate: Record<string, DailyRecord>,
  currentDateKey: string,
  _dailyGoal: number,
  weeklyMainTarget: number
): LocalAnalyticsSnapshot => {
  const last7Dates = getDateRange(currentDateKey, 7);
  const avgCompletedLast7 = average(last7Dates.map((dateKey) => recordsByDate[dateKey]?.completedCount ?? 0));

  const last14Dates = getDateRange(currentDateKey, 14);
  const finalizedDaysLast14 = last14Dates.filter((dateKey) => recordsByDate[dateKey]?.isFinalized).length;
  const finalizedRateLast14 = Math.round((finalizedDaysLast14 / 14) * 100);

  let weeklySuccessStreak = 0;
  let cursorWeekStart = getWeekStartMonday(currentDateKey);

  while (getWeeklyMainCompleted(recordsByDate, cursorWeekStart) >= weeklyMainTarget) {
    weeklySuccessStreak += 1;
    cursorWeekStart = addDays(cursorWeekStart, -7);
  }

  return {
    avgCompletedLast7,
    finalizedRateLast14,
    finalizedDaysLast14,
    weeklySuccessStreak
  };
};
