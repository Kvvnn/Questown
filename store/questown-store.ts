"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { addDays, addMonths, dateKeyToDate, ensureDailyRecord, isDateKey, isMonthKey, toDateKey, toMonthKey } from "@/domain/date";
import { createQuestownId } from "@/domain/id";
import {
  addQuestToRecord,
  assertRecordConsistency,
  clearFocusQuestInRecord,
  deleteQuestFromRecord,
  finalizeRecord,
  recalcRecord,
  setFocusQuestInRecord,
  toggleQuestInRecord,
  unfinalizeRecord,
  updateQuestMetaInRecord
} from "@/domain/record-ops";
import { prepareNextDayRecord, syncStateToToday } from "@/domain/rollover";
import {
  getMonthKeyFromDateKey,
  getPreferredTownSelection,
  getRecordForDate,
  getTodayBuildingHeight,
  getTodayRecord
} from "@/domain/selectors";
import { normalizeRecurrencePattern } from "@/domain/recurrence";
import {
  AppBackupData,
  BackupImportPreview,
  DailyRecord,
  QuestItem,
  QuestPriority,
  QuestType,
  RecurrencePattern,
  StorageHealth,
  TabType
} from "@/domain/types";
import { validateBackupImportSchema } from "@/store/backup-schema";
import { createSafeBrowserStorage } from "@/store/browser-storage";
import { normalizeImportedRecordState } from "@/store/record-normalization";

const isDevEnvironment = process.env.NODE_ENV !== "production";
const STORAGE_NAME = "questown-mvp-storage";
const STORAGE_VERSION = 6;
const HYDRATION_RECOVERY_NOTICE = "저장된 앱 데이터를 읽는 중 문제가 있어 안전한 상태로 복구했어요.";
const NORMALIZATION_RECOVERY_NOTICE = "저장된 기록 일부를 자동 복구했어요.";
const IMPORT_RECOVERY_NOTICE = "가져온 기록 일부를 자동 복구했어요.";
const STORAGE_DEGRADED_NOTICE = "브라우저 저장소 접근에 문제가 있어 일부 변경이 저장되지 않을 수 있어요.";
const browserStorage = createSafeBrowserStorage();
let hydrationRecoverySetter: ((patch: Partial<QuestownDataState>) => void) | undefined;
let storageHealthSetter: ((health: StorageHealth) => void) | undefined;

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

interface UpdateQuestMetaInput {
  priority?: QuestPriority;
  dependencyQuestIds?: string[];
  focusPinned?: boolean;
}

type QuestownDataState = {
  currentTab: TabType;
  currentDateKey: string;
  selectedMonth: string;
  dailyGoal: number;
  weeklyMainTarget: number;
  recordsByDate: Record<string, DailyRecord>;
  selectedDateInTown?: string;
  recoveryNotice?: string;
  storageNotice?: string;
  storageHealth: StorageHealth;
};

interface QuestownState extends QuestownDataState {
  setTab: (tab: TabType) => void;
  clearRecoveryNotice: () => void;
  clearStorageNotice: () => void;
  setDailyGoal: (goal: number) => void;
  setWeeklyMainTarget: (target: number) => void;
  addQuest: (input: AddQuestInput) => { ok: boolean; reason?: string };
  updateQuestMeta: (questId: string, patch: UpdateQuestMetaInput) => { ok: boolean; reason?: string };
  setFocusQuest: (questId: string) => { ok: boolean; reason?: string };
  clearFocusQuest: () => { ok: boolean; reason?: string };
  toggleQuest: (questId: string) => { ok: boolean; reason?: string };
  deleteQuest: (questId: string) => { ok: boolean; reason?: string };
  finalizeCurrentDay: () => void;
  unfinalizeCurrentDay: () => void;
  goNextDayForDev: () => void;
  moveMonth: (delta: number) => void;
  selectDateInTown: (date: string) => void;
  hydrateToday: () => void;
  rolloverToToday: () => void;
  exportBackup: () => AppBackupData;
  previewBackupImport: (data: unknown) => { ok: true; preview: BackupImportPreview } | { ok: false; reason: string };
  applyBackupImport: (preview: BackupImportPreview) => { ok: boolean; reason?: string };
  importBackup: (data: unknown) => { ok: boolean; reason?: string };
}

const createInitialDataState = (): QuestownDataState => ({
  currentTab: "today",
  currentDateKey: toDateKey(),
  selectedMonth: toMonthKey(),
  dailyGoal: 3,
  weeklyMainTarget: 10,
  recordsByDate: {},
  selectedDateInTown: undefined,
  recoveryNotice: undefined,
  storageNotice: browserStorage.getHealth().degraded ? STORAGE_DEGRADED_NOTICE : undefined,
  storageHealth: browserStorage.getHealth()
});

const isQuestType = (value: unknown): value is QuestType => value === "daily" || value === "main" || value === "sub";
const isTabType = (value: unknown): value is TabType => value === "today" || value === "town" || value === "manage";

const normalizeQuestType = (value: unknown): QuestType => (isQuestType(value) ? value : "daily");
const normalizeTabType = (value: unknown): TabType => (isTabType(value) ? value : "today");

const normalizePositiveInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const normalizeBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return fallback;
  }

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

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeTimestamp = (value: unknown, fallback: string) => {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) return fallback;

  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
};

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

const getRecoveryNotice = (preferred: string | undefined, fallback: string) => preferred ?? fallback;

const repairRecordConsistency = (
  record: DailyRecord,
  fallbackNotice: string
): { record: DailyRecord; recoveryNotice?: string } => {
  try {
    assertRecordConsistency(record);
    return { record };
  } catch (error) {
    if (isDevEnvironment) throw error;

    const repairedRecord = recalcRecord(record, record.isFinalized);
    try {
      assertRecordConsistency(repairedRecord);
      return {
        record: repairedRecord,
        recoveryNotice: fallbackNotice
      };
    } catch {
      const resetRecord = ensureDailyRecord(record.date);
      return {
        record: resetRecord,
        recoveryNotice: HYDRATION_RECOVERY_NOTICE
      };
    }
  }
};

const normalizeQuest = (
  raw: unknown,
  dateKey: string,
  usedQuestIds: Set<string>,
  availableQuestIds?: Set<string>,
  usedRecurringKeys?: Set<string>
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
    isRecurring && usedRecurringKeys
      ? normalizeRecurringKey(legacyQuest.recurrenceKey, id, usedRecurringKeys)
      : normalizeNonEmptyString(legacyQuest.recurrenceKey) ?? id;

  return {
    id,
    title,
    type,
    completed,
    createdAt,
    completedAt,
    priority: legacyQuest.priority === "p1" || legacyQuest.priority === "p2" || legacyQuest.priority === "p3" ? legacyQuest.priority : undefined,
    focusPinned: normalizeBoolean(legacyQuest.focusPinned),
    dependencyQuestIds: availableQuestIds
      ? sanitizeDependencyIds(legacyQuest.dependencyQuestIds, availableQuestIds, id)
      : normalizeDependencyIds(legacyQuest.dependencyQuestIds, id),
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

const normalizeRecord = (dateKey: string, raw?: LegacyRecordLike): { record: DailyRecord; recovered: boolean } => {
  const base = ensureDailyRecord(dateKey);
  if (!raw) return { record: base, recovered: false };

  const source = Array.isArray(raw.quests) ? raw.quests : Array.isArray(raw.todos) ? raw.todos : [];
  const usedQuestIds = new Set<string>();
  const usedRecurringKeys = new Set<string>();

  const initial = source
    .map((quest) => normalizeQuest(quest, dateKey, usedQuestIds, undefined, usedRecurringKeys))
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

  const repaired = repairRecordConsistency(nextRecord, NORMALIZATION_RECOVERY_NOTICE);

  return {
    record: repaired.record,
    recovered: Boolean(repaired.recoveryNotice)
  };
};

const normalizeRecordsByDate = (recordsByDate?: Record<string, LegacyRecordLike>) => {
  const normalized: Record<string, DailyRecord> = {};
  let invalidDateKeyCount = 0;
  let recovered = false;

  Object.entries(recordsByDate ?? {}).forEach(([key, value]) => {
    if (!isDateKey(key)) {
      invalidDateKeyCount += 1;
      return;
    }

    const normalizedRecord = normalizeRecord(key, value);
    normalized[key] = normalizedRecord.record;
    if (normalizedRecord.recovered) recovered = true;
  });

  return {
    recordsByDate: normalized,
    invalidDateKeyCount,
    recovered
  };
};

const sameStorageHealth = (left: StorageHealth, right: StorageHealth) =>
  left.readable === right.readable &&
  left.writable === right.writable &&
  left.degraded === right.degraded &&
  left.lastError === right.lastError;

const buildBackupImportPreview = (
  currentState: QuestownDataState,
  data: unknown
): { ok: true; preview: BackupImportPreview } | { ok: false; reason: string } => {
  const validation = validateBackupImportSchema(data);
  if (!validation.ok) {
    return validation;
  }

  const { version, exportedAt, state } = validation.data;
  const rawRecords = state.recordsByDate as Record<string, LegacyRecordLike>;
  const nextDate = isDateKey(state.currentDateKey) ? state.currentDateKey : toDateKey();
  const normalizedRecords = normalizeRecordsByDate(rawRecords);

  if (Object.keys(rawRecords).length > 0 && Object.keys(normalizedRecords.recordsByDate).length === 0) {
    return { ok: false, reason: "백업 데이터의 날짜 기록 형식이 올바르지 않아요." };
  }

  const synced = syncStateToToday(normalizedRecords.recordsByDate, nextDate);
  const preferredTown = getPreferredTownSelection(state.selectedMonth, synced.currentDateKey, undefined, synced.recordsByDate);
  const incomingDates = Object.keys(synced.recordsByDate).sort();
  const overwriteDateCount = incomingDates.filter((dateKey) => Boolean(currentState.recordsByDate[dateKey])).length;
  const newDateCount = incomingDates.length - overwriteDateCount;
  const hasRepairWarning =
    normalizedRecords.recovered ||
    normalizedRecords.invalidDateKeyCount > 0 ||
    !isDateKey(state.currentDateKey) ||
    !isMonthKey(state.selectedMonth);

  return {
    ok: true,
    preview: {
      version,
      exportedAt,
      dateCount: incomingDates.length,
      earliestDate: incomingDates[0],
      latestDate: incomingDates[incomingDates.length - 1],
      overwriteDateCount,
      newDateCount,
      hasRepairWarning,
      repairSummary: hasRepairWarning ? IMPORT_RECOVERY_NOTICE : undefined,
      state: {
        currentDateKey: synced.currentDateKey,
        selectedMonth: preferredTown.monthKey,
        dailyGoal: normalizePositiveInt(state.dailyGoal, 3, 1, 10),
        weeklyMainTarget: normalizePositiveInt(state.weeklyMainTarget, 10, 1, 50),
        recordsByDate: synced.recordsByDate,
        selectedDateInTown: preferredTown.dateKey,
        recoveryNotice: hasRepairWarning ? IMPORT_RECOVERY_NOTICE : undefined
      }
    }
  };
};

const normalizeHydratedState = (persistedState: unknown): QuestownDataState => {
  const fallback = createInitialDataState();
  if (!isRecordObject(persistedState)) {
    return {
      ...fallback,
      recoveryNotice: HYDRATION_RECOVERY_NOTICE
    };
  }

  let recovered = Boolean(normalizeNonEmptyString(persistedState.recoveryNotice));
  const currentDateKey = isDateKey(persistedState.currentDateKey) ? persistedState.currentDateKey : fallback.currentDateKey;
  if (persistedState.currentDateKey !== undefined && persistedState.currentDateKey !== currentDateKey) recovered = true;

  const rawRecordsByDate = isRecordObject(persistedState.recordsByDate)
    ? (persistedState.recordsByDate as Record<string, LegacyRecordLike>)
    : {};
  if (persistedState.recordsByDate !== undefined && !isRecordObject(persistedState.recordsByDate)) recovered = true;

  const normalizedRecords = normalizeRecordsByDate(rawRecordsByDate);
  if (normalizedRecords.invalidDateKeyCount > 0 || normalizedRecords.recovered) recovered = true;

  const currentTab = normalizeTabType(persistedState.currentTab);
  if (persistedState.currentTab !== undefined && persistedState.currentTab !== currentTab) recovered = true;

  const dailyGoal = normalizePositiveInt(persistedState.dailyGoal, fallback.dailyGoal, 1, 10);
  if (persistedState.dailyGoal !== undefined && Number(persistedState.dailyGoal) !== dailyGoal) recovered = true;

  const weeklyMainTarget = normalizePositiveInt(persistedState.weeklyMainTarget, fallback.weeklyMainTarget, 1, 50);
  if (persistedState.weeklyMainTarget !== undefined && Number(persistedState.weeklyMainTarget) !== weeklyMainTarget) recovered = true;

  const preferredTown = getPreferredTownSelection(
    typeof persistedState.selectedMonth === "string" ? persistedState.selectedMonth : undefined,
    currentDateKey,
    isDateKey(persistedState.selectedDateInTown) ? persistedState.selectedDateInTown : undefined,
    normalizedRecords.recordsByDate
  );

  if (
    persistedState.selectedMonth !== undefined &&
    typeof persistedState.selectedMonth === "string" &&
    persistedState.selectedMonth !== preferredTown.monthKey
  ) {
    recovered = true;
  }

  if (
    persistedState.selectedDateInTown !== undefined &&
    (!isDateKey(persistedState.selectedDateInTown) || persistedState.selectedDateInTown !== preferredTown.dateKey)
  ) {
    recovered = true;
  }

  return {
    currentTab,
    currentDateKey,
    selectedMonth: preferredTown.monthKey,
    dailyGoal,
    weeklyMainTarget,
    recordsByDate: normalizedRecords.recordsByDate,
    selectedDateInTown: preferredTown.dateKey,
    recoveryNotice: recovered ? getRecoveryNotice(normalizeNonEmptyString(persistedState.recoveryNotice), NORMALIZATION_RECOVERY_NOTICE) : undefined,
    storageNotice: fallback.storageNotice,
    storageHealth: fallback.storageHealth
  };
};

const createPersistedSlice = (state: QuestownState) => ({
  currentTab: state.currentTab,
  currentDateKey: state.currentDateKey,
  selectedMonth: state.selectedMonth,
  dailyGoal: state.dailyGoal,
  weeklyMainTarget: state.weeklyMainTarget,
  recordsByDate: state.recordsByDate,
  selectedDateInTown: state.selectedDateInTown
});

export const useQuestownStore = create<QuestownState>()(
  persist(
    (set, get) => {
      hydrationRecoverySetter = (patch) => {
        set(patch as Partial<QuestownState>);
      };
      storageHealthSetter = (nextHealth) => {
        set((state) => {
          const nextNotice = nextHealth.degraded ? state.storageNotice ?? STORAGE_DEGRADED_NOTICE : state.storageNotice;
          if (sameStorageHealth(state.storageHealth, nextHealth) && state.storageNotice === nextNotice) {
            return state;
          }

          return {
            storageHealth: nextHealth,
            storageNotice: nextNotice
          };
        });
      };
      browserStorage.subscribe((health) => {
        storageHealthSetter?.(health);
      });

      const normalizeRecordsMap = (recordsByDate: Record<string, DailyRecord>) => {
        let recoveryNotice: string | undefined;
        const nextRecordsByDate = Object.fromEntries(
          Object.entries(recordsByDate).map(([dateKey, record]) => {
            const repaired = repairRecordConsistency(record, NORMALIZATION_RECOVERY_NOTICE);
            recoveryNotice ??= repaired.recoveryNotice;
            return [dateKey, repaired.record];
          })
        );

        return { recordsByDate: nextRecordsByDate, recoveryNotice };
      };

      const applyRecoveryAwarePatch = (patch: Partial<QuestownDataState>) => {
        const normalizedRecords = patch.recordsByDate ? normalizeRecordsMap(patch.recordsByDate) : undefined;
        set((state) => ({
          ...patch,
          recordsByDate: normalizedRecords?.recordsByDate ?? patch.recordsByDate ?? state.recordsByDate,
          recoveryNotice: patch.recoveryNotice ?? normalizedRecords?.recoveryNotice ?? state.recoveryNotice
        }));
      };

      const applyRecordMutation = (
        dateKey: string,
        mutator: (record: DailyRecord) => { ok: true; record: DailyRecord } | { ok: false; reason: string },
        recoveryNotice = NORMALIZATION_RECOVERY_NOTICE
      ) => {
        const result = mutator(getRecordForDate(get().recordsByDate, dateKey));
        if (!result.ok) return result;

        const repaired = repairRecordConsistency(result.record, recoveryNotice);
        applyRecoveryAwarePatch({
          recordsByDate: {
            ...get().recordsByDate,
            [dateKey]: repaired.record
          },
          recoveryNotice: repaired.recoveryNotice
        });

        return { ok: true } as const;
      };

      return {
        ...createInitialDataState(),

        setTab: (tab) => set({ currentTab: tab }),

        clearRecoveryNotice: () => set({ recoveryNotice: undefined }),

        clearStorageNotice: () => {
          browserStorage.clearLastError();
          set({ storageNotice: undefined, storageHealth: browserStorage.getHealth() });
        },

        setDailyGoal: (goal) => {
          const nextGoal = normalizePositiveInt(goal, 3, 1, 10);
          set({ dailyGoal: nextGoal });
        },

        setWeeklyMainTarget: (target) => {
          const nextTarget = normalizePositiveInt(target, 10, 1, 50);
          set({ weeklyMainTarget: nextTarget });
        },

        addQuest: (input) =>
          applyRecordMutation(get().currentDateKey, (record) => addQuestToRecord(record, input), NORMALIZATION_RECOVERY_NOTICE),

        updateQuestMeta: (questId, patch) =>
          applyRecordMutation(
            get().currentDateKey,
            (record) => updateQuestMetaInRecord(record, questId, patch),
            NORMALIZATION_RECOVERY_NOTICE
          ),

        setFocusQuest: (questId) =>
          applyRecordMutation(
            get().currentDateKey,
            (record) => setFocusQuestInRecord(record, questId),
            NORMALIZATION_RECOVERY_NOTICE
          ),

        clearFocusQuest: () =>
          applyRecordMutation(get().currentDateKey, (record) => clearFocusQuestInRecord(record), NORMALIZATION_RECOVERY_NOTICE),

        toggleQuest: (questId) =>
          applyRecordMutation(
            get().currentDateKey,
            (record) => toggleQuestInRecord(record, questId),
            NORMALIZATION_RECOVERY_NOTICE
          ),

        deleteQuest: (questId) =>
          applyRecordMutation(
            get().currentDateKey,
            (record) => deleteQuestFromRecord(record, questId),
            NORMALIZATION_RECOVERY_NOTICE
          ),

        finalizeCurrentDay: () => {
          applyRecordMutation(get().currentDateKey, (record) => ({ ok: true, record: finalizeRecord(record) }), NORMALIZATION_RECOVERY_NOTICE);
        },

        unfinalizeCurrentDay: () => {
          applyRecordMutation(
            get().currentDateKey,
            (record) => ({ ok: true, record: unfinalizeRecord(record) }),
            NORMALIZATION_RECOVERY_NOTICE
          );
        },

        goNextDayForDev: () => {
          const todayKey = get().currentDateKey;
          const today = getRecordForDate(get().recordsByDate, todayKey);
          const finalizedTodayResult = repairRecordConsistency(finalizeRecord(today), NORMALIZATION_RECOVERY_NOTICE);
          const targetDateKey = addDays(todayKey, 1);
          const nextBase = getRecordForDate(get().recordsByDate, targetDateKey);
          const nextPreparedResult = repairRecordConsistency(
            prepareNextDayRecord(finalizedTodayResult.record, nextBase, targetDateKey),
            NORMALIZATION_RECOVERY_NOTICE
          );
          const preferredTown = getPreferredTownSelection(
            getMonthKeyFromDateKey(targetDateKey),
            targetDateKey,
            get().selectedDateInTown,
            {
              ...get().recordsByDate,
              [todayKey]: finalizedTodayResult.record,
              [targetDateKey]: nextPreparedResult.record
            }
          );

          applyRecoveryAwarePatch({
            currentDateKey: targetDateKey,
            selectedMonth: preferredTown.monthKey,
            recordsByDate: {
              ...get().recordsByDate,
              [todayKey]: finalizedTodayResult.record,
              [targetDateKey]: nextPreparedResult.record
            },
            selectedDateInTown: preferredTown.dateKey,
            recoveryNotice: finalizedTodayResult.recoveryNotice ?? nextPreparedResult.recoveryNotice
          });
        },

        moveMonth: (delta) => {
          const nextMonth = addMonths(get().selectedMonth, delta);
          const preferredTown = getPreferredTownSelection(
            nextMonth,
            get().currentDateKey,
            get().selectedDateInTown,
            get().recordsByDate
          );

          set({
            selectedMonth: preferredTown.monthKey,
            selectedDateInTown: preferredTown.dateKey
          });
        },

        selectDateInTown: (date) => set({ selectedDateInTown: date }),

        hydrateToday: () => {
          const fallbackDateKey = toDateKey();
          const activeDateKey = isDateKey(get().currentDateKey) ? get().currentDateKey : fallbackDateKey;
          const synced = syncStateToToday(get().recordsByDate, activeDateKey);
          const preferredTown = getPreferredTownSelection(
            get().selectedMonth,
            synced.currentDateKey,
            get().selectedDateInTown,
            synced.recordsByDate
          );

          applyRecoveryAwarePatch({
            currentDateKey: synced.currentDateKey,
            selectedMonth: preferredTown.monthKey,
            recordsByDate: synced.recordsByDate,
            selectedDateInTown: preferredTown.dateKey
          });
        },

        rolloverToToday: () => {
          const currentKey = get().currentDateKey;
          const todayKey = toDateKey();

          if (currentKey === todayKey) return;

          const activeDateKey = isDateKey(currentKey) ? currentKey : todayKey;
          const synced = syncStateToToday(get().recordsByDate, activeDateKey);
          const preferredTown = getPreferredTownSelection(
            get().selectedMonth,
            synced.currentDateKey,
            get().selectedDateInTown,
            synced.recordsByDate
          );

          applyRecoveryAwarePatch({
            currentDateKey: synced.currentDateKey,
            selectedMonth: preferredTown.monthKey,
            recordsByDate: synced.recordsByDate,
            selectedDateInTown: preferredTown.dateKey
          });
        },

        exportBackup: () => ({
          version: 4,
          exportedAt: new Date().toISOString(),
          state: {
            currentDateKey: get().currentDateKey,
            selectedMonth: get().selectedMonth,
            dailyGoal: get().dailyGoal,
            weeklyMainTarget: get().weeklyMainTarget,
            recordsByDate: get().recordsByDate
          }
        }),

        previewBackupImport: (data) => buildBackupImportPreview(get(), data),

        applyBackupImport: (preview) => {
          if (!preview || !preview.state) {
            return { ok: false, reason: "복원 미리보기 정보가 올바르지 않아요." };
          }

          applyRecoveryAwarePatch({
            currentDateKey: preview.state.currentDateKey,
            selectedMonth: preview.state.selectedMonth,
            dailyGoal: normalizePositiveInt(preview.state.dailyGoal, 3, 1, 10),
            weeklyMainTarget: normalizePositiveInt(preview.state.weeklyMainTarget, 10, 1, 50),
            recordsByDate: preview.state.recordsByDate,
            selectedDateInTown: preview.state.selectedDateInTown,
            recoveryNotice: preview.state.recoveryNotice
          });

          return { ok: true };
        },

        importBackup: (data) => {
          const previewResult = buildBackupImportPreview(get(), data);
          if (!previewResult.ok) return previewResult;
          return get().applyBackupImport(previewResult.preview);
        }
      };
    },
    {
      name: STORAGE_NAME,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => browserStorage),
      partialize: (state) => createPersistedSlice(state),
      migrate: (persistedState: unknown) => normalizeHydratedState(persistedState),
      merge: (persistedState: unknown, currentState: QuestownState) => ({
        ...currentState,
        ...normalizeHydratedState(persistedState)
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (!error) return;

        browserStorage.removeItem(STORAGE_NAME);
        hydrationRecoverySetter?.({
          ...createInitialDataState(),
          recoveryNotice: HYDRATION_RECOVERY_NOTICE
        });
      }
    }
  )
);

export const useTodayRecord = () =>
  useQuestownStore((state) => getTodayRecord(state.recordsByDate, state.currentDateKey));

export const useTodayBuildingHeight = () =>
  useQuestownStore((state) => getTodayBuildingHeight(state.recordsByDate, state.currentDateKey));
