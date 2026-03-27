"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { Button, Card } from "@/components/ui";
import { getLocalAnalyticsSnapshot } from "@/domain/local-analytics";
import { BackupImportPreview } from "@/domain/types";
import { useQuestownStore, useTodayRecord } from "@/store/questown-store";

type StatusTone = "success" | "error" | "info";
type InstallState = "installed" | "available" | "manual" | "unsupported";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const statusClass: Record<StatusTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700"
};

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

const isIosSafari = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios|chrome|android/.test(userAgent);
  return isIos && isSafari;
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

export function ManageView() {
  const record = useTodayRecord();
  const currentTab = useQuestownStore((state) => state.currentTab);
  const currentDateKey = useQuestownStore((state) => state.currentDateKey);
  const selectedMonth = useQuestownStore((state) => state.selectedMonth);
  const selectedDateInTown = useQuestownStore((state) => state.selectedDateInTown);
  const recordsByDate = useQuestownStore((state) => state.recordsByDate);
  const recoveryNotice = useQuestownStore((state) => state.recoveryNotice);
  const storageNotice = useQuestownStore((state) => state.storageNotice);
  const storageHealth = useQuestownStore((state) => state.storageHealth);
  const dailyGoal = useQuestownStore((state) => state.dailyGoal);
  const weeklyMainTarget = useQuestownStore((state) => state.weeklyMainTarget);
  const finalizeCurrentDay = useQuestownStore((state) => state.finalizeCurrentDay);
  const unfinalizeCurrentDay = useQuestownStore((state) => state.unfinalizeCurrentDay);
  const setDailyGoal = useQuestownStore((state) => state.setDailyGoal);
  const setWeeklyMainTarget = useQuestownStore((state) => state.setWeeklyMainTarget);
  const exportBackup = useQuestownStore((state) => state.exportBackup);
  const previewBackupImport = useQuestownStore((state) => state.previewBackupImport);
  const applyBackupImport = useQuestownStore((state) => state.applyBackupImport);
  const hydrateToday = useQuestownStore((state) => state.hydrateToday);
  const rolloverToToday = useQuestownStore((state) => state.rolloverToToday);
  const goNextDayForDev = useQuestownStore((state) => state.goNextDayForDev);

  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | null>(null);
  const [preview, setPreview] = useState<BackupImportPreview | null>(null);
  const [installState, setInstallState] = useState<InstallState>(() => (typeof window === "undefined" ? "unsupported" : "unsupported"));
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const analytics = useMemo(
    () => getLocalAnalyticsSnapshot(recordsByDate, currentDateKey, dailyGoal, weeklyMainTarget),
    [currentDateKey, dailyGoal, recordsByDate, weeklyMainTarget]
  );

  const totalRecordCount = useMemo(() => Object.keys(recordsByDate).length, [recordsByDate]);
  const finalizedRecordCount = useMemo(
    () => Object.values(recordsByDate).filter((candidate) => candidate.isFinalized).length,
    [recordsByDate]
  );

  useEffect(() => {
    if (!status) return undefined;

    const timeout = window.setTimeout(() => {
      setStatus(null);
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncInstallState = () => {
      if (isStandalone()) {
        setInstallState("installed");
        return;
      }

      if (isIosSafari()) {
        setInstallState("manual");
        return;
      }

      setInstallState(installPromptEvent ? "available" : "unsupported");
    };

    syncInstallState();

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      setInstallState("available");
    };

    const onInstalled = () => {
      setInstallPromptEvent(null);
      setInstallState("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [installPromptEvent]);

  const onGoalChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDailyGoal(Number(event.target.value));
  };

  const onWeeklyMainTargetChange = (event: ChangeEvent<HTMLInputElement>) => {
    setWeeklyMainTarget(Number(event.target.value));
  };

  const onBackupExport = () => {
    const data = exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `questown-backup-${record.date}.json`;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();

    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 0);

    setStatus({ text: "백업 파일을 저장했어요.", tone: "success" });
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
      setStatus({ text: "복원 미리보기를 준비했어요. 내용을 확인한 뒤 적용하세요.", tone: "info" });
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

  const onInstall = async () => {
    if (!installPromptEvent) return;

    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallState("installed");
      setStatus({ text: "Questown을 홈 화면에 추가했어요.", tone: "success" });
    }
    setInstallPromptEvent(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <Card className="rounded-[28px] bg-white/88 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Manage</p>
        <h2 className="mt-2 text-2xl font-black text-slate-900">장기 사용 준비</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">설치, 복원, 로컬 인사이트를 여기서 관리합니다.</p>
      </Card>

      <Card className="rounded-[28px] bg-white/88 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">앱 설치</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">홈 화면에서 Questown을 네이티브 앱처럼 열 수 있어요.</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-black ${
              installState === "installed"
                ? "bg-emerald-100 text-emerald-700"
                : installState === "available"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {installState === "installed" ? "설치됨" : installState === "available" ? "설치 가능" : installState === "manual" ? "수동 설치" : "브라우저 설치"}
          </span>
        </div>

        {installState === "available" ? (
          <Button type="button" className="mt-4 min-h-[56px] rounded-[22px] bg-quest-primary text-sm font-black text-white" onClick={onInstall}>
            Questown 설치하기
          </Button>
        ) : null}

        {installState === "installed" ? (
          <p className="mt-4 rounded-[22px] bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            이미 홈 화면에 추가되어 있어요. 다음부터는 앱처럼 바로 실행됩니다.
          </p>
        ) : null}

        {installState === "manual" ? (
          <p className="mt-4 rounded-[22px] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            Safari 공유 메뉴에서 <span className="font-black">홈 화면에 추가</span>를 선택하면 설치할 수 있어요.
          </p>
        ) : null}

        {installState === "unsupported" ? (
          <p className="mt-4 rounded-[22px] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            이 브라우저에서는 자동 설치 프롬프트가 없을 수 있어요. 브라우저 메뉴의 설치 항목을 확인해 주세요.
          </p>
        ) : null}
      </Card>

      <Card className="rounded-[28px] bg-white/88 p-5">
        <p className="text-sm font-bold text-slate-900">로컬 인사이트</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-[22px] bg-slate-100 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">7일 평균</p>
            <p className="mt-1 text-lg font-black text-slate-900">{analytics.avgCompletedLast7}개</p>
          </div>
          <div className="rounded-[22px] bg-slate-100 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">14일 마감</p>
            <p className="mt-1 text-lg font-black text-slate-900">{formatPercent(analytics.finalizedRateLast14)}</p>
          </div>
          <div className="rounded-[22px] bg-slate-100 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">연속 주간</p>
            <p className="mt-1 text-lg font-black text-slate-900">{analytics.weeklySuccessStreak}주</p>
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">
          최근 14일 중 {analytics.finalizedDaysLast14}일을 마감했고, 이번 주 기준 메인 목표 연속 성공은 {analytics.weeklySuccessStreak}주예요.
        </p>
      </Card>

      <Card className="rounded-[28px] bg-white/88 p-5">
        <p className="text-sm font-bold text-slate-900">오늘 상태</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-[22px] bg-slate-100 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Completed</p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              <AnimatedNumber value={record.completedCount} />/{record.totalCount}
            </p>
          </div>
          <div className="rounded-[22px] bg-slate-100 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Roof</p>
            <p className="mt-1 text-xl font-black text-slate-900">{record.isFinalized ? "완료" : "열림"}</p>
          </div>
        </div>

        <div className="mt-4">
          <Button
            type="button"
            className={`min-h-[60px] rounded-[24px] text-base font-black ${
              record.isFinalized ? "bg-amber-100 text-amber-900" : "bg-quest-primary text-white"
            }`}
            onClick={record.isFinalized ? unfinalizeCurrentDay : finalizeCurrentDay}
          >
            {record.isFinalized ? "마감 해제" : "오늘 마감"}
          </Button>
        </div>
      </Card>

      <Card className="rounded-[28px] bg-white/88 p-5">
        <p className="text-sm font-bold text-slate-900">목표 설정</p>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>일일 목표</span>
            <span>{dailyGoal}개</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={dailyGoal}
            onChange={onGoalChange}
            className="w-full accent-indigo-500"
            aria-label="일일 목표치 설정"
          />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>주간 메인 목표</span>
            <span>{weeklyMainTarget}개</span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            value={weeklyMainTarget}
            onChange={onWeeklyMainTargetChange}
            className="w-full accent-emerald-500"
            aria-label="주간 메인 목표 설정"
          />
        </div>
      </Card>

      <Card className="rounded-[28px] bg-white/88 p-5">
        <p className="text-sm font-bold text-slate-900">백업과 복원</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button type="button" className="min-h-[56px] rounded-[22px] bg-slate-100 text-sm font-black" onClick={onBackupExport}>
            JSON 백업
          </Button>
          <Button
            type="button"
            className="min-h-[56px] rounded-[22px] bg-slate-100 text-sm font-black"
            onClick={() => fileInputRef.current?.click()}
          >
            JSON 복원
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={onBackupFileChange} />

        {preview ? (
          <div className="mt-4 rounded-[24px] bg-slate-50 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Import Preview</p>
                <p className="mt-1 text-base font-black text-slate-900">{preview.dateCount}일 기록을 복원할 준비가 됐어요.</p>
              </div>
              {preview.hasRepairWarning ? (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-700">자동 복구 포함</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">그대로 적용</span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold text-slate-700">
              <div className="rounded-[18px] bg-white px-3 py-3">생성 시각: {formatTimestamp(preview.exportedAt)}</div>
              <div className="rounded-[18px] bg-white px-3 py-3">백업 버전: v{preview.version}</div>
              <div className="rounded-[18px] bg-white px-3 py-3">시작 날짜: {preview.earliestDate ?? "-"}</div>
              <div className="rounded-[18px] bg-white px-3 py-3">마지막 날짜: {preview.latestDate ?? "-"}</div>
              <div className="rounded-[18px] bg-white px-3 py-3">덮어쓰기: {preview.overwriteDateCount}일</div>
              <div className="rounded-[18px] bg-white px-3 py-3">새 기록: {preview.newDateCount}일</div>
            </div>

            <p className="mt-3 text-sm font-semibold text-slate-600">
              {preview.repairSummary ?? "기존 복구 규칙을 그대로 적용해 현재 앱 상태에 맞게 정리합니다."}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button type="button" className="min-h-[56px] rounded-[22px] bg-quest-primary text-sm font-black text-white" onClick={onApplyPreview}>
                적용하기
              </Button>
              <Button type="button" className="min-h-[56px] rounded-[22px] bg-slate-100 text-sm font-black" onClick={resetPreview}>
                취소
              </Button>
            </div>
          </div>
        ) : null}

        {status ? (
          <p className={`mt-4 rounded-[22px] border px-4 py-3 text-sm font-semibold ${statusClass[status.tone]}`}>{status.text}</p>
        ) : null}
      </Card>

      {process.env.NODE_ENV !== "production" ? (
        <Card className="rounded-[28px] bg-white/88 p-5">
          <p className="text-sm font-bold text-slate-900">디버그 패널</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
            <div className="rounded-[18px] bg-slate-50 px-3 py-3">currentDateKey: {currentDateKey}</div>
            <div className="rounded-[18px] bg-slate-50 px-3 py-3">selectedMonth: {selectedMonth}</div>
            <div className="rounded-[18px] bg-slate-50 px-3 py-3">selectedDateInTown: {selectedDateInTown ?? "-"}</div>
            <div className="rounded-[18px] bg-slate-50 px-3 py-3">currentTab: {currentTab}</div>
            <div className="rounded-[18px] bg-slate-50 px-3 py-3">records: {totalRecordCount}</div>
            <div className="rounded-[18px] bg-slate-50 px-3 py-3">finalized: {finalizedRecordCount}</div>
            <div className="rounded-[18px] bg-slate-50 px-3 py-3">
              storageHealth: {storageHealth.degraded ? "degraded" : "healthy"} ({storageHealth.readable ? "R" : "-"} / {storageHealth.writable ? "W" : "-"})
            </div>
            <div className="rounded-[18px] bg-slate-50 px-3 py-3">recoveryNotice: {recoveryNotice ?? "-"}</div>
            <div className="col-span-2 rounded-[18px] bg-slate-50 px-3 py-3">storageNotice: {storageNotice ?? "-"}</div>
            <div className="col-span-2 rounded-[18px] bg-slate-50 px-3 py-3">lastError: {storageHealth.lastError ?? "-"}</div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button type="button" className="min-h-[52px] rounded-[20px] bg-slate-100 text-xs font-black" onClick={hydrateToday}>
              hydrateToday
            </Button>
            <Button type="button" className="min-h-[52px] rounded-[20px] bg-slate-100 text-xs font-black" onClick={rolloverToToday}>
              rolloverToToday
            </Button>
            <Button type="button" className="min-h-[52px] rounded-[20px] bg-quest-accent text-xs font-black text-slate-900" onClick={goNextDayForDev}>
              다음 날 DEV
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
