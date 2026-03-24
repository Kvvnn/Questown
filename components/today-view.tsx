"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedNumber } from "@/components/animated-number";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { RewardToastItem, RewardToasts } from "@/components/reward-toasts";
import { Button, Card } from "@/components/ui";
import { QuestAnimationEventType, idleQuestAnimationEvent } from "@/domain/animation";
import {
  getExecutionQueue,
  getFocusQuestIds,
  getWeeklyMainProgress,
  normalizeQuestPriority,
  priorityLabel
} from "@/domain/execution";
import { getFloorVisualStyle } from "@/domain/floor-style";
import { getStreakCount, getWeeklySummary } from "@/domain/progress";
import { getCompletedQuestTypes, questTypeLabel, questTypeOrder, questTypeShortLabel } from "@/domain/quest";
import { AppBackupData, QuestItem, QuestPriority, QuestType, RecurrencePattern } from "@/domain/types";
import { useQuestownStore, useTodayBuildingHeight, useTodayRecord } from "@/store/questown-store";

const sectionDescription: Record<QuestType, string> = {
  daily: "삶의 유지 · 루틴 리듬",
  main: "오늘의 전진 · 핵심 진도",
  sub: "미래 확장 · 성장 축적"
};

const sectionOrder: QuestType[] = ["main", "daily", "sub"];

const upbeatMessages = ["좋아, +1 Floor!", "Quest Complete!", "오늘 town이 자라고 있어요"];

const recurrenceLabel: Record<RecurrencePattern, string> = {
  none: "반복 없음",
  daily: "매일",
  weekdays: "평일",
  weekly: "매주",
  interval: "N일 간격"
};

const questTypeSelectorActiveClass: Record<QuestType, string> = {
  daily: "bg-gradient-to-r from-blue-500 to-cyan-500 text-white ring-2 ring-blue-200 shadow-[0_6px_0_rgba(59,130,246,0.22)]",
  main: "bg-gradient-to-r from-indigo-600 to-purple-600 text-white ring-2 ring-purple-200 shadow-[0_6px_0_rgba(99,102,241,0.28)]",
  sub: "bg-gradient-to-r from-emerald-500 to-teal-500 text-white ring-2 ring-emerald-200 shadow-[0_6px_0_rgba(16,185,129,0.24)]"
};

const priorityButtonClass: Record<QuestPriority, string> = {
  p1: "bg-rose-100 text-rose-700 border-rose-200",
  p2: "bg-amber-100 text-amber-700 border-amber-200",
  p3: "bg-slate-100 text-slate-700 border-slate-200"
};

const nextPriority: Record<QuestPriority, QuestPriority> = {
  p1: "p2",
  p2: "p3",
  p3: "p1"
};

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
  const [selectedPriority, setSelectedPriority] = useState<QuestPriority>("p1");
  const [selectedDependencyQuestId, setSelectedDependencyQuestId] = useState<string>("");
  const [focusMode, setFocusMode] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("none");
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState(2);
  const [carryOverEnabled, setCarryOverEnabled] = useState(true);
  const [carryOverLimit, setCarryOverLimit] = useState(3);
  const [message, setMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<RewardToastItem[]>([]);
  const [animationEvent, setAnimationEvent] = useState(idleQuestAnimationEvent);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const buildingPanelRef = useRef<HTMLDivElement | null>(null);
  const eventTimeoutRefs = useRef<number[]>([]);
  const toastTimeoutRefs = useRef<number[]>([]);
  const initializedRef = useRef(false);
  const toastIdRef = useRef(1);

  const dailyGoal = useQuestownStore((state) => state.dailyGoal);
  const weeklyMainTarget = useQuestownStore((state) => state.weeklyMainTarget);
  const recordsByDate = useQuestownStore((state) => state.recordsByDate);
  const currentDateKey = useQuestownStore((state) => state.currentDateKey);

  const addQuest = useQuestownStore((state) => state.addQuest);
  const toggleQuest = useQuestownStore((state) => state.toggleQuest);
  const deleteQuest = useQuestownStore((state) => state.deleteQuest);
  const updateQuestMeta = useQuestownStore((state) => state.updateQuestMeta);
  const finalizeCurrentDay = useQuestownStore((state) => state.finalizeCurrentDay);
  const unfinalizeCurrentDay = useQuestownStore((state) => state.unfinalizeCurrentDay);
  const goNextDayForDev = useQuestownStore((state) => state.goNextDayForDev);
  const setDailyGoal = useQuestownStore((state) => state.setDailyGoal);
  const setWeeklyMainTarget = useQuestownStore((state) => state.setWeeklyMainTarget);
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

  const executionQueue = useMemo(() => getExecutionQueue(record.quests), [record.quests]);
  const queueRankMap = useMemo(
    () => new Map(executionQueue.map((item, index) => [item.quest.id, index + 1])),
    [executionQueue]
  );
  const focusQuestIds = useMemo(() => new Set(getFocusQuestIds(record.quests, 3)), [record.quests]);

  const dependencyCandidates = useMemo(
    () =>
      record.quests.filter(
        (quest) =>
          !quest.completed &&
          !(selectedDependencyQuestId && selectedDependencyQuestId === quest.id) &&
          quest.title.trim().length > 0
      ),
    [record.quests, selectedDependencyQuestId]
  );

  const weeklyMainProgress = useMemo(
    () => getWeeklyMainProgress(recordsByDate, currentDateKey),
    [recordsByDate, currentDateKey]
  );
  const weeklyMainPercent = Math.round(weeklyMainProgress.rate * 100);

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

  const isQuestTitleEmpty = titleInput.trim().length === 0;

  const clearEventQueue = useCallback(() => {
    eventTimeoutRefs.current.forEach((id) => window.clearTimeout(id));
    eventTimeoutRefs.current = [];
  }, []);

  const scrollToBuilding = useCallback(() => {
    buildingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    const result = addQuest({
      title: titleInput,
      type: selectedType,
      priority: selectedPriority,
      dependencyQuestIds: selectedDependencyQuestId ? [selectedDependencyQuestId] : undefined,
      recurrencePattern,
      recurrenceIntervalDays: recurrencePattern === "interval" ? recurrenceIntervalDays : undefined,
      carryOverEnabled,
      carryOverLimit: carryOverEnabled ? carryOverLimit : undefined
    });

    if (!result.ok) {
      setMessage(result.reason ?? "추가에 실패했어요.");
      return;
    }

    setTitleInput("");
    setSelectedDependencyQuestId("");
    setMessage(null);
  };

  const onGoalChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDailyGoal(Number(e.target.value));
  };

  const onWeeklyMainTargetChange = (e: ChangeEvent<HTMLInputElement>) => {
    setWeeklyMainTarget(Number(e.target.value));
  };

  const onRecurrencePatternChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as RecurrencePattern;
    setRecurrencePattern(value);
    if (value !== "interval") {
      setRecurrenceIntervalDays(2);
    }
  };

  const onCarryOverEnabledChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCarryOverEnabled(e.target.checked);
  };

  const onCarryOverLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = Math.max(1, Math.min(14, Math.round(Number(e.target.value) || 1)));
    setCarryOverLimit(next);
  };

  const onFinalizeDay = () => {
    finalizeCurrentDay();
    scrollToBuilding();
  };

  const onUnfinalizeDay = () => {
    unfinalizeCurrentDay();
    scrollToBuilding();
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
    const visual = getFloorVisualStyle(type);
    const isMain = type === "main";
    const questMap = new Map(record.quests.map((quest) => [quest.id, quest] as const));

    const sectionQuests = [...questsByType[type]]
      .filter((quest) => (focusMode ? focusQuestIds.has(quest.id) : true))
      .sort((a, b) => (queueRankMap.get(a.id) ?? 999) - (queueRankMap.get(b.id) ?? 999));

    return (
      <section
        key={type}
        className={`rounded-2xl border p-3 ${
          isMain
            ? "border-purple-200 bg-gradient-to-br from-purple-50 via-white to-indigo-50 shadow-[0_10px_20px_rgba(99,102,241,0.18)]"
            : "border-white/70 bg-white/75"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-black text-slate-800">
              {visual.icon} {questTypeLabel[type]} {isMain ? <span className="ml-1 text-[11px] text-purple-600">(핵심)</span> : null}
            </h4>
            <p className="text-xs text-slate-500">{sectionDescription[type]}</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-bold ${visual.badgeClass}`}>
            {record.completedByType[type]}/{record.totalByType[type]}
          </span>
        </div>

        {sectionQuests.length === 0 ? (
          <p className="rounded-xl bg-white/80 px-2 py-2 text-xs text-slate-500">
            {focusMode ? "Focus 모드 기준 해당 타입의 우선 Quest가 없어요." : "아직 등록된 퀘스트가 없어요."}
          </p>
        ) : (
          <ul className="space-y-2">
            {sectionQuests.map((quest) => {
              const blockedByIds = (quest.dependencyQuestIds ?? []).filter((id) => {
                const dep = questMap.get(id);
                return dep ? !dep.completed : false;
              });
              const blockedByTitles = blockedByIds
                .map((id) => questMap.get(id)?.title)
                .filter((title): title is string => Boolean(title));

              const priority = normalizeQuestPriority(quest.priority, quest.type);
              const rank = queueRankMap.get(quest.id);

              return (
                <li key={quest.id} className="space-y-1 rounded-xl bg-white/80 p-2">
                  <div className="flex items-start gap-2">
                    <input
                      aria-label={`${quest.title} 완료 여부`}
                      type="checkbox"
                      checked={quest.completed}
                      disabled={record.isFinalized || blockedByIds.length > 0}
                      onChange={() => {
                        const wasCompleted = quest.completed;
                        const result = toggleQuest(quest.id);
                        if (!result.ok) {
                          setMessage(result.reason ?? "수정할 수 없어요.");
                          return;
                        }

                        setMessage(null);
                        if (!wasCompleted) scrollToBuilding();
                      }}
                      className="mt-1 h-5 w-5"
                    />

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`text-sm ${quest.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>
                          {quest.title}
                        </span>

                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${priorityButtonClass[priority]}`}>
                          {priorityLabel[priority]}
                        </span>

                        {rank ? (
                          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                            Queue #{rank}
                          </span>
                        ) : null}

                        {quest.focusPinned ? (
                          <span className="rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">
                            Focus Pin
                          </span>
                        ) : null}

                        {blockedByIds.length > 0 ? (
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            Blocked
                          </span>
                        ) : null}
                      </div>

                      {blockedByTitles.length > 0 ? (
                        <p className="mt-1 text-[11px] font-semibold text-rose-600">
                          선행 필요: {blockedByTitles.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      className="min-h-8 bg-slate-100 px-2 py-1 text-xs"
                      disabled={record.isFinalized}
                      onClick={() => {
                        const result = updateQuestMeta(quest.id, { priority: nextPriority[priority] });
                        if (!result.ok) setMessage(result.reason ?? "우선순위를 변경할 수 없어요.");
                        else setMessage(null);
                      }}
                    >
                      우선순위 변경
                    </Button>

                    <Button
                      type="button"
                      className="min-h-8 bg-slate-100 px-2 py-1 text-xs"
                      disabled={record.isFinalized}
                      onClick={() => {
                        const result = updateQuestMeta(quest.id, { focusPinned: !quest.focusPinned });
                        if (!result.ok) setMessage(result.reason ?? "Focus 핀을 변경할 수 없어요.");
                        else setMessage(null);
                      }}
                    >
                      {quest.focusPinned ? "Focus 해제" : "Focus 고정"}
                    </Button>

                    <Button
                      aria-label={`${quest.title} 삭제`}
                      className="min-h-8 bg-quest-danger px-2 py-1 text-xs text-white"
                      disabled={record.isFinalized}
                      onClick={() => {
                        const confirmed = window.confirm(`'${quest.title}' 퀘스트를 삭제할까요?`);
                        if (!confirmed) return;

                        const result = deleteQuest(quest.id);
                        if (!result.ok) setMessage(result.reason ?? "삭제할 수 없어요.");
                        else setMessage(null);
                      }}
                    >
                      삭제
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4" id="today-panel-content">
      <RewardToasts toasts={toasts} />

      <div
        ref={buildingPanelRef}
        className="sticky top-2 z-20 h-[32vh] min-h-[170px] max-h-[240px] overflow-y-auto rounded-3xl"
      >
        <Card className="relative overflow-hidden p-3" aria-labelledby="today-title">
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
            onClick={onFinalizeDay}
            disabled={record.isFinalized}
          >
            오늘 마감
          </Button>
          <Button className="min-h-11 bg-slate-100" onClick={onUnfinalizeDay} disabled={!record.isFinalized}>
            마감 해제
          </Button>
          <Button className="col-span-2 min-h-11 bg-quest-accent text-slate-900" onClick={goNextDayForDev}>
            다음 날로 넘기기 (DEV)
          </Button>
        </div>
        </Card>
      </div>

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
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedType(type);
                    setSelectedPriority(normalizeQuestPriority(undefined, type));
                    if (type === "daily" && recurrencePattern === "none") {
                      setRecurrencePattern("daily");
                    }
                    if (type === "main" && !carryOverEnabled) {
                      setCarryOverEnabled(true);
                    }
                  }}
                  className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-bold transition ${
                    active
                      ? `${questTypeSelectorActiveClass[type]} border-transparent`
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {visual.icon} {questTypeShortLabel[type]}
                </button>
              );
            })}
          </div>

          <p className="text-xs font-semibold text-slate-600">
            현재 선택: {questTypeLabel[selectedType]} · {sectionDescription[selectedType]}
          </p>

          <div className="grid grid-cols-3 gap-2">
            {(["p1", "p2", "p3"] as QuestPriority[]).map((priority) => {
              const active = selectedPriority === priority;
              return (
                <button
                  key={priority}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedPriority(priority)}
                  className={`min-h-10 rounded-xl border px-2 py-1 text-xs font-bold transition ${
                    active
                      ? `${priorityButtonClass[priority]} ring-2 ring-offset-1 ring-slate-200`
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  Priority {priorityLabel[priority]}
                </button>
              );
            })}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">선행 Quest (선택)</label>
            <select
              value={selectedDependencyQuestId}
              onChange={(e) => setSelectedDependencyQuestId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              aria-label="선행 퀘스트 선택"
            >
              <option value="">없음</option>
              {dependencyCandidates.map((quest) => (
                <option key={quest.id} value={quest.id}>
                  [{questTypeShortLabel[quest.type]}] {quest.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <input
              aria-label="새 퀘스트 입력"
              aria-invalid={isQuestTitleEmpty}
              value={titleInput}
              maxLength={80}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="예: 오늘 편집본 완성"
              className="min-h-11 flex-1 rounded-2xl border-2 border-slate-200 px-3 py-2 outline-none focus:border-quest-primary"
            />
            <Button type="submit" className="min-h-11 bg-quest-primary text-white" disabled={isQuestTitleEmpty}>
              추가
            </Button>
          </div>
        </form>

        <p id="quest-input-hint" className="text-xs text-slate-500">
          Daily/Main/Sub 중 타입을 먼저 고르고 퀘스트를 추가하세요.
        </p>

        <div className="mt-3 soft-panel space-y-3">
          <div>
            <label className="mb-1 block text-sm font-semibold">반복 규칙</label>
            <select
              value={recurrencePattern}
              onChange={onRecurrencePatternChange}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              aria-label="퀘스트 반복 규칙"
            >
              {(Object.keys(recurrenceLabel) as RecurrencePattern[]).map((pattern) => (
                <option key={pattern} value={pattern}>
                  {recurrenceLabel[pattern]}
                </option>
              ))}
            </select>
          </div>

          {recurrencePattern === "interval" ? (
            <div>
              <label className="mb-1 block text-sm font-semibold">간격 일수 ({recurrenceIntervalDays}일)</label>
              <input
                type="range"
                min={1}
                max={14}
                value={recurrenceIntervalDays}
                onChange={(e) => setRecurrenceIntervalDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-full accent-indigo-500"
                aria-label="반복 간격 일수 설정"
              />
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={carryOverEnabled} onChange={onCarryOverEnabledChange} className="h-4 w-4" />
              미완료 Quest를 다음 날로 이월
            </label>

            {carryOverEnabled ? (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">최대 이월 횟수 ({carryOverLimit})</label>
                <input
                  type="range"
                  min={1}
                  max={14}
                  value={carryOverLimit}
                  onChange={onCarryOverLimitChange}
                  className="w-full accent-orange-500"
                  aria-label="최대 이월 횟수 설정"
                />
              </div>
            ) : null}
          </div>
        </div>

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
        <h3 className="mb-2 text-base font-bold">실행 가이드 (Phase 2)</h3>

        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
          <label className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
            <span>Focus 모드 (지금 할 3개만 보기)</span>
            <input
              type="checkbox"
              checked={focusMode}
              onChange={(e) => setFocusMode(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </div>

        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            주간 Main Quest 목표치 ({weeklyMainTarget})
          </label>
          <input
            type="range"
            min={1}
            max={30}
            value={weeklyMainTarget}
            onChange={onWeeklyMainTargetChange}
            className="w-full accent-purple-500"
            aria-label="주간 Main Quest 목표치"
          />

          <div className="mt-2 text-xs text-slate-600">
            진행: {weeklyMainProgress.completed}/{weeklyMainTarget} · 실제 완료율 {weeklyMainPercent}%
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <h4 className="mb-2 text-sm font-bold text-slate-700">추천 실행 순서</h4>
          {executionQueue.length === 0 ? (
            <p className="text-xs text-slate-500">진행 가능한 미완료 Quest가 없어요.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {executionQueue.slice(0, 5).map((item, index) => (
                <li key={item.quest.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1">
                  <span>
                    {index + 1}. [{questTypeShortLabel[item.quest.type]}] {item.quest.title}
                  </span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${priorityButtonClass[item.priority]}`}>
                    {priorityLabel[item.priority]}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
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
