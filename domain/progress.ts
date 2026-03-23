import { DailyRecord } from "./types";
import { addDays, toDateKey } from "./date";

export const isDaySuccessful = (record?: DailyRecord, goal = 1) => {
  if (!record || !record.isFinalized) return false;
  return record.completedCount >= goal;
};

export const getStreakCount = (recordsByDate: Record<string, DailyRecord>, fromDateKey = toDateKey(), goal = 1) => {
  let streak = 0;
  let cursor = fromDateKey;

  while (isDaySuccessful(recordsByDate[cursor], goal)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
};

export interface WeeklySummary {
  completed: number;
  total: number;
  completionRate: number;
  successfulDays: number;
}

export const getWeeklySummary = (recordsByDate: Record<string, DailyRecord>, endDateKey = toDateKey(), goal = 1): WeeklySummary => {
  let completed = 0;
  let total = 0;
  let successfulDays = 0;

  for (let i = 0; i < 7; i += 1) {
    const key = addDays(endDateKey, -i);
    const rec = recordsByDate[key];
    if (!rec) continue;
    completed += rec.completedCount;
    total += rec.totalCount;
    if (isDaySuccessful(rec, goal)) successfulDays += 1;
  }

  return {
    completed,
    total,
    completionRate: total > 0 ? completed / total : 0,
    successfulDays
  };
};
