"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedNumber } from "@/components/animated-number";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { RewardToastItem, RewardToasts } from "@/components/reward-toasts";
import { Button, Card } from "@/components/ui";
import { QuestAnimationEventType, idleQuestAnimationEvent } from "@/domain/animation";
import { roofTypeLabel } from "@/domain/building";
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

const upbeatMessages = ["좋아, +1층!", "퀘스트 완료!", "오늘 타운이 자라고 있어요"];

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
  if (completionRate >= 0.8) return "🏆 완성 지붕! 오늘 하루를 정말 잘 마무리했어요.";
  if (completionRate >= 0.4) return "👍 안정 지붕! 내일 한 걸음 더 가봐요.";
  return "🌤️ 기초 지붕! 그래도 오늘의 건물은 세워졌어요.";
};

export function TodayView() {
  const record = useTodayRecord();
  const height = useTodayBuildingHeight();
  const [titleInput, setTitleInput] = useState("");
  const [hasTriedEmptySubmit, setHasTriedEmptySubmit] = useState(false);
  const [selectedType, setSelectedType] = useState<QuestType>("main");
  const [selectedPriority, setSelectedPriority] = useState<QuestPriority>("p1");
  const [selectedDependencyQuestId, setSelectedDependencyQuestId] = useState<string>("");
  const [focusMode, setFocusMode] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("none");
  const [isRecurrenceAutoSelected, setIsRecurrenceAutoSelected] = useState(false);
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState(2);
  const [carryOverEnabled, setCarryOverEnabled] = useState(true);
  const [carryOverLimit, setCarryOverLimit] = useState(3);
  const [message, setMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<RewardToastItem[]>([]);
  const [animationEvent, setAnimationEvent] = useState(idleQuestAnimationEvent);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
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
  const showDevTools = process.env.NODE_ENV !== "production";

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
  const questMap = useMemo(() => new Map(record.quests.map((quest) => [quest.id, quest] as const)), [record.quests]);

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
  const visibleExecutionQueue = useMemo(
    () => (focusMode ? executionQueue.filter((item) => focusQuestIds.has(item.quest.id)) : executionQueue),
    [executionQueue, focusMode, focusQuestIds]
  );
  const completedQuests = useMemo(
    () =>
      record.quests
        .filter((quest) => quest.completed)
        .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)),
    [record.quests]
  );

  const dependencyCandidates = useMemo(
    () => record.quests.filter((quest) => !quest.completed && quest.title.trim().length > 0),
    [record.quests]
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
  const isAddLocked = record.isFinalized;

  const isQuestTitleEmpty = titleInput.trim().length === 0;
  const showQuestTitleError = hasTriedEmptySubmit && isQuestTitleEmpty;

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
        text: "+1층 · 퀘스트 완료",
        tone: "success"
      });

      if (prev.completedCount < dailyGoal && record.completedCount >= dailyGoal) {
        queue.push({
          type: "goal-reached",
          text: "🎯 오늘 목표 달성",
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

  useEffect(() => {
    if (!selectedDependencyQuestId) return;

    const stillAvailable = dependencyCandidates.some((quest) => quest.id === selectedDependencyQuestId);
    if (!stillAvailable) {
      setSelectedDependencyQuestId("");
    }
  }, [dependencyCandidates, selectedDependencyQuestId]);

  const handleSelectType = (type: QuestType) => {
    setSelectedType(type);
    setSelectedPriority(normalizeQuestPriority(undefined, type));

    if (type === "daily" && recurrencePattern === "none") {
      setRecurrencePattern("daily");
      setIsRecurrenceAutoSelected(true);
    } else if (type !== "daily" && recurrencePattern === "daily" && isRecurrenceAutoSelected) {
      setRecurrencePattern("none");
      setIsRecurrenceAutoSelected(false);
    }

    if (type === "main" && !carryOverEnabled) {
      setCarryOverEnabled(true);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = titleInput.trim();

    if (!trimmedTitle) {
      setHasTriedEmptySubmit(true);
      setMessage("퀘스트를 입력해 주세요.");
      titleInputRef.current?.focus();
      return;
    }

    const result = addQuest({
      title: trimmedTitle,
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
    setHasTriedEmptySubmit(false);
    setSelectedDependencyQuestId("");
    setMessage(null);
    titleInputRef.current?.focus();
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
    setIsRecurrenceAutoSelected(false);
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
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 0);
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

  const renderQuestItem = (
    quest: QuestItem,
    options: {
      showTypeBadge?: boolean;
      showExecutionMeta?: boolean;
    } = {}
  ) => {
    const { showTypeBadge = false, showExecutionMeta = false } = options;
    const blockedByIds = (quest.dependencyQuestIds ?? []).filter((id) => {
      const dep = questMap.get(id);
      return dep ? !dep.completed : false;
    });
    const blockedByTitles = blockedByIds.map((id) => questMap.get(id)?.title).filter((title): title is string => Boolean(title));
    const priority = normalizeQuestPriority(quest.priority, quest.type);
    const rank = queueRankMap.get(quest.id);
    const typeVisual = getFloorVisualStyle(quest.type);
    const isBlocked = !quest.completed && blockedByIds.length > 0;

    return (
      <li
        key={quest.id}
        className="rounded-2xl border border-white/70 bg-white/85 p-3 shadow-[0_6px_18px_rgba(15,23,42,0.06)]"
      >
        <div className="flex items-start gap-3">
          <input
            aria-label={`${quest.title} 완료 여부`}
            type="checkbox"
            checked={quest.completed}
            disabled={record.isFinalized || isBlocked}
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
            className="mt-1 h-5 w-5 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-sm font-medium ${quest.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>
                {quest.title}
              </span>

              {showTypeBadge ? (
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${typeVisual.badgeClass}`}>
                  {typeVisual.icon} {questTypeShortLabel[quest.type]}
                </span>
              ) : null}

              {showExecutionMeta ? (
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${priorityButtonClass[priority]}`}>
                  {priorityLabel[priority]}
                </span>
              ) : null}

              {showExecutionMeta && rank ? (
                <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                  순서 {rank}
                </span>
              ) : null}

              {showExecutionMeta && quest.focusPinned ? (
                <span className="rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">
                  집중 고정
                </span>
              ) : null}

              {isBlocked ? (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                  대기
                </span>
              ) : null}
            </div>

            {isBlocked ? (
              <p className="mt-1 text-[11px] font-semibold text-rose-600">선행 필요: {blockedByTitles.join(", ")}</p>
            ) : null}

            <details className="disclosure mt-2">
              <summary className="disclosure-summary-inline">
                <span>... 더보기</span>
                <span aria-hidden="true" className="disclosure-caret">
                  ▾
                </span>
              </summary>

              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-2">
                <div className="mb-2 flex flex-wrap gap-1">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${priorityButtonClass[priority]}`}>
                    {priorityLabel[priority]}
                  </span>
                  {rank ? (
                    <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                      순서 {rank}
                    </span>
                  ) : null}
                  {quest.focusPinned ? (
                    <span className="rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">
                      집중 고정
                    </span>
                  ) : null}
                  {(quest.dependencyQuestIds ?? []).length > 0 ? (
                    <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                      선행 {(quest.dependencyQuestIds ?? []).length}개
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    className="min-h-8 bg-white px-2 py-1 text-xs"
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
                    className="min-h-8 bg-white px-2 py-1 text-xs"
                    disabled={record.isFinalized}
                    onClick={() => {
                      const result = updateQuestMeta(quest.id, { focusPinned: !quest.focusPinned });
                      if (!result.ok) setMessage(result.reason ?? "집중 고정을 변경할 수 없어요.");
                      else setMessage(null);
                    }}
                  >
                    {quest.focusPinned ? "집중 해제" : "집중 고정"}
                  </Button>

                  <Button
                    type="button"
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
              </div>
            </details>
          </div>
        </div>
      </li>
    );
  };

  const renderQuestSection = (type: QuestType) => {
    const visual = getFloorVisualStyle(type);
    const isMain = type === "main";
    const sectionQuests = [...questsByType[type]]
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
          <p className="rounded-xl bg-white/80 px-2 py-2 text-xs text-slate-500">아직 등록된 퀘스트가 없어요.</p>
        ) : (
          <ul className="space-y-2">{sectionQuests.map((quest) => renderQuestItem(quest, { showExecutionMeta: true }))}</ul>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4" id="today-panel-content">
      <RewardToasts toasts={toasts} />

      <div className="sticky top-2 z-20">
        <Card className="relative overflow-hidden p-3" aria-label="오늘 요약 HUD">
          <div className="pointer-events-none absolute -right-10 -top-12 h-24 w-24 rounded-full bg-indigo-200/40 blur-2xl" />

          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">오늘</p>
              <p className="text-sm font-black text-slate-800">{record.date}</p>
            </div>

            <div className="grid grid-cols-2 gap-1 text-[11px] font-bold sm:grid-cols-2">
              <span className="rounded-lg bg-indigo-100 px-2 py-1 text-indigo-700">
                완료 <AnimatedNumber value={record.completedCount} /> / <AnimatedNumber value={record.totalCount} />
              </span>
              <span className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-700">
                <AnimatedNumber value={percent} />%
              </span>
            </div>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
              animate={{ width: `${percent}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
        </Card>
      </div>

      <div ref={buildingPanelRef}>
        <Card className="relative overflow-hidden p-3" aria-labelledby="today-title">
          <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-indigo-200/40 blur-2xl" />

          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">빌딩 현황</p>
              <h2 id="today-title" className="text-lg font-black">
                오늘의 건물
              </h2>
              <p className="text-xs font-semibold text-slate-600">{feedback}</p>
            </div>
            <div className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
              지붕: {record.isFinalized ? roofTypeLabel[record.roofType] : roofTypeLabel.none}
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

          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm" aria-live="polite">
            <div className="metric-pill">
              🔥 연속 <AnimatedNumber value={streak} />일
            </div>
            <div className="metric-pill">
              🎯 목표 <AnimatedNumber value={dailyGoal} />개
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold">지금 할 일</h3>
            <p className="text-xs text-slate-500">체크하면 바로 건물이 반응하고, 완료한 항목은 목록에서 빠집니다.</p>
          </div>
          <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
            {focusMode ? `집중 ${visibleExecutionQueue.length}개` : `남은 ${executionQueue.length}개`}
          </span>
        </div>

        {visibleExecutionQueue.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            {record.totalCount === 0
              ? "오늘 첫 퀘스트를 아래에서 추가해 보세요."
              : focusMode
                ? "집중 모드 기준으로 지금 볼 퀘스트가 없어요. 실행 가이드에서 집중 모드를 꺼보세요."
                : "오늘 등록한 퀘스트를 모두 완료했어요. 아래에서 하루를 마감해 보세요."}
          </div>
        ) : (
          <ul className="space-y-2">{visibleExecutionQueue.map((item) => renderQuestItem(item.quest, { showTypeBadge: true }))}</ul>
        )}

        {visibleExecutionQueue.length > 0 && visibleExecutionQueue.every((item) => item.blockedByIds.length > 0) ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            모든 남은 퀘스트가 선행 조건으로 막혀 있어요. &quot;선행 필요&quot;가 보이는 항목부터 풀어 보세요.
          </p>
        ) : null}

        {completedQuests.length > 0 ? (
          <details className="disclosure mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
            <summary className="disclosure-summary text-sm font-semibold text-slate-700">
              <span>완료한 퀘스트 {completedQuests.length}개 보기</span>
              <span aria-hidden="true" className="disclosure-caret">
                ▾
              </span>
            </summary>
            <ul className="mt-3 space-y-2">{completedQuests.map((quest) => renderQuestItem(quest, { showTypeBadge: true }))}</ul>
          </details>
        ) : null}
      </Card>

      <Card>
        <div className="mb-3">
          <h3 className="text-base font-bold">빠른 퀘스트 추가</h3>
          <p className="text-xs text-slate-500">제목과 타입만 고르면 바로 추가되고, 세부 옵션은 필요할 때만 열 수 있어요.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3" aria-describedby="quest-input-hint">
          <fieldset disabled={isAddLocked} className={`space-y-3 ${isAddLocked ? "opacity-60" : ""}`}>
            <div className="flex gap-2">
              <input
                ref={titleInputRef}
                aria-label="새 퀘스트 입력"
                aria-invalid={showQuestTitleError}
                aria-describedby={showQuestTitleError ? "quest-input-hint quest-title-error" : "quest-input-hint"}
                value={titleInput}
                maxLength={80}
                onChange={(e) => {
                  const nextTitle = e.target.value;
                  setTitleInput(nextTitle);
                  if (hasTriedEmptySubmit && nextTitle.trim().length > 0) {
                    setHasTriedEmptySubmit(false);
                    setMessage(null);
                  }
                }}
                placeholder="예: 오늘 편집본 완성"
                className={`min-h-11 flex-1 rounded-2xl border-2 px-3 py-2 outline-none focus:border-quest-primary ${
                  showQuestTitleError ? "border-rose-300 bg-rose-50/70" : "border-slate-200"
                }`}
              />
              <Button type="submit" className="min-h-11 bg-quest-primary text-white" disabled={isAddLocked}>
                추가
              </Button>
            </div>

            {showQuestTitleError ? (
              <p id="quest-title-error" className="text-xs font-semibold text-rose-600">
                퀘스트 제목을 입력해야 추가할 수 있어요.
              </p>
            ) : null}

            <div className="grid grid-cols-3 gap-2">
              {questTypeOrder.map((type) => {
                const visual = getFloorVisualStyle(type);
                const active = selectedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectType(type)}
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

            <details className="disclosure soft-panel">
              <summary className="disclosure-summary text-sm font-semibold text-slate-700">
                <span>고급 설정</span>
                <span aria-hidden="true" className="disclosure-caret">
                  ▾
                </span>
              </summary>

              <div className="mt-3 space-y-3">
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
                        우선순위 {priorityLabel[priority]}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">선행 퀘스트 (선택)</label>
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
                    미완료 퀘스트를 다음 날로 이월
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
            </details>
          </fieldset>
        </form>

        <p id="quest-input-hint" className="text-xs text-slate-500">
          루틴/메인/서브 중 타입만 먼저 고르고 시작한 뒤, 필요할 때만 고급 설정을 열어 주세요.
        </p>

        {isAddLocked ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            오늘이 마감되어 퀘스트 추가가 잠겨 있어요. 수정하려면 먼저 마감을 해제하세요.
          </p>
        ) : null}

        {message ? (
          <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}
      </Card>

      <Card className="p-0">
        <details className="disclosure overflow-hidden">
          <summary className="disclosure-summary p-4">
            <div>
              <h3 className="text-base font-bold">실행 가이드</h3>
              <p className="text-xs text-slate-500">추천 실행 순서, 집중 모드, 주간 메인 목표는 필요할 때만 확인하세요.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">보기</span>
              <span aria-hidden="true" className="disclosure-caret">
                ▾
              </span>
            </div>
          </summary>

          <div className="space-y-3 border-t border-slate-200/70 px-4 pb-4 pt-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
                <span>집중 모드 (지금 할 3개만 보기)</span>
                <input
                  type="checkbox"
                  checked={focusMode}
                  onChange={(e) => setFocusMode(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                주간 메인 퀘스트 목표치 ({weeklyMainTarget})
              </label>
              <input
                type="range"
                min={1}
                max={30}
                value={weeklyMainTarget}
                onChange={onWeeklyMainTargetChange}
                className="w-full accent-purple-500"
                aria-label="주간 메인 퀘스트 목표치"
              />

              <div className="mt-2 text-xs text-slate-600">
                진행: {weeklyMainProgress.completed}/{weeklyMainTarget} · 실제 완료율 {weeklyMainPercent}%
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <h4 className="mb-2 text-sm font-bold text-slate-700">추천 실행 순서</h4>
              {executionQueue.length === 0 ? (
                <p className="text-xs text-slate-500">진행 가능한 미완료 퀘스트가 없어요.</p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {executionQueue.slice(0, 5).map((item, index) => (
                    <li
                      key={item.quest.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1"
                    >
                      <span>
                        {index + 1}. [{questTypeShortLabel[item.quest.type]}] {item.quest.title}
                      </span>
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${priorityButtonClass[item.priority]}`}
                      >
                        {priorityLabel[item.priority]}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </details>
      </Card>

      <Card className="p-0">
        <details className="disclosure overflow-hidden">
          <summary className="disclosure-summary p-4">
            <div>
              <h3 className="text-base font-bold">고급 설정 / 운영</h3>
              <p className="text-xs text-slate-500">
                {showDevTools ? "일일 목표, 타입별 보기, 백업, 개발용 도구를 여기로 모아뒀어요." : "일일 목표, 타입별 보기, 백업을 여기로 모아뒀어요."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">보기</span>
              <span aria-hidden="true" className="disclosure-caret">
                ▾
              </span>
            </div>
          </summary>

          <div className="space-y-4 border-t border-slate-200/70 px-4 pb-4 pt-3">
            <div className="soft-panel">
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

            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-700">타입별 보기</h4>
              <div className="space-y-3">{sectionOrder.map((type) => renderQuestSection(type))}</div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-700">이번 주 요약</h4>
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
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-700">백업 / 복원</h4>
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-11 bg-slate-100" onClick={onBackupExport}>
                  JSON 백업
                </Button>
                <Button className="min-h-11 bg-slate-100" onClick={() => fileInputRef.current?.click()}>
                  JSON 복원
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={onBackupImport}
              />
            </div>

            {showDevTools ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <h4 className="text-sm font-bold text-amber-900">개발용 도구</h4>
                <p className="mt-1 text-xs text-amber-800">일반 흐름에서는 숨겨 두고, 필요할 때만 날짜를 넘깁니다.</p>
                <Button className="mt-3 min-h-11 bg-quest-accent text-slate-900" onClick={goNextDayForDev}>
                  다음 날로 넘기기 (DEV)
                </Button>
              </div>
            ) : null}
          </div>
        </details>
      </Card>

      <Card>
        <h3 className="mb-1 text-base font-bold">하루 마감 컨트롤</h3>
        <p className="mb-3 text-xs text-slate-500">오늘을 닫으면 지붕이 확정되고, 필요하면 다시 열 수도 있어요.</p>
        <div className="grid grid-cols-2 gap-2">
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
        </div>
      </Card>
    </div>
  );
}
