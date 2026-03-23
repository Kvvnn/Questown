export type RoofType = "none" | "low" | "mid" | "high";

export type QuestType = "daily" | "main" | "sub";

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
  isRecurring?: boolean;
  recurrenceKey?: string;
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
    recordsByDate: Record<string, DailyRecord>;
  };
}

export type TabType = "today" | "town";
