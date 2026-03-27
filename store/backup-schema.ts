const CURRENT_BACKUP_VERSION = 4;

interface RawBackupState {
  currentDateKey: string;
  selectedMonth: string;
  dailyGoal?: number;
  weeklyMainTarget?: number;
  recordsByDate: Record<string, unknown>;
}

export interface ValidatedBackupImport {
  version: number;
  exportedAt: string;
  state: RawBackupState;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export const validateBackupImportSchema = (
  value: unknown
): { ok: true; data: ValidatedBackupImport } | { ok: false; reason: string } => {
  if (!isPlainObject(value)) {
    return { ok: false, reason: "백업 데이터 형식이 올바르지 않아요." };
  }

  if (!Number.isInteger(value.version) || Number(value.version) < 1) {
    return { ok: false, reason: "백업 버전 정보가 올바르지 않아요." };
  }

  if (Number(value.version) > CURRENT_BACKUP_VERSION) {
    return { ok: false, reason: "지원하지 않는 백업 버전이에요." };
  }

  if (!isNonEmptyString(value.exportedAt) || Number.isNaN(Date.parse(value.exportedAt))) {
    return { ok: false, reason: "백업 생성 시각 정보가 올바르지 않아요." };
  }

  if (!isPlainObject(value.state)) {
    return { ok: false, reason: "백업 상태 데이터 형식이 올바르지 않아요." };
  }

  const { currentDateKey, selectedMonth, dailyGoal, weeklyMainTarget, recordsByDate } = value.state;

  if (!isNonEmptyString(currentDateKey)) {
    return { ok: false, reason: "백업 날짜 정보가 올바르지 않아요." };
  }

  if (!isNonEmptyString(selectedMonth)) {
    return { ok: false, reason: "백업 월 정보가 올바르지 않아요." };
  }

  if ((dailyGoal !== undefined && !isFiniteNumber(dailyGoal)) || (weeklyMainTarget !== undefined && !isFiniteNumber(weeklyMainTarget))) {
    return { ok: false, reason: "백업 목표 설정 형식이 올바르지 않아요." };
  }

  if (!isPlainObject(recordsByDate)) {
    return { ok: false, reason: "백업 데이터 형식이 올바르지 않아요." };
  }

  return {
    ok: true,
    data: {
      version: Number(value.version),
      exportedAt: value.exportedAt,
      state: {
        currentDateKey,
        selectedMonth,
        dailyGoal: isFiniteNumber(dailyGoal) ? dailyGoal : undefined,
        weeklyMainTarget: isFiniteNumber(weeklyMainTarget) ? weeklyMainTarget : undefined,
        recordsByDate
      }
    }
  };
};
