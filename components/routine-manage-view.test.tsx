import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { RoutineManageView } from "./routine-manage-view";

describe("routine manage view", () => {
  it("renders migration status, analytics, and import preview details", () => {
    const markup = renderToStaticMarkup(
      <RoutineManageView
        currentGameDateKey="2026-03-31"
        sessionsById={{}}
        dailyBuildingsByDate={{}}
        floorsById={{}}
        surpriseQuestsById={{}}
        aiSuggestionsById={{}}
        migrationMetaBySourceFingerprint={{
          "migration-1": {
            sourceKind: "legacy_backup",
            sourceFingerprint: "migration-1",
            importedAt: "2026-03-31T00:00:00.000Z",
            importedDateCount: 2,
            importedCompletedQuestCount: 4,
            unmappedQuestCount: 1,
            warningCount: 1
          }
        }}
        storageHealth={{ readable: true, writable: false, degraded: true, lastError: "quota exceeded" }}
        migrationNotice={{ title: "Migration", body: "legacy history imported", tone: "info" }}
        recoveryNotice={{ title: "Recovery", body: "one record was repaired", tone: "warning" }}
        exportBackup={vi.fn(() => ({ version: 1, exportedAt: "2026-03-31T00:00:00.000Z", state: {} as never }))}
        previewBackupImport={vi.fn(() => ({ ok: false as const, reason: "unused" }))}
        applyBackupImport={vi.fn(() => ({ ok: true }))}
        clearRecoveryNotice={vi.fn()}
        clearMigrationNotice={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("migration, backup, analytics");
    expect(markup).toContain("Migration Status");
    expect(markup).toContain("Local Analytics");
    expect(markup).toContain("Storage Health");
    expect(markup).toContain("system resolved");
    expect(markup).toContain("legacy history imported");
    expect(markup).toContain("quota exceeded");
  });
});
