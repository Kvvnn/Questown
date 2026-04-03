import { dateKeyToDate, dateKeyToStartOfDayISOString, ensureDailyRecord, isDateKey, isMonthKey, toDateKey, toMonthKey } from "@/domain/date";
import { createQuestownId } from "@/domain/id";
import { normalizeRecurrencePattern } from "@/domain/recurrence";
import { recalcRecord } from "@/domain/record-ops";
import {
  AiSuggestion,
  DailyBuilding,
  ReviewSummary,
  Routine,
  RoutineBackupState,
  RoutineMigrationMeta,
  RoutineStep,
  RoutineTrigger,
  RoutineSession,
  SessionStepResult
} from "@/domain/game-types";
import { rebuildSessionAggregates } from "@/domain/session-aggregates";
import { DailyRecord, QuestItem, QuestPriority, QuestType, RecurrencePattern } from "@/domain/types";
import { validateBackupImportSchema } from "@/store/backup-schema";
import { normalizeImportedRecordState } from "@/store/record-normalization";

const LEGACY_IMPORT_RECOVERY_NOTICE = "가져온 legacy 기록 일부를 자동 복구했어요.";

interface LegacyQuestLike {
  id?: string;
  text?: string;
  title?: string;
  type?: string;
  completed?: boolean;
  createdAt?: string;
  completedAt?: string;
  priority?: string;
  dependencyQuestIds?: string[];
  focusPinned?: boolean;
  isRecurring?: boolean;
  recurrenceKey?: string;
  recurrencePattern?: string;
  recurrenceIntervalDays?: number;
  recurrenceAnchorDate?: string;
  carryOverEnabled?: boolean;
  carryOverLimit?: number;
  carryOverCount?: number;
  carryOverSourceQuestId?: string;
}

interface LegacyRecordLike {
  date?: string;
  quests?: LegacyQuestLike[];
  todos?: LegacyQuestLike[];
  isFinalized?: boolean;
  roofType?: DailyRecord["roofType"];
}

interface LegacyInputState {
  currentDateKey?: unknown;
  selectedMonth?: unknown;
  dailyGoal?: unknown;
  weeklyMainTarget?: unknown;
  recordsByDate?: unknown;
}

interface LegacyNormalizedInput {
  sourceKind: RoutineMigrationMeta["sourceKind"];
  sourceFingerprint: string;
  exportedAt: string;
  currentDateKey: string;
  selectedMonth: string;
  recordsByDate: Record<string, DailyRecord>;
  invalidDateKeyCount: number;
  repairedRecordCount: number;
  completedQuestCount: number;
  unmappedQuestCount: number;
  unmappedQuestTitles: string[];
}

export interface LegacyRoutineImportResult {
  exportedAt: string;
  sourceFingerprint: string;
  sourceKind: RoutineMigrationMeta["sourceKind"];
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  sessionsById: Record<string, RoutineSession>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  reviewSummariesById: Record<string, ReviewSummary>;
  migrationMeta: RoutineMigrationMeta;
  dateCount: number;
  earliestDate?: string;
  latestDate?: string;
  hasRepairWarning: boolean;
  repairSummary?: string;
  unmappedLegacyQuestCount: number;
  unmappedLegacyQuestTitles: string[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : fallback;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
};

const normalizeNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeTimestamp = (value: unknown, fallback: string) => {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) return fallback;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
};

const normalizePositiveInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const normalizeQuestType = (value: unknown): QuestType => (value === "daily" || value === "main" || value === "sub" ? value : "daily");

const normalizeQuestId = (value: unknown, usedIds: Set<string>) => {
  let nextId = normalizeNonEmptyString(value) ?? createQuestownId();

  while (usedIds.has(nextId)) {
    nextId = createQuestownId();
  }

  usedIds.add(nextId);
  return nextId;
};

const normalizeRecurringKey = (value: unknown, fallback: string, usedKeys: Set<string>) => {
  let nextKey = normalizeNonEmptyString(value) ?? fallback;

  while (usedKeys.has(nextKey)) {
    nextKey = createQuestownId();
  }

  usedKeys.add(nextKey);
  return nextKey;
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

const sanitizeDependencyIds = (ids: unknown, availableQuestIds: Set<string>, selfId?: string) => {
  const cleaned = normalizeDependencyIds(ids, selfId)?.filter((value) => availableQuestIds.has(value));
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
};

const normalizeQuest = (
  raw: unknown,
  dateKey: string,
  usedQuestIds: Set<string>,
  usedRecurringKeys: Set<string>
): QuestItem | null => {
  if (!raw || typeof raw !== "object") return null;

  const legacyQuest = raw as LegacyQuestLike;
  const title = normalizeNonEmptyString(legacyQuest.title) ?? normalizeNonEmptyString(legacyQuest.text);
  if (!title) return null;

  const completed = normalizeBoolean(legacyQuest.completed);
  const type = normalizeQuestType(legacyQuest.type);
  const pattern = normalizeRecurrencePattern(
    legacyQuest.recurrencePattern as RecurrencePattern | undefined,
    normalizeBoolean(legacyQuest.isRecurring)
  );
  const isRecurring = pattern !== "none";
  const recurrenceIntervalDays =
    pattern === "interval" ? normalizePositiveInt(legacyQuest.recurrenceIntervalDays, 2, 1, 30) : undefined;

  const carryOverEnabled = normalizeBoolean(legacyQuest.carryOverEnabled);
  const carryOverLimit = carryOverEnabled ? normalizePositiveInt(legacyQuest.carryOverLimit, 3, 1, 30) : undefined;
  const id = normalizeQuestId(legacyQuest.id, usedQuestIds);
  const fallbackCreatedAt = dateKeyToDate(dateKey).toISOString();
  const createdAt = normalizeTimestamp(legacyQuest.createdAt, fallbackCreatedAt);
  const completedAt = completed ? normalizeTimestamp(legacyQuest.completedAt, createdAt) : undefined;
  const recurrenceKey =
    isRecurring
      ? normalizeRecurringKey(legacyQuest.recurrenceKey, id, usedRecurringKeys)
      : normalizeNonEmptyString(legacyQuest.recurrenceKey);

  return {
    id,
    title,
    type,
    completed,
    createdAt,
    completedAt,
    priority: legacyQuest.priority === "p1" || legacyQuest.priority === "p2" || legacyQuest.priority === "p3"
      ? (legacyQuest.priority as QuestPriority)
      : undefined,
    focusPinned: normalizeBoolean(legacyQuest.focusPinned),
    dependencyQuestIds: normalizeDependencyIds(legacyQuest.dependencyQuestIds, id),
    isRecurring,
    recurrencePattern: pattern,
    recurrenceKey: isRecurring ? recurrenceKey : undefined,
    recurrenceAnchorDate: isRecurring
      ? (isDateKey(legacyQuest.recurrenceAnchorDate) ? legacyQuest.recurrenceAnchorDate : dateKey)
      : undefined,
    recurrenceIntervalDays,
    carryOverEnabled,
    carryOverLimit,
    carryOverCount: carryOverEnabled ? normalizePositiveInt(legacyQuest.carryOverCount, 0, 0, 365) : undefined,
    carryOverSourceQuestId: carryOverEnabled ? normalizeNonEmptyString(legacyQuest.carryOverSourceQuestId) : undefined
  };
};

const normalizeRecord = (dateKey: string, raw?: LegacyRecordLike): { record: DailyRecord; recovered: boolean; unmappedTitles: string[] } => {
  const base = ensureDailyRecord(dateKey);
  if (!raw) return { record: base, recovered: false, unmappedTitles: [] };

  const source = Array.isArray(raw.quests) ? raw.quests : Array.isArray(raw.todos) ? raw.todos : [];
  const usedQuestIds = new Set<string>();
  const usedRecurringKeys = new Set<string>();
  const initial = source
    .map((quest) => normalizeQuest(quest, dateKey, usedQuestIds, usedRecurringKeys))
    .filter((quest): quest is QuestItem => Boolean(quest));
  const ids = new Set(initial.map((quest) => quest.id));
  const normalizedState = normalizeImportedRecordState(
    dateKey,
    initial.map((quest) => ({
      ...quest,
      dependencyQuestIds: sanitizeDependencyIds(quest.dependencyQuestIds, ids, quest.id)
    }))
  );

  const nextRecord = recalcRecord(
    {
      ...base,
      ...normalizedState,
      isFinalized: normalizeBoolean(raw.isFinalized)
    },
    normalizeBoolean(raw.isFinalized)
  );
  const record =
    raw.roofType === "low" || raw.roofType === "mid" || raw.roofType === "high"
      ? {
          ...nextRecord,
          roofType: raw.roofType
        }
      : nextRecord;

  return {
    record,
    recovered: source.length !== initial.length,
    unmappedTitles: record.quests.filter((quest) => !quest.completed).map((quest) => quest.title)
  };
};

const normalizeRecordsByDate = (recordsByDate?: Record<string, LegacyRecordLike>) => {
  const normalized: Record<string, DailyRecord> = {};
  let invalidDateKeyCount = 0;
  let repairedRecordCount = 0;
  const unmappedQuestTitles: string[] = [];

  Object.entries(recordsByDate ?? {}).forEach(([key, value]) => {
    if (!isDateKey(key)) {
      invalidDateKeyCount += 1;
      return;
    }

    const normalizedRecord = normalizeRecord(key, value);
    normalized[key] = normalizedRecord.record;
    if (normalizedRecord.recovered) repairedRecordCount += 1;
    unmappedQuestTitles.push(...normalizedRecord.unmappedTitles);
  });

  return {
    recordsByDate: normalized,
    invalidDateKeyCount,
    repairedRecordCount,
    unmappedQuestTitles
  };
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return Math.abs(hash >>> 0).toString(36);
};

const buildSourceFingerprint = (value: string) => `migration-${hashString(value)}`;

const getLegacyStateFromPersisted = (value: unknown): LegacyInputState | null => {
  if (!isPlainObject(value)) return null;
  if (isPlainObject(value.state)) return value.state as LegacyInputState;
  return value as LegacyInputState;
};

const normalizeLegacyInput = ({
  sourceKind,
  rawData,
  now = new Date()
}: {
  sourceKind: RoutineMigrationMeta["sourceKind"];
  rawData: string | unknown;
  now?: Date;
}): { ok: true; data: LegacyNormalizedInput } | { ok: false; reason: string } => {
  if (sourceKind === "legacy_backup") {
    const validation = validateBackupImportSchema(rawData);
    if (!validation.ok) return validation;

    const normalizedRecords = normalizeRecordsByDate(validation.data.state.recordsByDate as Record<string, LegacyRecordLike>);
    const currentDateKey = isDateKey(validation.data.state.currentDateKey) ? validation.data.state.currentDateKey : toDateKey(now);
    const selectedMonth = isMonthKey(validation.data.state.selectedMonth) ? validation.data.state.selectedMonth : toMonthKey(now);
    const fingerprint = buildSourceFingerprint(JSON.stringify(rawData));
    const completedQuestCount = Object.values(normalizedRecords.recordsByDate).reduce((sum, record) => sum + record.completedCount, 0);

    return {
      ok: true,
      data: {
        sourceKind,
        sourceFingerprint: fingerprint,
        exportedAt: validation.data.exportedAt,
        currentDateKey,
        selectedMonth,
        recordsByDate: normalizedRecords.recordsByDate,
        invalidDateKeyCount: normalizedRecords.invalidDateKeyCount,
        repairedRecordCount: normalizedRecords.repairedRecordCount,
        completedQuestCount,
        unmappedQuestCount: normalizedRecords.unmappedQuestTitles.length,
        unmappedQuestTitles: Array.from(new Set(normalizedRecords.unmappedQuestTitles)).slice(0, 6)
      }
    };
  }

  const rawString = typeof rawData === "string" ? rawData : JSON.stringify(rawData);
  let parsed: unknown;
  try {
    parsed = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
  } catch {
    return { ok: false, reason: "legacy 로컬 저장 데이터를 읽을 수 없어요." };
  }

  const state = getLegacyStateFromPersisted(parsed);
  if (!state || !isPlainObject(state.recordsByDate)) {
    return { ok: false, reason: "legacy 로컬 저장 데이터 형식이 올바르지 않아요." };
  }

  const normalizedRecords = normalizeRecordsByDate(state.recordsByDate as Record<string, LegacyRecordLike>);
  const currentDateKey = isDateKey(state.currentDateKey) ? state.currentDateKey : toDateKey(now);
  const selectedMonth = isMonthKey(state.selectedMonth) ? state.selectedMonth : toMonthKey(now);
  const completedQuestCount = Object.values(normalizedRecords.recordsByDate).reduce((sum, record) => sum + record.completedCount, 0);

  return {
    ok: true,
    data: {
      sourceKind,
      sourceFingerprint: buildSourceFingerprint(rawString),
      exportedAt: now.toISOString(),
      currentDateKey,
      selectedMonth,
      recordsByDate: normalizedRecords.recordsByDate,
      invalidDateKeyCount: normalizedRecords.invalidDateKeyCount,
      repairedRecordCount: normalizedRecords.repairedRecordCount,
      completedQuestCount,
      unmappedQuestCount: normalizedRecords.unmappedQuestTitles.length,
      unmappedQuestTitles: Array.from(new Set(normalizedRecords.unmappedQuestTitles)).slice(0, 6)
    }
  };
};

const getStableLegacyQuestKey = (quest: QuestItem) =>
  quest.isRecurring && quest.recurrenceKey
    ? `recurring-${quest.recurrenceKey}`
    : `quest-${hashString(`${quest.type}:${quest.title.trim().toLocaleLowerCase("ko-KR")}`)}`;

const buildLegacyRoutine = (stableKey: string, quest: QuestItem): Routine => ({
  id: `legacy-routine-${stableKey}`,
  name: `Legacy · ${quest.title}`,
  category: "custom",
  sessionRole: "standard",
  estimatedDurationSec: 60,
  themeKey: `legacy-${quest.type}`,
  difficulty: quest.type === "main" ? 2 : 1,
  successProfile: "gentle",
  isEnabled: false,
  createdAt: quest.createdAt,
  updatedAt: quest.completedAt ?? quest.createdAt
});

const buildLegacyStep = (stableKey: string, quest: QuestItem): RoutineStep => ({
  id: `legacy-step-${stableKey}`,
  routineId: `legacy-routine-${stableKey}`,
  title: quest.title,
  order: 0,
  recommendedDurationSec: 60,
  minimumCompletion: "complete",
  difficulty: quest.type === "main" ? 2 : 1,
  tags: ["legacy_import", quest.type],
  completionFxKey: `legacy:${quest.type}`,
  isOptional: false
});

const getLegacyGrade = (quest: QuestItem): RoutineSession["resultGrade"] => (quest.type === "main" || quest.focusPinned ? "Great" : "Clear");

const getLegacyNormalizedScore = (grade: RoutineSession["resultGrade"]) => (grade === "Great" ? 0.78 : 0.55);

const getLegacyTotalScore = (grade: RoutineSession["resultGrade"]) => (grade === "Great" ? 340 : 250);

const legacyReviewHeadline: Record<DailyRecord["roofType"], string> = {
  none: "Legacy 기록을 옮기는 중입니다.",
  low: "기초 지붕까지 이어진 legacy 하루예요.",
  mid: "안정적인 legacy 하루를 옮겼습니다.",
  high: "단단하게 닫힌 legacy 하루를 옮겼습니다."
};

const getLegacyFinalizedAt = (record: DailyRecord) => {
  const latestCompletedAt = record.quests
    .filter((quest) => quest.completed && quest.completedAt)
    .map((quest) => quest.completedAt as string)
    .sort((left, right) => left.localeCompare(right, "en"))
    .at(-1);

  return latestCompletedAt ?? dateKeyToStartOfDayISOString(record.date);
};

export const buildLegacyRoutineImport = ({
  sourceKind,
  rawData,
  now = new Date()
}: {
  sourceKind: RoutineMigrationMeta["sourceKind"];
  rawData: string | unknown;
  now?: Date;
}): { ok: true; result: LegacyRoutineImportResult } | { ok: false; reason: string } => {
  const normalized = normalizeLegacyInput({ sourceKind, rawData, now });
  if (!normalized.ok) return normalized;

  const routinesById: Record<string, Routine> = {};
  const stepsByRoutineId: Record<string, RoutineStep[]> = {};
  const triggersByRoutineId: Record<string, RoutineTrigger[]> = {};
  const sessionsById: Record<string, RoutineSession> = {};
  const stepResultsBySessionId: Record<string, SessionStepResult[]> = {};
  const occurrenceCountByDateAndKey: Record<string, number> = {};

  Object.values(normalized.data.recordsByDate)
    .sort((left, right) => left.date.localeCompare(right.date, "en"))
    .forEach((record) => {
      record.quests
        .filter((quest) => quest.completed)
        .forEach((quest) => {
          const stableKey = getStableLegacyQuestKey(quest);
          const routineId = `legacy-routine-${stableKey}`;
          if (!routinesById[routineId]) {
            routinesById[routineId] = buildLegacyRoutine(stableKey, quest);
            stepsByRoutineId[routineId] = [buildLegacyStep(stableKey, quest)];
            triggersByRoutineId[routineId] = [];
          }

          const occurrenceKey = `${record.date}:${stableKey}`;
          const occurrenceIndex = occurrenceCountByDateAndKey[occurrenceKey] ?? 0;
          occurrenceCountByDateAndKey[occurrenceKey] = occurrenceIndex + 1;
          const sessionId = `legacy-session-${record.date}-${stableKey}-${occurrenceIndex + 1}`;
          const stepId = stepsByRoutineId[routineId][0].id;
          const startedAt = quest.createdAt;
          const endedAt = quest.completedAt ?? quest.createdAt;
          const resultGrade = getLegacyGrade(quest);
          const totalScore = getLegacyTotalScore(resultGrade);

          sessionsById[sessionId] = {
            id: sessionId,
            routineId,
            dateKey: record.date,
            startedAt,
            endedAt,
            triggerSource: "manual",
            status: "reviewed",
            resultGrade,
            baseScore: 100,
            timeBonus: 0,
            comboBonus: 0,
            clearBonus: 150,
            cleanRunBonus: 0,
            firstSessionBonus: 0,
            focusBonus: 0,
            streakBonus: 0,
            totalScore,
            normalizedScore: getLegacyNormalizedScore(resultGrade),
            completedStepCount: 1,
            skippedStepCount: 0,
            pausedCount: 0,
            wasGraceApplied: false
          };
          stepResultsBySessionId[sessionId] = [
            {
              id: `legacy-step-result-${record.date}-${stableKey}-${occurrenceIndex + 1}`,
              sessionId,
              stepId,
              order: 0,
              status: "success",
              startedAt,
              endedAt,
              elapsedSec: 60,
              targetDurationSec: 60,
              overtimeSec: 0,
              pauseCount: 0,
              comboIndexAfterStep: 1,
              scoreEarned: totalScore
            }
          ];
        });
    });

  const rebuilt = rebuildSessionAggregates({
    sessionsById,
    routinesById
  });
  const dailyBuildingsByDate = { ...rebuilt.dailyBuildingsByDate };
  const reviewSummariesById: Record<string, ReviewSummary> = {};

  Object.values(normalized.data.recordsByDate)
    .filter((record) => record.isFinalized && dailyBuildingsByDate[record.date])
    .forEach((record) => {
      const reviewSummaryId = `legacy-review-${record.date}`;
      const finalizedAt = getLegacyFinalizedAt(record);
      const stableRoutines = Array.from(new Set(record.quests.filter((quest) => quest.completed).map((quest) => quest.title)));
      const frictionPoints = Array.from(new Set(record.quests.filter((quest) => !quest.completed).map((quest) => quest.title)));

      dailyBuildingsByDate[record.date] = {
        ...dailyBuildingsByDate[record.date],
        roofType: record.roofType,
        reviewSummaryId,
        finalizedAt
      };
      reviewSummariesById[reviewSummaryId] = {
        id: reviewSummaryId,
        dateKey: record.date,
        generatedAt: finalizedAt,
        headline: legacyReviewHeadline[record.roofType],
        body: `완료 ${record.completedCount}개, 미완료 ${Math.max(0, record.totalCount - record.completedCount)}개 legacy quest를 새 routine 기록으로 옮겼습니다.`,
        stableRoutines,
        frictionPoints,
        tomorrowHints: [],
        source: "fallback"
      };
    });

  const importedDateKeys = Array.from(
    new Set([
      ...Object.keys(dailyBuildingsByDate),
      ...Object.values(sessionsById).map((session) => session.dateKey)
    ])
  ).sort((left, right) => left.localeCompare(right, "en"));
  const warningCount = normalized.data.invalidDateKeyCount + normalized.data.repairedRecordCount + (normalized.data.unmappedQuestCount > 0 ? 1 : 0);
  const migrationMeta: RoutineMigrationMeta = {
    sourceKind: normalized.data.sourceKind,
    sourceFingerprint: normalized.data.sourceFingerprint,
    importedAt: now.toISOString(),
    importedDateCount: importedDateKeys.length,
    importedCompletedQuestCount: normalized.data.completedQuestCount,
    unmappedQuestCount: normalized.data.unmappedQuestCount,
    warningCount,
    latestExportedAt: normalized.data.exportedAt
  };

  return {
    ok: true,
    result: {
      exportedAt: normalized.data.exportedAt,
      sourceFingerprint: normalized.data.sourceFingerprint,
      sourceKind: normalized.data.sourceKind,
      routinesById,
      stepsByRoutineId,
      triggersByRoutineId,
      sessionsById,
      stepResultsBySessionId,
      dailyBuildingsByDate,
      reviewSummariesById,
      migrationMeta,
      dateCount: importedDateKeys.length,
      earliestDate: importedDateKeys[0],
      latestDate: importedDateKeys[importedDateKeys.length - 1],
      hasRepairWarning: warningCount > 0,
      repairSummary: warningCount > 0 ? LEGACY_IMPORT_RECOVERY_NOTICE : undefined,
      unmappedLegacyQuestCount: normalized.data.unmappedQuestCount,
      unmappedLegacyQuestTitles: normalized.data.unmappedQuestTitles
    }
  };
};

export const mergeLegacyImportIntoRoutineBackupState = ({
  baseState,
  importResult
}: {
  baseState: RoutineBackupState;
  importResult: LegacyRoutineImportResult;
}): RoutineBackupState => ({
  ...baseState,
  routinesById: {
    ...baseState.routinesById,
    ...importResult.routinesById
  },
  stepsByRoutineId: {
    ...baseState.stepsByRoutineId,
    ...importResult.stepsByRoutineId
  },
  triggersByRoutineId: {
    ...baseState.triggersByRoutineId,
    ...importResult.triggersByRoutineId
  },
  sessionsById: {
    ...baseState.sessionsById,
    ...importResult.sessionsById
  },
  stepResultsBySessionId: {
    ...baseState.stepResultsBySessionId,
    ...importResult.stepResultsBySessionId
  },
  dailyBuildingsByDate: {
    ...baseState.dailyBuildingsByDate,
    ...importResult.dailyBuildingsByDate
  },
  reviewSummariesById: {
    ...baseState.reviewSummariesById,
    ...importResult.reviewSummariesById
  },
  migrationMetaBySourceFingerprint: {
    ...baseState.migrationMetaBySourceFingerprint,
    [importResult.migrationMeta.sourceFingerprint]: importResult.migrationMeta
  }
});

export const markResolvedSuggestion = (suggestion: AiSuggestion, resolvedAt: string, status: AiSuggestion["status"]): AiSuggestion => ({
  ...suggestion,
  status,
  resolvedAt
});
