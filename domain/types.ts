export type RoofType = "none" | "low" | "mid" | "high";

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  todos: TodoItem[];
  completedCount: number;
  totalCount: number;
  completionRate: number;
  roofType: RoofType;
  isFinalized: boolean;
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
