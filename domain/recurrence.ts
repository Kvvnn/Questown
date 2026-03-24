import { dateKeyToDate } from "./date";
import { QuestItem, RecurrencePattern } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const validRecurrencePatterns = new Set<RecurrencePattern>(["none", "daily", "weekdays", "weekly", "interval"]);

const normalizeDateDiff = (fromDateKey: string, toDateKey: string) => {
  const from = dateKeyToDate(fromDateKey).getTime();
  const to = dateKeyToDate(toDateKey).getTime();
  return Math.floor((to - from) / DAY_MS);
};

const getWeekday = (dateKey: string) => dateKeyToDate(dateKey).getUTCDay();

export const normalizeRecurrencePattern = (
  pattern: RecurrencePattern | undefined,
  isRecurring: boolean | undefined
): RecurrencePattern => {
  if (pattern && validRecurrencePatterns.has(pattern)) return pattern;
  return isRecurring ? "daily" : "none";
};

export const isRecurringQuest = (quest: QuestItem) => normalizeRecurrencePattern(quest.recurrencePattern, quest.isRecurring) !== "none";

export const isRecurringDueOnDate = (quest: QuestItem, targetDateKey: string) => {
  const pattern = normalizeRecurrencePattern(quest.recurrencePattern, quest.isRecurring);
  if (pattern === "none") return false;

  const anchorDate = quest.recurrenceAnchorDate;
  if (!anchorDate) return pattern === "daily";

  const diff = normalizeDateDiff(anchorDate, targetDateKey);
  if (diff <= 0) return false;

  switch (pattern) {
    case "daily":
      return true;
    case "weekdays": {
      const weekday = getWeekday(targetDateKey);
      return weekday >= 1 && weekday <= 5;
    }
    case "weekly":
      return getWeekday(anchorDate) === getWeekday(targetDateKey);
    case "interval": {
      const interval = Math.max(1, Math.round(quest.recurrenceIntervalDays ?? 2));
      return diff % interval === 0;
    }
    default:
      return false;
  }
};

export const shouldCarryOver = (quest: QuestItem) => {
  if (quest.completed) return false;
  return Boolean(quest.carryOverEnabled);
};

export const canCarryOver = (quest: QuestItem) => {
  const currentCount = quest.carryOverCount ?? 0;
  const max = quest.carryOverLimit;
  if (max === undefined) return true;
  return currentCount + 1 <= max;
};

export const createRecurringQuestCopy = (quest: QuestItem, targetDateKey: string): QuestItem => {
  const pattern = normalizeRecurrencePattern(quest.recurrencePattern, quest.isRecurring);

  return {
    id: crypto.randomUUID(),
    title: quest.title,
    type: quest.type,
    completed: false,
    createdAt: new Date().toISOString(),
    priority: quest.priority,
    focusPinned: quest.focusPinned,
    dependencyQuestIds: undefined,
    isRecurring: pattern !== "none",
    recurrencePattern: pattern,
    recurrenceKey: quest.recurrenceKey ?? quest.id,
    recurrenceAnchorDate: quest.recurrenceAnchorDate ?? targetDateKey,
    recurrenceIntervalDays: pattern === "interval" ? Math.max(1, Math.round(quest.recurrenceIntervalDays ?? 2)) : undefined,
    carryOverEnabled: quest.carryOverEnabled,
    carryOverLimit: quest.carryOverLimit,
    carryOverCount: 0,
    carryOverSourceQuestId: quest.carryOverSourceQuestId
  };
};

export const createCarryOverQuestCopy = (quest: QuestItem): QuestItem | null => {
  if (!shouldCarryOver(quest) || !canCarryOver(quest)) return null;

  const pattern = normalizeRecurrencePattern(quest.recurrencePattern, quest.isRecurring);
  const sourceQuestId = quest.carryOverSourceQuestId ?? quest.id;
  const nextCount = (quest.carryOverCount ?? 0) + 1;

  return {
    id: crypto.randomUUID(),
    title: quest.title,
    type: quest.type,
    completed: false,
    createdAt: new Date().toISOString(),
    priority: quest.priority,
    focusPinned: quest.focusPinned,
    dependencyQuestIds: undefined,
    isRecurring: pattern !== "none",
    recurrencePattern: pattern,
    recurrenceKey: quest.recurrenceKey,
    recurrenceAnchorDate: quest.recurrenceAnchorDate,
    recurrenceIntervalDays: quest.recurrenceIntervalDays,
    carryOverEnabled: quest.carryOverEnabled,
    carryOverLimit: quest.carryOverLimit,
    carryOverCount: nextCount,
    carryOverSourceQuestId: sourceQuestId
  };
};

export const createNextDayQuestCopies = (quest: QuestItem, targetDateKey: string) => {
  const carryOverCopy = createCarryOverQuestCopy(quest);
  const recurringCopy = isRecurringDueOnDate(quest, targetDateKey) ? createRecurringQuestCopy(quest, targetDateKey) : null;

  // A recurring quest that also carries over should still surface as a single next-day quest.
  if (carryOverCopy && recurringCopy) {
    return [carryOverCopy];
  }

  return [carryOverCopy, recurringCopy].filter((item): item is QuestItem => Boolean(item));
};

const toTitleKey = (quest: Pick<QuestItem, "title" | "type">) => `${quest.type}::${quest.title.trim().toLowerCase()}`;

export const mergeGeneratedQuests = (existing: QuestItem[], generated: QuestItem[]) => {
  const recurrenceKeys = new Set(existing.map((quest) => quest.recurrenceKey).filter(Boolean));
  const carryOverSources = new Set(existing.map((quest) => quest.carryOverSourceQuestId).filter(Boolean));
  const titleKeys = new Set(existing.map((quest) => toTitleKey(quest)));

  const next = [...existing];

  generated.forEach((quest) => {
    if (quest.recurrenceKey && recurrenceKeys.has(quest.recurrenceKey)) return;
    if (quest.carryOverSourceQuestId && carryOverSources.has(quest.carryOverSourceQuestId)) return;

    const titleKey = toTitleKey(quest);
    if (!quest.recurrenceKey && !quest.carryOverSourceQuestId && titleKeys.has(titleKey)) return;

    next.push(quest);
    if (quest.recurrenceKey) recurrenceKeys.add(quest.recurrenceKey);
    if (quest.carryOverSourceQuestId) carryOverSources.add(quest.carryOverSourceQuestId);
    titleKeys.add(titleKey);
  });

  return next;
};
