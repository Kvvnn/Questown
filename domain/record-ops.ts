import { getCompletionRate, getRoofType } from "./building";
import {
  getBlockedDependencyIds,
  getCompletedDependentIds,
  normalizeQuestPriority,
  wouldCreateDependencyCycle
} from "./execution";
import { createQuestownId } from "./id";
import { getQuestCounts, getQuestTitleKey } from "./quest";
import { normalizeRecurrencePattern } from "./recurrence";
import { DailyRecord, QuestItem, QuestPriority, QuestType, RecurrencePattern } from "./types";

export const MAX_QUEST_TITLE_LENGTH = 80;

interface UpdateQuestMetaInput {
  priority?: QuestPriority;
  dependencyQuestIds?: string[];
  focusPinned?: boolean;
}

interface AddQuestInput {
  title: string;
  type: QuestType;
  priority?: QuestPriority;
  dependencyQuestIds?: string[];
  recurrencePattern?: RecurrencePattern;
  recurrenceIntervalDays?: number;
  carryOverEnabled?: boolean;
  carryOverLimit?: number;
}

type RecordMutationSuccess = {
  ok: true;
  record: DailyRecord;
};

type RecordMutationFailure = {
  ok: false;
  reason: string;
};

export type RecordMutationResult = RecordMutationSuccess | RecordMutationFailure;

const normalizePositiveInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const normalizeDependencyIds = (ids: unknown, selfId?: string) => {
  if (!Array.isArray(ids)) return undefined;

  const cleaned = Array.from(
    new Set(
      ids
        .filter((value): value is string => typeof value === "string")
        .filter((value) => value !== selfId)
    )
  );

  return cleaned.length > 0 ? cleaned : undefined;
};

const formatQuestPreview = (questIds: string[], questMap: Map<string, QuestItem>) => {
  const titles = questIds
    .map((questId) => questMap.get(questId)?.title ?? questId)
    .filter((title) => title.trim().length > 0);
  const preview = titles.slice(0, 2).join(", ");
  const suffix = titles.length > 2 ? ` 외 ${titles.length - 2}개` : "";

  return `${preview}${suffix}`;
};

const validateDependencySelection = ({
  ids,
  availableQuestIds,
  selfId,
  questMap
}: {
  ids: unknown;
  availableQuestIds: Set<string>;
  selfId?: string;
  questMap?: Map<string, QuestItem>;
}): { ok: true; dependencyQuestIds?: string[] } | { ok: false; reason: string } => {
  const cleaned = normalizeDependencyIds(ids, selfId);
  if (!cleaned || cleaned.length === 0) {
    return { ok: true, dependencyQuestIds: undefined };
  }

  const missingQuestIds = cleaned.filter((value) => !availableQuestIds.has(value));
  if (missingQuestIds.length > 0) {
    return { ok: false, reason: "선행 퀘스트를 찾을 수 없어요." };
  }

  if (selfId && questMap) {
    const cyclicQuestIds = cleaned.filter((dependencyId) => wouldCreateDependencyCycle(selfId, dependencyId, questMap));
    if (cyclicQuestIds.length > 0) {
      return {
        ok: false,
        reason: `순환 선행 관계는 만들 수 없어요: ${formatQuestPreview(cyclicQuestIds, questMap)}`
      };
    }
  }

  return { ok: true, dependencyQuestIds: cleaned };
};

export const normalizeFocusedQuests = (quests: QuestItem[]) => {
  let focusLocked = false;

  return quests.map((quest) => {
    if (!quest.focusPinned) return { ...quest, focusPinned: false };
    if (focusLocked) return { ...quest, focusPinned: false };

    focusLocked = true;
    return { ...quest, focusPinned: true };
  });
};

export const recalcRecord = (record: DailyRecord, finalized = record.isFinalized): DailyRecord => {
  const quests = normalizeFocusedQuests(record.quests);
  const completedCount = quests.filter((quest) => quest.completed).length;
  const totalCount = quests.length;
  const completionRate = getCompletionRate(completedCount, totalCount);
  const counts = getQuestCounts(quests);

  return {
    ...record,
    quests,
    completedCount,
    totalCount,
    completionRate,
    roofType: finalized ? getRoofType(completionRate) : "none",
    isFinalized: finalized,
    completedByType: counts.completedByType,
    totalByType: counts.totalByType
  };
};

export const assertRecordConsistency = (record: DailyRecord) => {
  const expectedCompletedCount = record.quests.filter((quest) => quest.completed).length;
  if (record.completedCount !== expectedCompletedCount) {
    throw new Error(`completedCount mismatch for ${record.date}`);
  }

  if (record.totalCount !== record.quests.length) {
    throw new Error(`totalCount mismatch for ${record.date}`);
  }

  const expectedCompletionRate = getCompletionRate(expectedCompletedCount, record.quests.length);
  if (Math.abs(record.completionRate - expectedCompletionRate) > 1e-9) {
    throw new Error(`completionRate mismatch for ${record.date}`);
  }

  const expectedCounts = getQuestCounts(record.quests);
  if (JSON.stringify(record.completedByType) !== JSON.stringify(expectedCounts.completedByType)) {
    throw new Error(`completedByType mismatch for ${record.date}`);
  }

  if (JSON.stringify(record.totalByType) !== JSON.stringify(expectedCounts.totalByType)) {
    throw new Error(`totalByType mismatch for ${record.date}`);
  }

  const expectedRoofType = record.isFinalized ? getRoofType(expectedCompletionRate) : "none";
  if (record.roofType !== expectedRoofType) {
    throw new Error(`roofType mismatch for ${record.date}`);
  }

  const focusedQuests = record.quests.filter((quest) => quest.focusPinned);
  if (focusedQuests.length > 1) {
    throw new Error(`focusPinned mismatch for ${record.date}`);
  }
};

export const addQuestToRecord = (
  record: DailyRecord,
  {
    title,
    type,
    priority,
    dependencyQuestIds,
    recurrencePattern = "none",
    recurrenceIntervalDays,
    carryOverEnabled = false,
    carryOverLimit
  }: AddQuestInput,
  nowIso = new Date().toISOString()
): RecordMutationResult => {
  if (record.isFinalized) return { ok: false, reason: "이미 마감된 날짜는 수정할 수 없어요." };

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, reason: "퀘스트를 입력해 주세요." };
  if (trimmed.length > MAX_QUEST_TITLE_LENGTH) {
    return { ok: false, reason: `퀘스트는 ${MAX_QUEST_TITLE_LENGTH}자 이하로 입력해 주세요.` };
  }

  const nextTitleKey = getQuestTitleKey({ title: trimmed, type });
  if (record.quests.some((quest) => getQuestTitleKey(quest) === nextTitleKey)) {
    return { ok: false, reason: "같은 타입에 동일한 퀘스트가 이미 있어요." };
  }

  const dependencyValidation = validateDependencySelection({
    ids: dependencyQuestIds,
    availableQuestIds: new Set(record.quests.map((quest) => quest.id))
  });
  if (!dependencyValidation.ok) return dependencyValidation;

  const pattern = normalizeRecurrencePattern(recurrencePattern, false);
  const isRecurring = pattern !== "none";
  const intervalDays = pattern === "interval" ? normalizePositiveInt(recurrenceIntervalDays, 2, 1, 30) : undefined;
  const normalizedCarryOverLimit = carryOverEnabled ? normalizePositiveInt(carryOverLimit, 3, 1, 30) : undefined;

  return {
    ok: true,
    record: recalcRecord(
      {
        ...record,
        quests: [
          ...record.quests,
          {
            id: createQuestownId(),
            title: trimmed,
            type,
            completed: false,
            createdAt: nowIso,
            priority: normalizeQuestPriority(priority, type),
            dependencyQuestIds: dependencyValidation.dependencyQuestIds,
            focusPinned: false,
            isRecurring,
            recurrencePattern: pattern,
            recurrenceKey: isRecurring ? createQuestownId() : undefined,
            recurrenceAnchorDate: isRecurring ? record.date : undefined,
            recurrenceIntervalDays: intervalDays,
            carryOverEnabled,
            carryOverLimit: normalizedCarryOverLimit,
            carryOverCount: carryOverEnabled ? 0 : undefined
          }
        ],
        isFinalized: false,
        roofType: "none"
      },
      false
    )
  };
};

export const updateQuestMetaInRecord = (
  record: DailyRecord,
  questId: string,
  patch: UpdateQuestMetaInput
): RecordMutationResult => {
  if (record.isFinalized) return { ok: false, reason: "마감된 날짜는 수정할 수 없어요." };

  const target = record.quests.find((quest) => quest.id === questId);
  if (!target) return { ok: false, reason: "퀘스트를 찾을 수 없어요." };

  const questMap = new Map(record.quests.map((quest) => [quest.id, quest] as const));
  const hasDependencyPatch = Object.prototype.hasOwnProperty.call(patch, "dependencyQuestIds");
  const dependencyValidation: { ok: true; dependencyQuestIds?: string[] } | { ok: false; reason: string } = hasDependencyPatch
    ? validateDependencySelection({
        ids: patch.dependencyQuestIds,
        availableQuestIds: new Set(questMap.keys()),
        selfId: questId,
        questMap
      })
    : { ok: true, dependencyQuestIds: undefined };
  if (!dependencyValidation.ok) return dependencyValidation;

  const shouldPinTarget = patch.focusPinned === true;

  return {
    ok: true,
    record: recalcRecord(
      {
        ...record,
        quests: record.quests.map((quest) => {
          const nextFocus =
            quest.id === questId
              ? (patch.focusPinned ?? quest.focusPinned)
              : shouldPinTarget
                ? false
                : quest.focusPinned;

          if (quest.id !== questId) {
            return shouldPinTarget && quest.focusPinned !== nextFocus ? { ...quest, focusPinned: nextFocus } : quest;
          }

          return {
            ...quest,
            priority:
              patch.priority !== undefined
                ? normalizeQuestPriority(patch.priority, quest.type)
                : normalizeQuestPriority(quest.priority, quest.type),
            focusPinned: nextFocus,
            dependencyQuestIds: hasDependencyPatch ? dependencyValidation.dependencyQuestIds : quest.dependencyQuestIds
          };
        }),
        isFinalized: false,
        roofType: "none"
      },
      false
    )
  };
};

export const setFocusQuestInRecord = (record: DailyRecord, questId: string): RecordMutationResult =>
  updateQuestMetaInRecord(record, questId, { focusPinned: true });

export const clearFocusQuestInRecord = (record: DailyRecord): RecordMutationResult => {
  if (record.isFinalized) return { ok: false, reason: "마감된 날짜는 대표 퀘스트를 바꿀 수 없어요." };

  return {
    ok: true,
    record: recalcRecord(
      {
        ...record,
        quests: record.quests.map((quest) => (quest.focusPinned ? { ...quest, focusPinned: false } : quest)),
        isFinalized: false,
        roofType: "none"
      },
      false
    )
  };
};

export const toggleQuestInRecord = (
  record: DailyRecord,
  questId: string,
  nowIso = new Date().toISOString()
): RecordMutationResult => {
  if (record.isFinalized) return { ok: false, reason: "마감된 날짜는 체크 변경이 불가해요." };

  const questMap = new Map(record.quests.map((quest) => [quest.id, quest] as const));
  const target = questMap.get(questId);
  if (!target) return { ok: false, reason: "퀘스트를 찾을 수 없어요." };

  if (!target.completed) {
    const blockedByIds = getBlockedDependencyIds(target, questMap);
    if (blockedByIds.length > 0) {
      const blocker = questMap.get(blockedByIds[0]);
      return { ok: false, reason: `선행 Quest를 먼저 완료하세요: ${blocker?.title ?? blockedByIds[0]}` };
    }
  }

  if (target.completed) {
    const completedDependentIds = getCompletedDependentIds(questId, questMap);
    if (completedDependentIds.length > 0) {
      const titles = completedDependentIds
        .map((id) => questMap.get(id)?.title)
        .filter((title): title is string => Boolean(title));
      const preview = titles.slice(0, 2).join(", ");
      const suffix = titles.length > 2 ? ` 외 ${titles.length - 2}개` : "";
      return { ok: false, reason: `후행 Quest를 먼저 되돌리세요: ${preview}${suffix}` };
    }
  }

  return {
    ok: true,
    record: recalcRecord(
      {
        ...record,
        quests: record.quests.map((quest) =>
          quest.id === questId
            ? {
                ...quest,
                completed: !quest.completed,
                completedAt: !quest.completed ? nowIso : undefined
              }
            : quest
        ),
        isFinalized: false,
        roofType: "none"
      },
      false
    )
  };
};

export const deleteQuestFromRecord = (record: DailyRecord, questId: string): RecordMutationResult => {
  if (record.isFinalized) return { ok: false, reason: "마감된 날짜는 삭제할 수 없어요." };
  if (!record.quests.some((quest) => quest.id === questId)) {
    return { ok: false, reason: "퀘스트를 찾을 수 없어요." };
  }

  const dependentTitles = record.quests
    .filter((quest) => (quest.dependencyQuestIds ?? []).includes(questId))
    .map((quest) => quest.title);

  if (dependentTitles.length > 0) {
    const preview = dependentTitles.slice(0, 2).join(", ");
    const suffix = dependentTitles.length > 2 ? ` 외 ${dependentTitles.length - 2}개` : "";
    return { ok: false, reason: `후행 Quest를 먼저 정리하세요: ${preview}${suffix}` };
  }

  return {
    ok: true,
    record: recalcRecord(
      {
        ...record,
        quests: record.quests.filter((quest) => quest.id !== questId),
        isFinalized: false,
        roofType: "none"
      },
      false
    )
  };
};

export const finalizeRecord = (record: DailyRecord) => recalcRecord(record, true);

export const unfinalizeRecord = (record: DailyRecord) =>
  recalcRecord(
    {
      ...record,
      isFinalized: false,
      roofType: "none"
    },
    false
  );
