import { describe, expect, it } from "vitest";
import { buildLegacyRoutineImport, mergeLegacyImportIntoRoutineBackupState } from "./legacy-routine-migration";
import { RoutineBackupState } from "@/domain/game-types";

const emptyRoutineBackupState = (): RoutineBackupState => ({
  activeView: "launcher",
  selectedRoutineId: undefined,
  activeSessionId: undefined,
  hasBootstrappedDefaults: true,
  routinesById: {},
  stepsByRoutineId: {},
  triggersByRoutineId: {},
  sessionsById: {},
  sessionRuntimeBySessionId: {},
  stepResultsBySessionId: {},
  dailyBuildingsByDate: {},
  floorsById: {},
  dismissedRemainingRoutineIdsByDate: {},
  surpriseQuestsById: {},
  aiSuggestionsById: {},
  reviewSummariesById: {},
  migrationMetaBySourceFingerprint: {}
});

describe("legacy routine migration", () => {
  it("imports only completed legacy quests into hidden routine history and preserves finalized roofs", () => {
    const result = buildLegacyRoutineImport({
      sourceKind: "legacy_backup",
      rawData: {
        version: 4,
        exportedAt: "2026-03-31T00:00:00.000Z",
        state: {
          currentDateKey: "2026-03-31",
          selectedMonth: "2026-03",
          recordsByDate: {
            "2026-03-30": {
              quests: [
                {
                  id: "legacy-main-1",
                  title: "출근 가방 챙기기",
                  type: "main",
                  completed: true,
                  createdAt: "2026-03-30T07:30:00.000Z",
                  completedAt: "2026-03-30T07:35:00.000Z"
                },
                {
                  id: "legacy-daily-1",
                  title: "물 마시기",
                  type: "daily",
                  completed: false,
                  createdAt: "2026-03-30T07:36:00.000Z"
                }
              ],
              isFinalized: true,
              roofType: "high"
            }
          }
        }
      },
      now: new Date("2026-04-01T00:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.result.routinesById)).toHaveLength(1);
    const importedRoutine = Object.values(result.result.routinesById)[0];
    expect(importedRoutine.isEnabled).toBe(false);
    expect(result.result.triggersByRoutineId[importedRoutine.id]).toEqual([]);
    expect(Object.keys(result.result.sessionsById)).toHaveLength(1);
    expect(Object.values(result.result.sessionsById)[0]?.status).toBe("reviewed");
    expect(result.result.dailyBuildingsByDate["2026-03-30"]?.roofType).toBe("high");
    expect(result.result.reviewSummariesById["legacy-review-2026-03-30"]?.headline).toContain("legacy 하루");
    expect(result.result.unmappedLegacyQuestCount).toBe(1);
  });

  it("is keyed by source fingerprint when merged into routine backup state", () => {
    const importResult = buildLegacyRoutineImport({
      sourceKind: "legacy_local_storage",
      rawData: JSON.stringify({
        state: {
          currentDateKey: "2026-03-31",
          selectedMonth: "2026-03",
          recordsByDate: {
            "2026-03-31": {
              quests: [{ title: "책상 정리", type: "daily", completed: true }]
            }
          }
        }
      }),
      now: new Date("2026-04-01T00:00:00.000Z")
    });

    expect(importResult.ok).toBe(true);
    if (!importResult.ok) return;

    const merged = mergeLegacyImportIntoRoutineBackupState({
      baseState: emptyRoutineBackupState(),
      importResult: importResult.result
    });

    expect(Object.keys(merged.sessionsById)).toHaveLength(1);
    expect(merged.migrationMetaBySourceFingerprint[importResult.result.sourceFingerprint]?.importedCompletedQuestCount).toBe(1);
  });
});
