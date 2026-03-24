import { DailyRecord, QuestItem, QuestType, QuestTypeCounter } from "./types";

export const questTypeOrder: QuestType[] = ["daily", "main", "sub"];

export const emptyQuestTypeCounter = (): QuestTypeCounter => ({
  daily: 0,
  main: 0,
  sub: 0
});

export const questTypeLabel: Record<QuestType, string> = {
  daily: "루틴 퀘스트",
  main: "메인 퀘스트",
  sub: "서브 퀘스트"
};

export const questTypeShortLabel: Record<QuestType, string> = {
  daily: "루틴",
  main: "메인",
  sub: "서브"
};

export const getQuestCounts = (quests: QuestItem[]) => {
  const totalByType = emptyQuestTypeCounter();
  const completedByType = emptyQuestTypeCounter();

  quests.forEach((quest) => {
    totalByType[quest.type] += 1;
    if (quest.completed) completedByType[quest.type] += 1;
  });

  return { totalByType, completedByType };
};

export const getCompletedQuestTypes = (quests: QuestItem[]) =>
  quests
    .filter((quest) => quest.completed)
    .sort((a, b) => {
      const aTime = a.completedAt ?? a.createdAt;
      const bTime = b.completedAt ?? b.createdAt;
      return aTime.localeCompare(bTime);
    })
    .map((quest) => quest.type);

export const getDominantQuestType = (
  record: DailyRecord | undefined,
  source: "completed" | "total" = "completed"
): QuestType | null => {
  if (!record) return null;

  const pool = source === "completed" ? record.completedByType : record.totalByType;
  const sorted = questTypeOrder
    .map((type) => ({ type, value: pool[type] }))
    .sort((a, b) => b.value - a.value);

  if (!sorted[0] || sorted[0].value === 0) return null;
  return sorted[0].type;
};
