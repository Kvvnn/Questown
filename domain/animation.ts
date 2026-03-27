import { getRoofType } from "./building";
import { QuestItem, RoofType } from "./types";

export type QuestAnimationEventType =
  | "idle"
  | "quest-complete"
  | "combo-up"
  | "main-quest-clear"
  | "roof-preview"
  | "goal-reached"
  | "day-finalized"
  | "streak-up";

export type QuestAnimationTone = "info" | "success" | "epic";

export interface QuestAnimationEvent {
  type: QuestAnimationEventType;
  token: number;
}

export interface QuestAnimationFeedback {
  type: QuestAnimationEventType;
  text: string;
  tone: QuestAnimationTone;
}

export interface RewardQueueSnapshot {
  completedCount: number;
  totalCount: number;
  completionRate: number;
  isFinalized: boolean;
  quests: QuestItem[];
}

const roofRank: Record<RoofType, number> = {
  none: 0,
  low: 1,
  mid: 2,
  high: 3
};

const getCompletedQuestLookup = (quests: QuestItem[]) =>
  new Map(quests.map((quest) => [quest.id, quest.completed] as const));

export const getRoofPreviewType = ({
  completedCount,
  completionRate,
  isFinalized
}: Pick<RewardQueueSnapshot, "completedCount" | "completionRate" | "isFinalized">): RoofType => {
  if (isFinalized || completedCount <= 0) return "none";
  return getRoofType(completionRate);
};

export const findNewlyCompletedQuest = (previousQuests: QuestItem[], nextQuests: QuestItem[]) => {
  const previousLookup = getCompletedQuestLookup(previousQuests);

  const newlyCompleted = nextQuests
    .filter((quest) => quest.completed && !previousLookup.get(quest.id))
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));

  return newlyCompleted[0] ?? null;
};

export const buildQuestRewardQueue = ({
  previous,
  next,
  previousStreak,
  nextStreak,
  dailyGoal,
  newlyCompletedQuest
}: {
  previous: RewardQueueSnapshot;
  next: RewardQueueSnapshot;
  previousStreak: number;
  nextStreak: number;
  dailyGoal: number;
  newlyCompletedQuest?: QuestItem | null;
}) => {
  const queue: Array<{ priority: number; event: QuestAnimationFeedback }> = [];
  const questCompleted = next.completedCount > previous.completedCount;
  const previousPreviewRoof = getRoofPreviewType(previous);
  const nextPreviewRoof = getRoofPreviewType(next);
  const roofUpgraded = roofRank[nextPreviewRoof] > roofRank[previousPreviewRoof];
  const reachedGoal = previous.completedCount < dailyGoal && next.completedCount >= dailyGoal;
  const comboCount = questCompleted ? next.completedCount : 0;

  if (questCompleted && newlyCompletedQuest?.type === "main") {
    queue.push({
      priority: 10,
      event: {
        type: "main-quest-clear",
        text: "메인 퀘스트 클리어!",
        tone: "epic"
      }
    });
  }

  if (reachedGoal) {
    queue.push({
      priority: 11,
      event: {
        type: "goal-reached",
        text: "오늘 목표 달성! 지붕을 닫을 준비가 됐어요.",
        tone: "epic"
      }
    });
  }

  if (roofUpgraded) {
    queue.push({
      priority: 12,
      event: {
        type: "roof-preview",
        text: "이 속도면 지붕 업그레이드!",
        tone: "info"
      }
    });
  }

  if (comboCount >= 2) {
    queue.push({
      priority: 20,
      event: {
        type: "combo-up",
        text: `${comboCount}콤보!`,
        tone: comboCount >= 4 ? "epic" : "success"
      }
    });
  }

  if (questCompleted) {
    queue.push({
      priority: 30,
      event: {
        type: "quest-complete",
        text: "+1층 · 퀘스트 완료",
        tone: "success"
      }
    });
  }

  if (nextStreak > previousStreak) {
    queue.push({
      priority: 40,
      event: {
        type: "streak-up",
        text: `🔥 ${nextStreak}일 연속 달성!`,
        tone: "epic"
      }
    });
  }

  if (!previous.isFinalized && next.isFinalized) {
    queue.push({
      priority: 50,
      event: {
        type: "day-finalized",
        text: "지붕 완성! 오늘 기록이 저장됐어요.",
        tone: "epic"
      }
    });
  }

  return queue.sort((a, b) => a.priority - b.priority).map((item) => item.event);
};

export const idleQuestAnimationEvent: QuestAnimationEvent = {
  type: "idle",
  token: 0
};
