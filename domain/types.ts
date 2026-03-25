export type RoofType = "none" | "low" | "mid" | "high";

export type QuestType = "daily" | "main" | "sub";

export type QuestPriority = "p1" | "p2" | "p3";

export type RecurrencePattern = "none" | "daily" | "weekdays" | "weekly" | "interval";

export interface QuestTypeCounter {
  daily: number;
  main: number;
  sub: number;
}

export interface QuestItem {
  id: string;
  title: string;
  type: QuestType;
  completed: boolean;
  createdAt: string;
  completedAt?: string;

  // Execution metadata
  priority?: QuestPriority;
  dependencyQuestIds?: string[];
  focusPinned?: boolean;

  // Recurrence metadata
  isRecurring?: boolean;
  recurrenceKey?: string;
  recurrencePattern?: RecurrencePattern;
  recurrenceIntervalDays?: number;
  recurrenceAnchorDate?: string;

  // Carry-over metadata
  carryOverEnabled?: boolean;
  carryOverLimit?: number;
  carryOverCount?: number;
  carryOverSourceQuestId?: string;
}

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  quests: QuestItem[];
  completedCount: number;
  totalCount: number;
  completionRate: number;
  roofType: RoofType;
  isFinalized: boolean;
  completedByType: QuestTypeCounter;
  totalByType: QuestTypeCounter;
}

export interface MonthlyTown {
  monthKey: string; // YYYY-MM
  dailyRecords: DailyRecord[];
}

export interface AppBackupData {
  version: number;
  exportedAt: string;
  state: {
    currentDateKey: string;
    selectedMonth: string;
    dailyGoal: number;
    weeklyMainTarget?: number;
    recordsByDate: Record<string, DailyRecord>;
  };
}

export type TabType = "today" | "town" | "manage";
