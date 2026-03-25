"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { Button, Card } from "@/components/ui";
import { useQuestownStore, useTodayRecord } from "@/store/questown-store";

type StatusTone = "success" | "error" | "info";

const statusClass: Record<StatusTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700"
};

export function ManageView() {
  const record = useTodayRecord();
  const dailyGoal = useQuestownStore((state) => state.dailyGoal);
  const weeklyMainTarget = useQuestownStore((state) => state.weeklyMainTarget);
  const finalizeCurrentDay = useQuestownStore((state) => state.finalizeCurrentDay);
  const unfinalizeCurrentDay = useQuestownStore((state) => state.unfinalizeCurrentDay);
  const setDailyGoal = useQuestownStore((state) => state.setDailyGoal);
  const setWeeklyMainTarget = useQuestownStore((state) => state.setWeeklyMainTarget);
  const exportBackup = useQuestownStore((state) => state.exportBackup);
  const importBackup = useQuestownStore((state) => state.importBackup);
  const goNextDayForDev = useQuestownStore((state) => state.goNextDayForDev);

  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!status) return undefined;

    const timeout = window.setTimeout(() => {
      setStatus(null);
    }, 2600);

    return () => window.clearTimeout(timeout);
  }, [status]);

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

  const onBackupImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let parsed: unknown;

      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        setStatus({ text: "JSON 형식이 올바르지 않아요.", tone: "error" });
        return;
      }

      const result = importBackup(parsed);
      setStatus({
        text: result.ok ? "백업을 복원했어요." : result.reason ?? "복원에 실패했어요.",
        tone: result.ok ? "success" : "error"
      });
    } catch {
      setStatus({ text: "백업 파일을 읽지 못했어요.", tone: "error" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <Card className="rounded-[28px] bg-white/88 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Manage</p>
        <h2 className="mt-2 text-2xl font-black text-slate-900">정리와 설정</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">홈을 가볍게 유지하기 위해 보조 기능은 여기로 모았습니다.</p>
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
        <p className="text-sm font-bold text-slate-900">데이터</p>
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
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={onBackupImport} />

        {process.env.NODE_ENV !== "production" ? (
          <details className="mt-4 rounded-[22px] bg-amber-50 p-4">
            <summary className="cursor-pointer list-none text-sm font-bold text-amber-900 [&::-webkit-details-marker]:hidden">
              개발용 도구
            </summary>
            <p className="mt-2 text-xs font-semibold text-amber-800">일반 사용 흐름에서는 숨기고, 필요할 때만 날짜를 넘깁니다.</p>
            <Button type="button" className="mt-3 min-h-[56px] rounded-[22px] bg-quest-accent text-sm font-black text-slate-900" onClick={goNextDayForDev}>
              다음 날로 넘기기 (DEV)
            </Button>
          </details>
        ) : null}

        {status ? (
          <p className={`mt-4 rounded-[22px] border px-4 py-3 text-sm font-semibold ${statusClass[status.tone]}`}>{status.text}</p>
        ) : null}
      </Card>
    </div>
  );
}
