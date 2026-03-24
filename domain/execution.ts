import { addDays, toDateKey } from "./date";
import { DailyRecord, QuestItem, QuestPriority, QuestType } from "./types";

export const defaultPriorityByType: Record<QuestType, QuestPriority> = {
  main: "p1",
  daily: "p2",
  sub: "p3"
};

export const priorityLabel: Record<QuestPriority, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3"
};

const priorityScore: Record<QuestPriority, number> = {
  p1: 300,
  p2: 200,
  p3: 120
};

const typeScore: Record<QuestType, number> = {
  main: 40,
  daily: 20,
  sub: 10
};

export const normalizeQuestPriority = (priority: QuestItem["priority"], type: QuestType): QuestPriority => {
  if (priority === "p1" || priority === "p2" || priority === "p3") return priority;
  return defaultPriorityByType[type];
};

export const getBlockedDependencyIds = (quest: QuestItem, questMap: Map<string, QuestItem>) => {
  const deps = quest.dependencyQuestIds ?? [];
  return deps.filter((id) => {
    const dep = questMap.get(id);
    if (!dep) return false;
    return !dep.completed;
  });
};

export const sanitizeQuestDependencies = (quests: QuestItem[]) => {
  const questIds = new Set(quests.map((quest) => quest.id));
  const rawDeps = new Map(
    quests.map((quest) => [
      quest.id,
      Array.from(
        new Set(
          (quest.dependencyQuestIds ?? []).filter((dependencyId) => dependencyId !== quest.id && questIds.has(dependencyId))
        )
      )
    ] as const)
  );
  const cleanedDeps = new Map<string, string[]>();
  const visitState = new Map<string, "visiting" | "visited">();

  const visit = (questId: string) => {
    const state = visitState.get(questId);
    if (state === "visited") return cleanedDeps.get(questId) ?? [];
    if (state === "visiting") return [];

    visitState.set(questId, "visiting");

    const nextDeps: string[] = [];
    for (const dependencyId of rawDeps.get(questId) ?? []) {
      if (visitState.get(dependencyId) === "visiting") continue;
      visit(dependencyId);
      nextDeps.push(dependencyId);
    }

    cleanedDeps.set(questId, nextDeps);
    visitState.set(questId, "visited");
    return nextDeps;
  };

  quests.forEach((quest) => {
    visit(quest.id);
  });

  return quests.map((quest) => {
    const dependencyQuestIds = cleanedDeps.get(quest.id) ?? [];
    return {
      ...quest,
      dependencyQuestIds: dependencyQuestIds.length > 0 ? dependencyQuestIds : undefined
    };
  });
};

export const getCompletedDependentIds = (questId: string, questMap: Map<string, QuestItem>) => {
  const visited = new Set<string>([questId]);
  const queue = [questId];
  const completedDependents: string[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;

    questMap.forEach((quest) => {
      if (visited.has(quest.id)) return;
      if (!(quest.dependencyQuestIds ?? []).includes(currentId)) return;

      visited.add(quest.id);
      queue.push(quest.id);
      if (quest.completed) completedDependents.push(quest.id);
    });
  }

  return completedDependents;
};

export const isQuestBlocked = (quest: QuestItem, questMap: Map<string, QuestItem>) => {
  return getBlockedDependencyIds(quest, questMap).length > 0;
};

export interface ExecutionQueueItem {
  quest: QuestItem;
  blockedByIds: string[];
  priority: QuestPriority;
  score: number;
}

const getQuestScore = (quest: QuestItem, blockedCount: number, priority: QuestPriority) => {
  const carryOverBonus = (quest.carryOverCount ?? 0) * 25;
  const focusBonus = quest.focusPinned ? 80 : 0;
  const blockedPenalty = blockedCount > 0 ? 1000 : 0;

  return priorityScore[priority] + typeScore[quest.type] + carryOverBonus + focusBonus - blockedPenalty;
};

export const getExecutionQueue = (quests: QuestItem[]) => {
  const questMap = new Map(quests.map((quest) => [quest.id, quest] as const));

  return quests
    .filter((quest) => !quest.completed)
    .map<ExecutionQueueItem>((quest) => {
      const blockedByIds = getBlockedDependencyIds(quest, questMap);
      const priority = normalizeQuestPriority(quest.priority, quest.type);
      return {
        quest,
        blockedByIds,
        priority,
        score: getQuestScore(quest, blockedByIds.length, priority)
      };
    })
    .sort((a, b) => {
      if (a.blockedByIds.length === 0 && b.blockedByIds.length > 0) return -1;
      if (a.blockedByIds.length > 0 && b.blockedByIds.length === 0) return 1;
      if (a.score !== b.score) return b.score - a.score;
      return a.quest.createdAt.localeCompare(b.quest.createdAt);
    });
};

export const getFocusQuestIds = (quests: QuestItem[], limit = 3) => {
  return getExecutionQueue(quests)
    .filter((item) => item.blockedByIds.length === 0)
    .slice(0, limit)
    .map((item) => item.quest.id);
};

export const getDependencyCandidates = (quests: QuestItem[]) => quests.filter((quest) => !quest.completed);

export interface WeeklyMainProgress {
  completed: number;
  total: number;
  rate: number;
}

export const getWeeklyMainProgress = (
  recordsByDate: Record<string, DailyRecord>,
  endDateKey = toDateKey()
): WeeklyMainProgress => {
  let completed = 0;
  let total = 0;

  for (let i = 0; i < 7; i += 1) {
    const key = addDays(endDateKey, -i);
    const record = recordsByDate[key];
    if (!record) continue;

    completed += record.completedByType.main;
    total += record.totalByType.main;
  }

  return {
    completed,
    total,
    rate: total > 0 ? completed / total : 0
  };
};
