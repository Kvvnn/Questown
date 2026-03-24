import { sanitizeQuestDependencies } from "../domain/execution";
import { QuestItem } from "../domain/types";

export const normalizeImportedRecordState = (dateKey: string, quests: QuestItem[]) => ({
  date: dateKey,
  quests: sanitizeQuestDependencies(quests)
});
