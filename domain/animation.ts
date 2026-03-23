export type QuestAnimationEventType =
  | "idle"
  | "todo-complete"
  | "goal-reached"
  | "day-finalized"
  | "streak-up";

export interface QuestAnimationEvent {
  type: QuestAnimationEventType;
  token: number;
}

export const idleQuestAnimationEvent: QuestAnimationEvent = {
  type: "idle",
  token: 0
};
