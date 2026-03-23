"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { Button, Card } from "@/components/ui";
import { getStreakCount, getWeeklySummary } from "@/domain/progress";
import { AppBackupData } from "@/domain/types";
import { useQuestownStore, useTodayBuildingHeight, useTodayRecord } from "@/store/questown-store";

const cheers = ["좋아, 1층 완성!", "오늘 town이 자라고 있어요", "지붕까지 거의 다 왔어요"];

export function TodayView() {
  const record = useTodayRecord();
  const height = useTodayBuildingHeight();
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dailyGoal = useQuestownStore((s) => s.dailyGoal);
  const recordsByDate = useQuestownStore((s) => s.recordsByDate);
  const currentDateKey = useQuestownStore((s) => s.currentDateKey);

  const addTodo = useQuestownStore((s) => s.addTodo);
  const toggleTodo = useQuestownStore((s) => s.toggleTodo);
  const deleteTodo = useQuestownStore((s) => s.deleteTodo);
  const finalizeCurrentDay = useQuestownStore((s) => s.finalizeCurrentDay);
  const unfinalizeCurrentDay = useQuestownStore((s) => s.unfinalizeCurrentDay);
  const goNextDayForDev = useQuestownStore((s) => s.goNextDayForDev);
  const setDailyGoal = useQuestownStore((s) => s.setDailyGoal);
  const exportBackup = useQuestownStore((s) => s.exportBackup);
  const importBackup = useQuestownStore((s) => s.importBackup);

  const percent = Math.round(record.completionRate * 100);
  const streak = useMemo(() => getStreakCount(recordsByDate, currentDateKey, dailyGoal), [recordsByDate, currentDateKey, dailyGoal]);
  const weekly = useMemo(() => getWeeklySummary(recordsByDate, currentDateKey, dailyGoal), [recordsByDate, currentDateKey, dailyGoal]);

  const feedback = useMemo(() => {
    if (record.completedCount === 0) return "첫 층을 올려볼까요?";
    if (record.completedCount >= dailyGoal) return "오늘 목표 달성! 멋져요 ✨";
    return cheers[record.completedCount % cheers.length];
  }, [record.completedCount, dailyGoal]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = addTodo(input);
    if (!result.ok) {
      setMessage(result.reason ?? "추가에 실패했어요.");
      return;
    }
    setInput("");
    setMessage(null);
  };

  const onGoalChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDailyGoal(Number(e.target.value));
  };

  const onBackupExport = () => {
    const data = exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `questown-backup-${currentDateKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("백업 파일을 저장했어요.");
  };

  const onBackupImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppBackupData;
      const result = importBackup(parsed);
      setMessage(result.ok ? "백업을 복원했어요." : result.reason ?? "복원에 실패했어요.");
    } catch {
      setMessage("JSON 파일을 읽지 못했어요.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Today · {record.date}</h2>
          <span className="rounded-full bg-quest-grass px-3 py-1 text-sm font-semibold">{feedback}</span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-orange-100 px-3 py-2 font-semibold">🔥 Streak {streak}일</div>
          <div className="rounded-2xl bg-indigo-100 px-3 py-2 font-semibold">🎯 목표 {dailyGoal}개</div>
        </div>

        {CssFramerBuildingRenderer.render({
          height,
          roofType: record.roofType,
          finalized: record.isFinalized
        })}

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-2xl bg-slate-100 p-2">완료 {record.completedCount}</div>
          <div className="rounded-2xl bg-slate-100 p-2">전체 {record.totalCount}</div>
          <div className="rounded-2xl bg-slate-100 p-2">완료율 {percent}%</div>
        </div>

        <div className="mt-2 text-center text-xs font-semibold text-slate-600">
          지붕 상태: {record.isFinalized ? record.roofType.toUpperCase() : "마감 전 (NONE)"}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button className="min-h-11 bg-quest-primary text-white" onClick={finalizeCurrentDay}>
            오늘 마감
          </Button>
          <Button className="min-h-11 bg-slate-200" onClick={unfinalizeCurrentDay}>
            마감 해제
          </Button>
          <Button className="min-h-11 bg-quest-accent text-slate-900 col-span-2" onClick={goNextDayForDev}>
            다음 날로 넘기기 (DEV)
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-base font-bold">이번 주 요약</h3>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-2xl bg-slate-100 p-2">완료 {weekly.completed}</div>
          <div className="rounded-2xl bg-slate-100 p-2">전체 {weekly.total}</div>
          <div className="rounded-2xl bg-slate-100 p-2">성공일 {weekly.successfulDays}/7</div>
        </div>
      </Card>

      <Card>
        <form onSubmit={onSubmit} className="mb-3 flex gap-2">
          <input
            aria-label="새 할 일 입력"
            value={input}
            maxLength={80}
            onChange={(e) => setInput(e.target.value)}
            placeholder="할 일을 입력하세요"
            className="min-h-11 flex-1 rounded-2xl border-2 border-slate-200 px-3 py-2 outline-none focus:border-quest-primary"
          />
          <Button type="submit" className="min-h-11 bg-quest-primary text-white">
            추가
          </Button>
        </form>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-semibold">일일 목표치 ({dailyGoal})</label>
          <input
            type="range"
            min={1}
            max={10}
            value={dailyGoal}
            onChange={onGoalChange}
            className="w-full"
            aria-label="일일 목표치 설정"
          />
        </div>

        {message ? <p className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-sm">{message}</p> : null}

        <ul className="space-y-2">
          {record.todos.map((todo) => (
            <li key={todo.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2">
              <input
                aria-label={`${todo.text} 완료 여부`}
                type="checkbox"
                checked={todo.completed}
                disabled={record.isFinalized}
                onChange={() => {
                  const result = toggleTodo(todo.id);
                  if (!result.ok) setMessage(result.reason ?? "수정할 수 없어요.");
                }}
                className="h-6 w-6"
              />
              <span className={`flex-1 ${todo.completed ? "text-slate-400 line-through" : ""}`}>{todo.text}</span>
              <Button
                aria-label={`${todo.text} 삭제`}
                className="min-h-11 bg-quest-danger px-3 py-2 text-white"
                onClick={() => {
                  const result = deleteTodo(todo.id);
                  if (!result.ok) setMessage(result.reason ?? "삭제할 수 없어요.");
                }}
                disabled={record.isFinalized}
              >
                삭제
              </Button>
            </li>
          ))}
          {record.todos.length === 0 ? <li className="text-sm text-slate-500">오늘 할 일을 추가해 주세요.</li> : null}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-2 text-base font-bold">백업 / 복원</h3>
        <div className="grid grid-cols-2 gap-2">
          <Button className="min-h-11 bg-slate-200" onClick={onBackupExport}>
            JSON 백업
          </Button>
          <Button className="min-h-11 bg-slate-200" onClick={() => fileInputRef.current?.click()}>
            JSON 복원
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={onBackupImport} />
      </Card>
    </div>
  );
}
