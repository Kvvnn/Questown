"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { RewardToastItem, RewardToasts } from "@/components/reward-toasts";
import { Button, Card } from "@/components/ui";
import { QuestAnimationEventType, idleQuestAnimationEvent } from "@/domain/animation";
import { getStreakCount, getWeeklySummary } from "@/domain/progress";
import { AppBackupData } from "@/domain/types";
import { useQuestownStore, useTodayBuildingHeight, useTodayRecord } from "@/store/questown-store";

const cheers = ["좋아, 1층 완성!", "오늘 town이 자라고 있어요", "지붕까지 거의 다 왔어요"];

export function TodayView() {
  const record = useTodayRecord();
  const height = useTodayBuildingHeight();
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<RewardToastItem[]>([]);
  const [animationEvent, setAnimationEvent] = useState(idleQuestAnimationEvent);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timeoutRefs = useRef<number[]>([]);
  const initializedRef = useRef(false);
  const toastIdRef = useRef(1);

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

  const reduceMotion = !!useReducedMotion();

  const percent = Math.round(record.completionRate * 100);
  const streak = useMemo(
    () => getStreakCount(recordsByDate, currentDateKey, dailyGoal),
    [recordsByDate, currentDateKey, dailyGoal]
  );
  const weekly = useMemo(
    () => getWeeklySummary(recordsByDate, currentDateKey, dailyGoal),
    [recordsByDate, currentDateKey, dailyGoal]
  );
  const weeklyPercent = Math.round(weekly.completionRate * 100);

  const previousRef = useRef({
    completedCount: record.completedCount,
    isFinalized: record.isFinalized,
    streak
  });

  const feedback = useMemo(() => {
    if (record.completedCount === 0) return "첫 층을 올려볼까요?";
    if (record.completedCount >= dailyGoal) return "오늘 목표 달성! 멋져요 ✨";
    return cheers[record.completedCount % cheers.length];
  }, [record.completedCount, dailyGoal]);

  const pushToast = useCallback((text: string, tone: RewardToastItem["tone"] = "info") => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;

    setToasts((prev) => [...prev, { id, text, tone }]);

    const timeout = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2200);

    timeoutRefs.current.push(timeout);
  }, []);

  const triggerAnimation = useCallback((type: QuestAnimationEventType) => {
    setAnimationEvent((prev) => ({ type, token: prev.token + 1 }));
  }, []);

  const triggerReward = useCallback(
    (type: QuestAnimationEventType, text: string, tone: RewardToastItem["tone"]) => {
      triggerAnimation(type);
      pushToast(text, tone);
    },
    [pushToast, triggerAnimation]
  );

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      previousRef.current = {
        completedCount: record.completedCount,
        isFinalized: record.isFinalized,
        streak
      };
      return;
    }

    const prev = previousRef.current;
    const queue: Array<{ type: QuestAnimationEventType; text: string; tone: RewardToastItem["tone"] }> = [];

    if (record.completedCount > prev.completedCount) {
      queue.push({
        type: "todo-complete",
        text: `🧱 ${record.completedCount}층 완성!`,
        tone: "success"
      });

      if (prev.completedCount < dailyGoal && record.completedCount >= dailyGoal) {
        queue.push({
          type: "goal-reached",
          text: "🎯 목표 달성! 오늘 타운이 빛나요",
          tone: "epic"
        });
      }
    }

    if (!prev.isFinalized && record.isFinalized) {
      queue.push({
        type: "day-finalized",
        text: `🏠 하루 마감 완료 (${percent}%)`,
        tone: "info"
      });
    }

    if (streak > prev.streak) {
      queue.push({
        type: "streak-up",
        text: `🔥 ${streak}일 연속 달성!`,
        tone: "epic"
      });
    }

    queue.forEach((event, index) => {
      const timeout = window.setTimeout(() => {
        triggerReward(event.type, event.text, event.tone);
      }, index * 240);

      timeoutRefs.current.push(timeout);
    });

    previousRef.current = {
      completedCount: record.completedCount,
      isFinalized: record.isFinalized,
      streak
    };
  }, [dailyGoal, percent, record.completedCount, record.isFinalized, streak, triggerReward]);

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
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `questown-backup-${currentDateKey}.json`;
    anchor.click();
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
      <RewardToasts toasts={toasts} />

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-indigo-200/40 blur-2xl" />

        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Questown Daily</p>
            <h2 className="text-xl font-black">Today · {record.date}</h2>
          </div>
          <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-sm font-semibold">{feedback}</span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
          <div className="metric-pill bg-orange-100/80">🔥 Streak {streak}일</div>
          <div className="metric-pill bg-indigo-100/80">🎯 목표 {dailyGoal}개</div>
        </div>

        {CssFramerBuildingRenderer.render({
          height,
          roofType: record.roofType,
          finalized: record.isFinalized,
          animationEvent,
          reducedMotion: reduceMotion
        })}

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="metric-pill">완료 {record.completedCount}</div>
          <div className="metric-pill">전체 {record.totalCount}</div>
          <div className="metric-pill">완료율 {percent}%</div>
        </div>

        <div className="mt-2 text-center text-xs font-semibold text-slate-600">
          지붕 상태: {record.isFinalized ? record.roofType.toUpperCase() : "마감 전 (NONE)"}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            className="min-h-11 bg-quest-primary text-white"
            onClick={finalizeCurrentDay}
            disabled={record.isFinalized}
          >
            오늘 마감
          </Button>
          <Button className="min-h-11 bg-slate-100" onClick={unfinalizeCurrentDay} disabled={!record.isFinalized}>
            마감 해제
          </Button>
          <Button className="col-span-2 min-h-11 bg-quest-accent text-slate-900" onClick={goNextDayForDev}>
            다음 날로 넘기기 (DEV)
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-base font-bold">이번 주 요약</h3>
        <div className="mb-2 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="metric-pill">완료 {weekly.completed}</div>
          <div className="metric-pill">전체 {weekly.total}</div>
          <div className="metric-pill">성공일 {weekly.successfulDays}/7</div>
        </div>
        <div className="soft-panel">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>주간 페이스</span>
            <span>{weeklyPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-indigo-500"
              animate={{ width: `${weeklyPercent}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
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

        <div className="mb-3 soft-panel">
          <label className="mb-1 block text-sm font-semibold">일일 목표치 ({dailyGoal})</label>
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

        {message ? <p className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-sm">{message}</p> : null}

        <ul className="space-y-2">
          {record.todos.map((todo) => (
            <li key={todo.id} className="flex items-center gap-2 rounded-2xl bg-slate-50/80 p-2">
              <input
                aria-label={`${todo.text} 완료 여부`}
                type="checkbox"
                checked={todo.completed}
                disabled={record.isFinalized}
                onChange={() => {
                  const result = toggleTodo(todo.id);
                  if (!result.ok) setMessage(result.reason ?? "수정할 수 없어요.");
                  else setMessage(null);
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
                  else setMessage(null);
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
          <Button className="min-h-11 bg-slate-100" onClick={onBackupExport}>
            JSON 백업
          </Button>
          <Button className="min-h-11 bg-slate-100" onClick={() => fileInputRef.current?.click()}>
            JSON 복원
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={onBackupImport} />
      </Card>
    </div>
  );
}
