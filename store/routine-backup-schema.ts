import { RoutineBackupData } from "@/domain/game-types";

export const CURRENT_ROUTINE_BACKUP_VERSION = 1;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export const validateRoutineBackupImportSchema = (
  value: unknown
): { ok: true; data: RoutineBackupData } | { ok: false; reason: string } => {
  if (!isPlainObject(value)) {
    return { ok: false, reason: "백업 데이터 형식이 올바르지 않아요." };
  }

  if (!Number.isInteger(value.version) || Number(value.version) < 1) {
    return { ok: false, reason: "백업 버전 정보가 올바르지 않아요." };
  }

  if (Number(value.version) > CURRENT_ROUTINE_BACKUP_VERSION) {
    return { ok: false, reason: "지원하지 않는 routine 백업 버전이에요." };
  }

  if (!isNonEmptyString(value.exportedAt) || Number.isNaN(Date.parse(value.exportedAt))) {
    return { ok: false, reason: "백업 생성 시각 정보가 올바르지 않아요." };
  }

  if (!isPlainObject(value.state)) {
    return { ok: false, reason: "백업 상태 데이터 형식이 올바르지 않아요." };
  }

  return {
    ok: true,
    data: {
      version: Number(value.version),
      exportedAt: value.exportedAt,
      state: value.state as unknown as RoutineBackupData["state"]
    }
  };
};
