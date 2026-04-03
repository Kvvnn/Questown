"use client";

import React from "react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import { getRoutineAnalyticsEvents, getRoutineAnalyticsSnapshot } from "@/domain/routine-analytics";
import {
  AiSuggestion,
  DailyBuilding,
  Floor,
  RoutineBackupData,
  RoutineBackupImportPreview,
  RoutineMigrationMeta,
  RoutineSession,
  RoutineStoreNotice,
  SurpriseQuest
} from "@/domain/game-types";
import { StorageHealth } from "@/domain/types";

type StatusTone = "success" | "error" | "info";

const statusClass: Record<StatusTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700"
};

const formatPercent = (value: number) => `${value}%`;

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
};

const getMigrationLabel = (sourceKind: RoutineMigrationMeta["sourceKind"]) => {
  if (sourceKind === "legacy_local_storage") return "자동 마이그레이션";
  if (sourceKind === "legacy_backup") return "legacy 백업 import";
  return "routine 백업 import";
};

export interface RoutineManageViewProps {
  currentGameDateKey: string;
  sessionsById: Record<string, RoutineSession>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  floorsById: Record<string, Floor>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  aiSuggestionsById: Record<string, AiSuggestion>;
  migrationMetaBySourceFingerprint: Record<string, RoutineMigrationMeta>;
  storageHealth: StorageHealth;
  migrationNotice?: RoutineStoreNotice;
  recoveryNotice?: RoutineStoreNotice;
  exportBackup: () => RoutineBackupData;
  previewBackupImport: (data: unknown) => { ok: true; preview: RoutineBackupImportPreview } | { ok: false; reason: string };
  applyBackupImport: (preview: RoutineBackupImportPreview) => { ok: boolean; reason?: string };
  clearRecoveryNotice: () => void;
  clearMigrationNotice: () => void;
  onClose: () => void;
}

export function RoutineManageView({
  currentGameDateKey,
  sessionsById,
  dailyBuildingsByDate,
  floorsById,
  surpriseQuestsById,
  aiSuggestionsById,
  migrationMetaBySourceFingerprint,
  storageHealth,
  migrationNotice,
  recoveryNotice,
  exportBackup,
  previewBackupImport,
  applyBackupImport,
  clearRecoveryNotice,
  clearMigrationNotice,
  onClose
}: RoutineManageViewProps) {
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | null>(null);
  const [preview, setPreview] = useState<RoutineBackupImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const analytics = useMemo(
    () =>
      getRoutineAnalyticsSnapshot({
        currentGameDateKey,
        sessionsById,
        dailyBuildingsByDate,
        floorsById,
        surpriseQuestsById,
        aiSuggestionsById
      }),
    [aiSuggestionsById, currentGameDateKey, dailyBuildingsByDate, floorsById, sessionsById, surpriseQuestsById]
  );
  const recentEvents = useMemo(
    () =>
      getRoutineAnalyticsEvents({
        sessionsById,
        dailyBuildingsByDate,
        surpriseQuestsById,
        aiSuggestionsById,
        migrationMetaBySourceFingerprint
      }).slice(0, 6),
    [aiSuggestionsById, dailyBuildingsByDate, migrationMetaBySourceFingerprint, sessionsById, surpriseQuestsById]
  );
  const recentMigrations = useMemo(
    () =>
      Object.values(migrationMetaBySourceFingerprint)
        .sort((left, right) => right.importedAt.localeCompare(left.importedAt, "en"))
        .slice(0, 4),
    [migrationMetaBySourceFingerprint]
  );

  useEffect(() => {
    if (!status) return undefined;
    const timeout = window.setTimeout(() => setStatus(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const onBackupExport = () => {
    const data = exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `questown-routine-backup-${currentGameDateKey}.json`;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();

    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 0);

    setStatus({ text: "routine 백업 파일을 저장했어요.", tone: "success" });
  };

  const resetPreview = () => {
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onBackupFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let parsed: unknown;

      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        setStatus({ text: "JSON 형식이 올바르지 않아요.", tone: "error" });
        resetPreview();
        return;
      }

      const previewResult = previewBackupImport(parsed);
      if (!previewResult.ok) {
        setStatus({ text: previewResult.reason ?? "복원 미리보기를 만들지 못했어요.", tone: "error" });
        resetPreview();
        return;
      }

      setPreview(previewResult.preview);
      setStatus({
        text: previewResult.preview.alreadyImported ? "이미 가져온 legacy 기록입니다." : "복원 미리보기를 준비했어요.",
        tone: previewResult.preview.alreadyImported ? "info" : "success"
      });
    } catch {
      setStatus({ text: "백업 파일을 읽지 못했어요.", tone: "error" });
      resetPreview();
    }
  };

  const onApplyPreview = () => {
    if (!preview) return;
    const result = applyBackupImport(preview);
    setStatus({
      text: result.ok ? "백업을 복원했어요." : result.reason ?? "복원 적용에 실패했어요.",
      tone: result.ok ? "success" : "error"
    });

    if (result.ok) {
      resetPreview();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pb-2">
      <Card className="rounded-[30px] border border-slate-200/70 bg-white/92 px-5 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Manage</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950">migration, backup, analytics</h2>
          </div>
          <Button className="border-slate-200 bg-white" onClick={onClose}>
            런처로 돌아가기
          </Button>
        </div>
      </Card>

      {migrationNotice ? (
        <Card className="rounded-[26px] border border-sky-100 bg-sky-50/90 px-4 py-4 text-sm text-sky-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-500">{migrationNotice.title}</p>
              <p className="mt-2 font-semibold">{migrationNotice.body}</p>
            </div>
            <button type="button" onClick={clearMigrationNotice} className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em]">
              닫기
            </button>
          </div>
        </Card>
      ) : null}

      {recoveryNotice ? (
        <Card className="rounded-[26px] border border-amber-200 bg-amber-50/92 px-4 py-4 text-sm text-amber-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-600">{recoveryNotice.title}</p>
              <p className="mt-2 font-semibold">{recoveryNotice.body}</p>
            </div>
            <button type="button" onClick={clearRecoveryNotice} className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em]">
              닫기
            </button>
          </div>
        </Card>
      ) : null}

      {status ? (
        <Card className={`rounded-[22px] border px-4 py-3 text-sm font-semibold ${statusClass[status.tone]}`}>{status.text}</Card>
      ) : null}

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Migration Status</p>
        {recentMigrations.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {recentMigrations.map((meta) => (
              <div key={meta.sourceFingerprint} className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-950">{getMigrationLabel(meta.sourceKind)}</p>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                    warnings {meta.warningCount}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  완료 {meta.importedCompletedQuestCount}개 · 날짜 {meta.importedDateCount}일 · unmapped {meta.unmappedQuestCount}개
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500">{formatTimestamp(meta.importedAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-500">이력 없음</p>
        )}
      </Card>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Local Analytics</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-semibold text-slate-700">
          <div className="rounded-[22px] bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">completed / 7d</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{analytics.completedSessionsLast7}</p>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">clear rate / 14d</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{formatPercent(analytics.clearRateLast14)}</p>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">review rate / 14d</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{formatPercent(analytics.finalizedReviewRateLast14)}</p>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">floors</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{analytics.totalFloors}</p>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">current month</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{analytics.currentMonthFloorCount}</p>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">surprise quest</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{formatPercent(analytics.surpriseQuestCompletionRate)}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-semibold text-slate-700">
          <div className="rounded-[22px] bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">AI accept rate</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{formatPercent(analytics.aiSuggestionAcceptanceRate)}</p>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">system resolved</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{analytics.fallbackSuggestionResolutionCount}</p>
          </div>
        </div>
      </Card>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Backup</p>
            <h3 className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">routine 백업을 내보내고 다시 가져옵니다.</h3>
          </div>
          <Button className="border-slate-200 bg-white" onClick={onBackupExport}>
            백업 내보내기
          </Button>
        </div>

        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={onBackupFileChange} />
        <Button className="mt-4 border-slate-200 bg-white" onClick={() => fileInputRef.current?.click()}>
          백업 파일 가져오기
        </Button>

        {preview ? (
          <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/90 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Import Preview</p>
                <p className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">{getMigrationLabel(preview.sourceKind)}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                version {preview.version}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-semibold text-slate-700">
              <div className="rounded-[18px] bg-white px-3 py-3">dates {preview.dateCount}</div>
              <div className="rounded-[18px] bg-white px-3 py-3">overwrite {preview.overwriteDateCount}</div>
              <div className="rounded-[18px] bg-white px-3 py-3">new {preview.newDateCount}</div>
              <div className="rounded-[18px] bg-white px-3 py-3">unmapped {preview.unmappedLegacyQuestCount}</div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">생성 시각: {formatTimestamp(preview.exportedAt)}</p>
            {preview.hasRepairWarning ? (
              <p className="mt-2 rounded-[18px] bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-900">
                {preview.repairSummary ?? "가져온 데이터 일부를 자동 복구합니다."}
              </p>
            ) : null}
            {preview.unmappedLegacyQuestTitles.length > 0 ? (
              <div className="mt-3 rounded-[18px] bg-white px-3 py-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Unmapped Legacy Quests</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{preview.unmappedLegacyQuestTitles.join(", ")}</p>
              </div>
            ) : null}
            {preview.alreadyImported ? (
              <p className="mt-3 rounded-[18px] bg-sky-50 px-3 py-3 text-sm font-semibold text-sky-800">
                같은 legacy source fingerprint는 한 번만 가져옵니다.
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button className="border-slate-200 bg-white" onClick={resetPreview}>
                취소
              </Button>
              <Button className="bg-slate-950 text-white disabled:bg-slate-300" onClick={onApplyPreview} disabled={preview.alreadyImported}>
                적용
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Recent Events</p>
        {recentEvents.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {recentEvents.map((event) => (
              <div key={event.id} className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-950">{event.title}</p>
                    {event.type === "ai_suggestion_resolved" && event.suggestionSource ? (
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        {event.suggestionSource}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">{formatTimestamp(event.occurredAt)}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{event.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-500">이벤트 없음</p>
        )}
      </Card>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5 text-sm font-semibold text-slate-600">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Storage Health</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-[18px] bg-slate-50 px-3 py-3">readable {storageHealth.readable ? "yes" : "no"}</div>
          <div className="rounded-[18px] bg-slate-50 px-3 py-3">
            {storageHealth.degraded ? "storage degraded" : "storage healthy"} · writable {storageHealth.writable ? "yes" : "no"}
          </div>
        </div>
        <div className="mt-3 rounded-[18px] bg-slate-50 px-3 py-3">lastError: {storageHealth.lastError ?? "-"}</div>
      </Card>
    </div>
  );
}
