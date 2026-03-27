import { getBuildingHeight } from "./building";
import { ensureDailyRecord, getDaysInMonth, isMonthKey } from "./date";
import { ExecutionQueueItem, getBlockedDependencyIds, getExecutionQueue } from "./execution";
import { getPreferredTownDate } from "./town-navigation";
import { DailyRecord, QuestItem } from "./types";

export const getMonthKeyFromDateKey = (dateKey: string) => dateKey.slice(0, 7);

export const getRecordForDate = (recordsByDate: Record<string, DailyRecord>, dateKey: string) =>
  recordsByDate[dateKey] ?? ensureDailyRecord(dateKey);

export const getTodayRecord = (recordsByDate: Record<string, DailyRecord>, currentDateKey: string) =>
  getRecordForDate(recordsByDate, currentDateKey);

export const getTodayBuildingHeight = (recordsByDate: Record<string, DailyRecord>, currentDateKey: string) =>
  getBuildingHeight(getTodayRecord(recordsByDate, currentDateKey).completedCount);

export const resolveTownMonth = (selectedMonth: string | undefined, fallbackDateKey: string) => {
  const fallbackMonth = getMonthKeyFromDateKey(fallbackDateKey);
  if (!isMonthKey(selectedMonth)) return fallbackMonth;
  return selectedMonth > fallbackMonth ? fallbackMonth : selectedMonth;
};

export const getPreferredTownSelection = (
  selectedMonth: string | undefined,
  currentDateKey: string,
  selectedDateInTown: string | undefined,
  recordsByDate: Record<string, DailyRecord>
) => {
  const monthKey = resolveTownMonth(selectedMonth, currentDateKey);

  return {
    monthKey,
    dateKey: getPreferredTownDate({
      monthKey,
      dayCount: getDaysInMonth(monthKey),
      currentDate: currentDateKey,
      selectedDate: selectedDateInTown,
      availableDates: Object.keys(recordsByDate)
    })
  };
};

export interface HeroQuestCandidate {
  source: "focus" | "queue";
  quest: QuestItem;
  queueItem?: ExecutionQueueItem;
  blockedByIds: string[];
  blockedReason?: string;
  isFocused: boolean;
}

const getBlockedReason = (blockedByIds: string[], questMap: Map<string, QuestItem>) => {
  const blockerTitle = blockedByIds.map((id) => questMap.get(id)?.title).find((title): title is string => Boolean(title));
  return blockerTitle ? `${blockerTitle}부터 끝내면 열려요.` : "먼저 선행 퀘스트를 확인해야 해요.";
};

export const getHeroQuestCandidate = (record: DailyRecord) => {
  const questMap = new Map(record.quests.map((quest) => [quest.id, quest] as const));
  const focusedQuest = record.quests.find((quest) => quest.focusPinned && !quest.completed);
  if (focusedQuest) {
    const blockedByIds = getBlockedDependencyIds(focusedQuest, questMap);
    return {
      source: "focus" as const,
      quest: focusedQuest,
      queueItem: undefined,
      blockedByIds,
      blockedReason: blockedByIds.length > 0 ? getBlockedReason(blockedByIds, questMap) : undefined,
      isFocused: true
    };
  }

  const queueItem = getExecutionQueue(record.quests)[0];
  if (!queueItem) return null;

  return {
    source: "queue" as const,
    quest: queueItem.quest,
    queueItem,
    blockedByIds: queueItem.blockedByIds,
    blockedReason: queueItem.blockedByIds.length > 0 ? getBlockedReason(queueItem.blockedByIds, questMap) : undefined,
    isFocused: false
  };
};
