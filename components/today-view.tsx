"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedNumber } from "@/components/animated-number";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { RewardToastItem, RewardToasts } from "@/components/reward-toasts";
import { Button, Card } from "@/components/ui";
import { QuestAnimationEventType, idleQuestAnimationEvent } from "@/domain/animation";
import { getFloorVisualStyle } from "@/domain/floor-style";
import { getStreakCount, getWeeklySummary } from "@/domain/progress";
import { getCompletedQuestTypes, questTypeLabel, questTypeOrder, questTypeShortLabel } from "@/domain/quest";
import { AppBackupData, QuestItem, QuestType } from "@/domain/types";
import { useQuestownStore, useTodayBuildingHeight, useTodayRecord } from "@/store/questown-store";

const sectionDescription: Record<QuestType, string> = {
  daily: "삶의 유지 · 루틴 리듬",
  main: "오늘의 전진 · 핵심 진도",
  sub: "미래 확장 · 성장 축적"
};

const sectionOrder: QuestType[] = ["daily", "main", "sub"];

const upbeatMessages = ["좋아, +1 Floor!", "Quest Complete!", "오늘 town이 자라고 있어요"];

const getRoofFeedback = (completionRate: number) => {
  if (completionRate >= 0.8) return "🏆 High Roof! 오늘 하루 정말 잘 마무리했어요.";
  if (completionRate >= 0.4) return "👍 Mid Roof! 내일 한 걸음 더 가봐요.";
  return "🌤️ Low Roof! 그래도 오늘의 건물은 세워졌어요.";
};

export function TodayView() {
  const record = useTodayRecord();
  const height = useTodayBuildingHeight();
  const [titleInput, setTitleInput] = useState("");
  const [selectedType, setSelectedType] = useState<QuestType>("main");
  const [message, setMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<RewardToastItem[]>([]);
  const [animationEvent, setAnimationEvent] = useState(idleQuestAnimationEvent);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const eventTimeoutRefs = useRef<number[]>([]);
  const toastTimeoutRefs = useRef<number[]>([]);
  const initializedRef = useRef(false);
  const toastIdRef = useRef(1);

  const dailyGoal = useQuestownStore((state) => state.dailyGoal);
  const recordsByDate = useQuestownStore((state) => state.recordsByDate);
  const currentDateKey = useQuestownStore((state) => state.currentDateKey);

  const addQuest = useQuestownStore((state) => state.addQuest);
  const toggleQuest = useQuestownStore((state) => state.toggleQuest);
  const deleteQuest = useQuestownStore((state) => state.deleteQuest);
  const finalizeCurrentDay = useQuestownStore((state) => state.finalizeCurrentDay);
  const unfinalizeCurrentDay = useQuestownStore((state) => state.unfinalizeCurrentDay);
  const goNextDayForDev = useQuestownStore((state) => state.goNextDayForDev);
  const setDailyGoal = useQuestownStore((state) => state.setDailyGoal);
  const exportBackup = useQuestownStore((state) => state.exportBackup);
  const importBackup = useQuestownStore((state) => state.importBackup);

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
  const completedQuestTypes = useMemo(() => getCompletedQuestTypes(record.quests), [record.quests]);

  const questsByType = useMemo(() => {
    return sectionOrder.reduce<Record<QuestType, QuestItem[]>>(
      (acc, type) => {
        acc[type] = record.quests.filter((quest) => quest.type === type);
        return acc;
      },
      {
        daily: [],
        main: [],
        sub: []
      }
    );
  }, [record.quests]);

  const previousRef = useRef({
    completedCount: record.completedCount,
    isFinalized: record.isFinalized,
    streak
  });

  const feedback = useMemo(() => {
    if (record.completedCount === 0) return "첫 퀘스트를 완료하고 1층을 올려보세요.";
    if (record.completedCount >= dailyGoal) return "오늘 목표 달성! 마감하면 지붕이 완성돼요.";
    return upbeatMessages[record.completedCount % upbeatMessages.length];
  }, [dailyGoal, record.completedCount]);

  const clearEventQueue = useCallback(() => {
    eventTimeoutRefs.current.forEach((id) => window.clearTimeout(id));
    eventTimeoutRefs.current = [];
  }, []);

  const pushToast = useCallback((text: string, tone: RewardToastItem["tone"] = "info") => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;

    setToasts((prev) => [...prev, { id, text, tone }]);

    const timeout = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2200);

    toastTimeoutRefs.current.push(timeout);
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
      clearEventQueue();
      toastTimeoutRefs.current.forEach((id) => window.clearTimeout(id));
      toastTimeoutRefs.current = [];
    };
  }, [clearEventQueue]);

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
        type: "quest-complete",
        text: "+1 Floor · Quest Complete",
        tone: "success"
      });

      if (prev.completedCount < dailyGoal && record.completedCount >= dailyGoal) {
        queue.push({
          type: "goal-reached",
          text: "🎯 Daily Goal Complete",
          tone: "epic"
        });
      }
    }

    if (!prev.isFinalized && record.isFinalized) {
      queue.push({
        type: "day-finalized",
        text: getRoofFeedback(record.completionRate),
        tone: record.completionRate >= 0.8 ? "epic" : "info"
      });
    }

    if (streak > prev.streak) {
      queue.push({
        type: "streak-up",
        text: `🔥 ${streak}일 연속 퀘스트 달성!`,
        tone: "epic"
      });
    }

    clearEventQueue();

    queue.forEach((event, index) => {
      const timeout = window.setTimeout(() => {
        triggerReward(event.type, event.text, event.tone);
      }, index * 220);

      eventTimeoutRefs.current.push(timeout);
    });

    previousRef.current = {
      completedCount: record.completedCount,
      isFinalized: record.isFinalized,
      streak
    };
  }, [
    clearEventQueue,
    dailyGoal,
    record.completedCount,
    record.completionRate,
    record.isFinalized,
    streak,
    triggerReward
  ]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = addQuest(titleInput, selectedType);
    if (!result.ok) {
      setMessage(result.reason ?? "추가에 실패했어요.");
      return;
    }

    setTitleInput("");
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

  const renderQuestSection = (type: QuestType) => {
    const quests = questsByType[type];
    const visual = getFloorVisualStyle(type);
    const isMain = type === "main";

    return (
      <section
        key={type}
        className={`rounded-2xl border border-white/70 p-3 ${isMain ? "bg-purple-50/85 shadow" : "bg-white/70"}`}
      >
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-black text-slate-800">
              {visual.icon} {questTypeLabel[type]}
            </h4>
            <p className="text-xs text-slate-500">{sectionDescription[type]}</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-bold ${visual.badgeClass}`}>
            {record.completedByType[type]}/{record.totalByType[type]}
          </span>
        </div>

        {quests.length === 0 ? (
          <p className="rounded-xl bg-white/80 px-2 py-2 text-xs text-slate-500">아직 등록된 퀘스트가 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {quests.map((quest) => (
              <li key={quest.id} className="flex items-center gap-2 rounded-xl bg-white/80 p-2">
                <input
                  aria-label={`${quest.title} 완료 여부`}
                  type="checkbox"
                  checked={quest.completed}
                  disabled={record.isFinalized}
                  onChange={() => {
                    const result = toggleQuest(quest.id);
                    if (!result.ok) setMessage(result.reason ?? "수정할 수 없어요.");
                    else setMessage(null);
                  }}
                  className="h-5 w-5"
                />
                <span className={`flex-1 text-sm ${quest.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {quest.title}
                </span>
                <Button
                  aria-label={`${quest.title} 삭제`}
                  className="min-h-10 bg-quest-danger px-3 py-2 text-white"
                  disabled={record.isFinalized}
                  onClick={() => {
                    const result = deleteQuest(quest.id);
                    if (!result.ok) setMessage(result.reason ?? "삭제할 수 없어요.");
                    else setMessage(null);
                  }}
                >
                  삭제
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4" id="today-panel-content">
      <RewardToasts toasts={toasts} />

      <Card className="relative overflow-hidden" aria-labelledby="today-title">
        <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-indigo-200/40 blur-2xl" />

        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Questown Daily Log</p>
            <h2 id="today-title" className="text-xl font-black">
              Today · {record.date}
            </h2>
          </div>
          <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-sm font-semibold">{feedback}</span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
          <div className="metric-pill bg-orange-100/80">
            🔥 Streak <AnimatedNumber value={streak} />일
          </div>
          <div className="metric-pill bg-indigo-100/80">
            🎯 목표 <AnimatedNumber value={dailyGoal} />개
          </div>
        </div>

        {CssFramerBuildingRenderer.render({
          height,
          roofType: record.roofType,
          finalized: record.isFinalized,
          animationEvent,
          reducedMotion: reduceMotion,
          completedQuestTypes
        })}

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm" aria-live="polite">
          <div className="metric-pill">
            완료 <AnimatedNumber value={record.completedCount} />
          </div>
          <div className="metric-pill">
            전체 <AnimatedNumber value={record.totalCount} />
          </div>
          <div className="metric-pill">
            완료율 <AnimatedNumber value={percent} />%
          </div>
        </div>

        <div className="mt-2 text-center text-xs font-semibold text-slate-600" aria-live="polite">
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
        <h3 className="mb-2 text-base font-bold">퀘스트 추가</h3>
        <form onSubmit={onSubmit} className="mb-3 space-y-2" aria-describedby="quest-input-hint">
          <div className="grid grid-cols-3 gap-2">
            {questTypeOrder.map((type) => {
              const visual = getFloorVisualStyle(type);
              const active = selectedType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-bold transition ${
                    active
                      ? `${visual.badgeClass} border-transparent`
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {visual.icon} {questTypeShortLabel[type]}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input
              aria-label="새 퀘스트 입력"
              value={titleInput}
              maxLength={80}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="예: 오늘 편집본 완성"
              className="min-h-11 flex-1 rounded-2xl border-2 border-slate-200 px-3 py-2 outline-none focus:border-quest-primary"
            />
            <Button type="submit" className="min-h-11 bg-quest-primary text-white">
              추가
            </Button>
          </div>
        </form>

        <p id="quest-input-hint" className="text-xs text-slate-500">
          Daily/Main/Sub 중 타입을 먼저 고르고 퀘스트를 추가하세요.
        </p>

        <div className="mt-3 soft-panel">
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

        {message ? (
          <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}
      </Card>

      <Card>
        <h3 className="mb-2 text-base font-bold">퀘스트 섹션</h3>
        <div className="space-y-3">{sectionOrder.map((type) => renderQuestSection(type))}</div>
      </Card>

      <Card>
        <h3 className="mb-2 text-base font-bold">이번 주 요약</h3>
        <div className="mb-2 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="metric-pill">
            완료 <AnimatedNumber value={weekly.completed} />
          </div>
          <div className="metric-pill">
            전체 <AnimatedNumber value={weekly.total} />
          </div>
          <div className="metric-pill">
            성공일 <AnimatedNumber value={weekly.successfulDays} />/7
          </div>
        </div>

        <div className="soft-panel">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>주간 페이스</span>
            <span>
              <AnimatedNumber value={weeklyPercent} />%
            </span>
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
