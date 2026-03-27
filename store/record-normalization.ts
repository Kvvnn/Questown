import { sanitizeQuestDependencies } from "../domain/execution";
import { normalizeFocusedQuests } from "../domain/record-ops";
import { QuestItem } from "../domain/types";

export const normalizeImportedRecordState = (dateKey: string, quests: QuestItem[]) => ({
  date: dateKey,
  quests: normalizeFocusedQuests(sanitizeQuestDependencies(quests))
});
