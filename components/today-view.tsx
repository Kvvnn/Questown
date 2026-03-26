"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AnimatedNumber } from "@/components/animated-number";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { RewardToastItem, RewardToasts } from "@/components/reward-toasts";
import { Button } from "@/components/ui";
import { QuestAnimationEventType, idleQuestAnimationEvent } from "@/domain/animation";
import { getDisplayedRoofType } from "@/domain/building";
import { getExecutionQueue, normalizeQuestPriority, priorityLabel } from "@/domain/execution";
import { getFloorVisualStyle } from "@/domain/floor-style";
import { getStreakCount } from "@/domain/progress";
import { getCompletedQuestTypes, questTypeShortLabel } from "@/domain/quest";
import { QuestItem, QuestPriority, QuestType, RecurrencePattern } from "@/domain/types";
import { useQuestownStore, useTodayBuildingHeight, useTodayRecord } from "@/store/questown-store";

type SheetType = "list" | "add" | null;
type BannerTone = "info" | "success" | "error";

const questTypeSelectorActiveClass: Record<QuestType, string> = {
  daily: "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-[0_10px_22px_rgba(14,165,233,0.28)]",
  main: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_10px_22px_rgba(99,102,241,0.28)]",
  sub: "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_10px_22px_rgba(16,185,129,0.24)]"
};

const priorityButtonClass: Record<QuestPriority, string> = {
  p1: "bg-rose-100 text-rose-700 border-rose-200",
  p2: "bg-amber-100 text-amber-700 border-amber-200",
  p3: "bg-slate-100 text-slate-700 border-slate-200"
};

const recurrenceLabel: Record<RecurrencePattern, string> = {
  none: "반복 없음",
  daily: "매일",
  weekdays: "평일",
  weekly: "매주",
  interval: "N일 간격"
};

const bannerClass: Record<BannerTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700"
};

const nextPriority: Record<QuestPriority, QuestPriority> = {
  p1: "p2",
  p2: "p3",
  p3: "p1"
};

const upbeatMessages = ["좋아, +1층!", "퀘스트 완료!", "타운이 자라고 있어요"];

const formatTodayLabel = (dateKey: string) => {
  const [, month = "0", day = "0"] = dateKey.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
};

const getHeroToneClass = (mode: "empty" | "quest" | "blocked" | "done" | "finalized", type?: QuestType) => {
  if (mode === "done") return "from-emerald-500 to-teal-500";
  if (mode === "finalized") return "from-slate-900 to-slate-700";
  if (mode === "blocked") return "from-amber-500 to-orange-500";
  if (mode === "empty") return "from-indigo-500 to-sky-500";
  if (type === "daily") return "from-sky-500 to-cyan-500";
  if (type === "sub") return "from-emerald-500 to-teal-500";
  return "from-indigo-600 to-violet-600";
};

const getRewardFeedback = (completedCount: number, dailyGoal: number) => {
  if (completedCount === 0) return "첫 퀘스트 하나만 끝내면 바로 건물이 자라요.";
  if (completedCount >= dailyGoal) return "오늘 목표 달성! 이제 지붕을 닫을 수 있어요.";
  return upbeatMessages[completedCount % upbeatMessages.length];
};

export function TodayView() {
  const record = useTodayRecord();
  const height = useTodayBuildingHeight();
  const reduceMotion = !!useReducedMotion();

  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [titleInput, setTitleInput] = useState("");
  const [selectedType, setSelectedType] = useState<QuestType>("main");
  const [selectedPriority, setSelectedPriority] = useState<QuestPriority>("p1");
  const [selectedDependencyQuestId, setSelectedDependencyQuestId] = useState("");
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("none");
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState(2);
  const [carryOverEnabled, setCarryOverEnabled] = useState(true);
  const [carryOverLimit, setCarryOverLimit] = useState(3);
  const [composerMessage, setComposerMessage] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: BannerTone } | null>(null);
  const [toasts, setToasts] = useState<RewardToastItem[]>([]);
  const [animationEvent, setAnimationEvent] = useState(idleQuestAnimationEvent);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const eventTimeoutRefs = useRef<number[]>([]);
  const toastTimeoutRefs = useRef<number[]>([]);
  const initializedRef = useRef(false);
  const toastIdRef = useRef(1);
  const previousRef = useRef({
    completedCount: record.completedCount,
    isFinalized: record.isFinalized,
    streak: 0
  });

  const dailyGoal = useQuestownStore((state) => state.dailyGoal);
  const recordsByDate = useQuestownStore((state) => state.recordsByDate);
  const currentDateKey = useQuestownStore((state) => state.currentDateKey);
  const addQuest = useQuestownStore((state) => state.addQuest);
  const toggleQuest = useQuestownStore((state) => state.toggleQuest);
  const deleteQuest = useQuestownStore((state) => state.deleteQuest);
  const updateQuestMeta = useQuestownStore((state) => state.updateQuestMeta);
  const finalizeCurrentDay = useQuestownStore((state) => state.finalizeCurrentDay);
  const setTab = useQuestownStore((state) => state.setTab);

  const displayedRoofType = getDisplayedRoofType(record.completedCount, record.roofType, record.isFinalized);
  const percent = Math.round(record.completionRate * 100);
  const streak = useMemo(
    () => getStreakCount(recordsByDate, currentDateKey, dailyGoal),
    [recordsByDate, currentDateKey, dailyGoal]
  );
  const feedback = useMemo(() => getRewardFeedback(record.completedCount, dailyGoal), [dailyGoal, record.completedCount]);
  const completedQuestTypes = useMemo(() => getCompletedQuestTypes(record.quests), [record.quests]);
  const questMap = useMemo(() => new Map(record.quests.map((quest) => [quest.id, quest] as const)), [record.quests]);
  const executionQueue = useMemo(() => getExecutionQueue(record.quests), [record.quests]);
  const remainingQuests = useMemo(() => executionQueue.map((item) => item.quest), [executionQueue]);
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

  const primaryQueueItem = executionQueue[0] ?? null;
  const primaryQuest = primaryQueueItem?.quest ?? null;
  const primaryBlockedTitle = primaryQueueItem?.blockedByIds
    ?.map((id) => questMap.get(id)?.title)
    .filter((title): title is string => Boolean(title))[0];

  const heroState = useMemo(() => {
    if (record.isFinalized) {
      return {
        mode: "finalized" as const,
        eyebrow: "오늘 완료",
        title: "타운 완성!",
        description: "오늘 기록을 타운에서 바로 확인해요.",
        cta: "타운 보기"
      };
    }

    if (record.totalCount === 0) {
      return {
        mode: "empty" as const,
        eyebrow: "첫 시작",
        title: "첫 퀘스트를 만들어요",
        description: "한 줄만 적고 바로 시작하면 됩니다.",
        cta: "퀘스트 만들기"
      };
    }

    if (executionQueue.length === 0) {
      return {
        mode: "done" as const,
        eyebrow: "마무리",
        title: "오늘 퀘스트 완료",
        description: "지붕을 닫고 하루 보상을 받아요.",
        cta: "오늘 마감"
      };
    }

    if (primaryQueueItem && primaryQueueItem.blockedByIds.length > 0) {
      return {
        mode: "blocked" as const,
        eyebrow: "대기 중",
        title: primaryQueueItem.quest.title,
        description: primaryBlockedTitle ? `${primaryBlockedTitle}부터 끝내면 열려요.` : "먼저 선행 퀘스트를 확인해야 해요.",
        cta: "퀘스트 목록"
      };
    }

    return {
      mode: "quest" as const,
      eyebrow: "지금 할 일",
      title: primaryQuest?.title ?? "다음 퀘스트",
      description: "이것 하나만 끝내면 바로 다음 단계로 넘어갑니다.",
      cta: "완료하기"
    };
  }, [executionQueue.length, primaryBlockedTitle, primaryQuest?.title, primaryQueueItem, record.isFinalized, record.totalCount]);

  const clearEventQueue = useCallback(() => {
    eventTimeoutRefs.current.forEach((id) => window.clearTimeout(id));
    eventTimeoutRefs.current = [];
  }, []);

  const clearToastQueue = useCallback(() => {
    toastTimeoutRefs.current.forEach((id) => window.clearTimeout(id));
    toastTimeoutRefs.current = [];
    setToasts([]);
  }, []);

  const pushToast = useCallback((text: string, tone: RewardToastItem["tone"] = "info") => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;

    setToasts((prev) => [...prev, { id, text, tone }]);

    const timeout = window.setTimeout(() => {
      toastTimeoutRefs.current = toastTimeoutRefs.current.filter((storedId) => storedId !== timeout);
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
      clearToastQueue();
    };
  }, [clearEventQueue, clearToastQueue]);

  useEffect(() => {
    if (!banner) return undefined;

    const timeout = window.setTimeout(() => {
      setBanner(null);
    }, 2600);

    return () => window.clearTimeout(timeout);
  }, [banner]);

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
    }

    if (!prev.isFinalized && record.isFinalized) {
      queue.push({
        type: "day-finalized",
        text: "지붕 완성! 오늘 기록이 저장됐어요.",
        tone: "epic"
      });
    }

    if (streak > prev.streak) {
      queue.push({
        type: "streak-up",
        text: `🔥 ${streak}일 연속 달성!`,
        tone: "epic"
      });
    }

    clearEventQueue();

    queue.forEach((event, index) => {
      const timeout = window.setTimeout(() => {
        eventTimeoutRefs.current = eventTimeoutRefs.current.filter((id) => id !== timeout);
        triggerReward(event.type, event.text, event.tone);
      }, index * 220);

      eventTimeoutRefs.current.push(timeout);
    });

    previousRef.current = {
      completedCount: record.completedCount,
      isFinalized: record.isFinalized,
      streak
    };
  }, [clearEventQueue, record.completedCount, record.isFinalized, streak, triggerReward]);

  useEffect(() => {
    if (activeSheet !== "add") return;

    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  }, [activeSheet]);

  const openAddSheet = () => {
    if (record.isFinalized) {
      setBanner({ text: "오늘이 이미 마감되어 새 퀘스트를 추가할 수 없어요.", tone: "error" });
      return;
    }

    setComposerMessage(null);
    setActiveSheet("add");
  };

  const openListSheet = () => {
    setActiveSheet("list");
  };

  const closeSheet = () => {
    setActiveSheet(null);
  };

  const handleSelectType = (type: QuestType) => {
    setSelectedType(type);
    setSelectedPriority(normalizeQuestPriority(undefined, type));

    if (type === "daily" && recurrencePattern === "none") {
      setRecurrencePattern("daily");
    }

    if (type === "main" && !carryOverEnabled) {
      setCarryOverEnabled(true);
    }
  };

  const handleToggleQuest = (quest: QuestItem) => {
    const result = toggleQuest(quest.id);
    if (!result.ok) {
      setBanner({ text: result.reason ?? "퀘스트를 수정할 수 없어요.", tone: "error" });
      return;
    }

    setBanner(null);
  };

  const handleDeleteQuest = (quest: QuestItem) => {
    const confirmed = window.confirm(`'${quest.title}' 퀘스트를 삭제할까요?`);
    if (!confirmed) return;

    const result = deleteQuest(quest.id);
    if (!result.ok) {
      setBanner({ text: result.reason ?? "퀘스트를 삭제할 수 없어요.", tone: "error" });
      return;
    }

    setBanner({ text: "퀘스트를 삭제했어요.", tone: "success" });
  };

  const handleCyclePriority = (quest: QuestItem) => {
    const priority = normalizeQuestPriority(quest.priority, quest.type);
    const result = updateQuestMeta(quest.id, { priority: nextPriority[priority] });

    if (!result.ok) {
      setBanner({ text: result.reason ?? "우선순위를 바꿀 수 없어요.", tone: "error" });
      return;
    }

    setBanner(null);
  };

  const handlePrimaryAction = () => {
    if (heroState.mode === "empty") {
      openAddSheet();
      return;
    }

    if (heroState.mode === "done") {
      finalizeCurrentDay();
      return;
    }

    if (heroState.mode === "finalized") {
      setTab("town");
      return;
    }

    if (heroState.mode === "blocked") {
      openListSheet();
      return;
    }

    if (primaryQuest) {
      handleToggleQuest(primaryQuest);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    const trimmedTitle = titleInput.trim();
    if (!trimmedTitle) {
      setComposerMessage("퀘스트 제목을 입력해 주세요.");
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
      setComposerMessage(result.reason ?? "퀘스트를 추가할 수 없어요.");
      titleInputRef.current?.focus();
      return;
    }

    setTitleInput("");
    setSelectedDependencyQuestId("");
    setComposerMessage(null);
    setActiveSheet(null);
    setBanner({ text: "퀘스트를 추가했어요.", tone: "success" });
  };

  const renderQuestRow = (quest: QuestItem) => {
    const blockedByIds = (quest.dependencyQuestIds ?? []).filter((id) => {
      const dependency = questMap.get(id);
      return dependency ? !dependency.completed : false;
    });
    const blockedByTitles = blockedByIds.map((id) => questMap.get(id)?.title).filter((title): title is string => Boolean(title));
    const priority = normalizeQuestPriority(quest.priority, quest.type);
    const typeVisual = getFloorVisualStyle(quest.type);
    const isBlocked = !quest.completed && blockedByIds.length > 0;

    return (
      <li key={quest.id} className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="flex items-start gap-3">
          <input
            aria-label={`${quest.title} 완료 여부`}
            type="checkbox"
            checked={quest.completed}
            disabled={record.isFinalized || isBlocked}
            onChange={() => handleToggleQuest(quest)}
            className="mt-1 h-5 w-5 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-sm font-semibold ${quest.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
                {quest.title}
              </span>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${typeVisual.badgeClass}`}>
                {typeVisual.icon} {questTypeShortLabel[quest.type]}
              </span>
            </div>

            {isBlocked ? (
              <p className="mt-1 text-[11px] font-semibold text-rose-600">먼저 {blockedByTitles.join(", ")} 완료</p>
            ) : quest.completed ? (
              <p className="mt-1 text-[11px] font-semibold text-emerald-600">완료됨</p>
            ) : null}

            <details className="mt-2">
              <summary className="inline-flex cursor-pointer list-none items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 [&::-webkit-details-marker]:hidden">
                더보기
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-[42px] rounded-[18px] bg-slate-100 px-3 py-2 text-xs font-bold"
                  disabled={record.isFinalized}
                  onClick={() => handleCyclePriority(quest)}
                >
                  우선순위 {priorityLabel[priority]}
                </Button>
                <Button
                  type="button"
                  className="min-h-[42px] rounded-[18px] bg-quest-danger px-3 py-2 text-xs font-bold text-white"
                  disabled={record.isFinalized}
                  onClick={() => handleDeleteQuest(quest)}
                >
                  삭제
                </Button>
              </div>
            </details>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="relative h-full overflow-hidden rounded-[36px] border border-white/80 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.24),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.95)_0%,_rgba(239,246,255,0.96)_52%,_rgba(236,253,245,0.98)_100%)] shadow-[0_28px_56px_rgba(15,23,42,0.14)]">
      <RewardToasts toasts={toasts} />

      <AnimatePresence>
        {banner ? (
          <motion.div
            key={banner.text}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`absolute left-4 right-4 top-4 z-30 rounded-[20px] border px-4 py-3 text-sm font-semibold ${bannerClass[banner.tone]}`}
          >
            {banner.text}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex h-full flex-col px-5 pb-5 pt-5">
        <header className="flex items-center justify-between gap-3 pt-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Today</p>
            <h1 className="mt-2 text-[28px] font-black leading-none text-slate-900">{formatTodayLabel(record.date)}</h1>
          </div>

          <div className="flex gap-2">
            <div className="rounded-full bg-white px-3 py-2 text-center shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Done</p>
              <p className="mt-1 text-sm font-black text-slate-900">
                <AnimatedNumber value={record.completedCount} />/{record.totalCount}
              </p>
            </div>
            <div className="rounded-full bg-white px-3 py-2 text-center shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Streak</p>
              <p className="mt-1 text-sm font-black text-slate-900">
                <AnimatedNumber value={streak} />일
              </p>
            </div>
          </div>
        </header>

        <div className="mt-5 flex min-h-0 flex-1 flex-col justify-center">
          <div className="flex min-h-0 flex-1 flex-col rounded-[36px] bg-white/94 px-5 py-5 shadow-[0_24px_50px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{heroState.eyebrow}</span>
              <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700">{percent}%</span>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center py-4">
              {CssFramerBuildingRenderer.render({
                height,
                roofType: displayedRoofType,
                finalized: record.isFinalized,
                animationEvent,
                reducedMotion: reduceMotion,
                completedQuestTypes,
                compact: true,
                maxVisibleFloors: 6
              })}
            </div>

            <div className="text-center">
              <h2 className="mx-auto max-h-[96px] max-w-[260px] overflow-hidden text-[30px] font-black leading-8 text-slate-900">
                {heroState.title}
              </h2>
              <p className="mx-auto mt-3 max-w-[260px] max-h-10 overflow-hidden text-sm font-semibold text-slate-600">
                {heroState.description}
              </p>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
                animate={{ width: `${percent}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>

            <div className="mt-3 text-center text-xs font-bold text-slate-500">{feedback}</div>

            <Button
              type="button"
              className={`mt-5 min-h-[72px] w-full rounded-[28px] border-0 bg-gradient-to-r text-lg font-black text-white shadow-[0_18px_34px_rgba(15,23,42,0.16)] ${getHeroToneClass(heroState.mode, primaryQuest?.type)}`}
              onClick={handlePrimaryAction}
            >
              {heroState.cta}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            type="button"
            className="min-h-[54px] rounded-[22px] border-0 bg-white text-sm font-black text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
            onClick={openListSheet}
          >
            퀘스트 목록
          </Button>
          <Button
            type="button"
            className="min-h-[54px] rounded-[22px] border-0 bg-white text-sm font-black text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
            disabled={record.isFinalized}
            onClick={openAddSheet}
          >
            빠른 추가
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {activeSheet ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-end bg-slate-950/24 px-2 pb-2 pt-10 backdrop-blur-[2px]"
            onClick={closeSheet}
          >
            <motion.div
              initial={{ y: 32 }}
              animate={{ y: 0 }}
              exit={{ y: 32 }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
              className="flex max-h-[78%] w-full flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_26px_54px_rgba(15,23,42,0.22)]"
              onClick={(event) => event.stopPropagation()}
            >
              {activeSheet === "list" ? (
                <>
                  <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Quest List</p>
                      <h3 className="mt-2 text-2xl font-black text-slate-900">오늘 목록</h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeSheet}
                      className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600"
                    >
                      닫기
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 px-5">
                    <div className="rounded-[22px] bg-slate-100 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Remaining</p>
                      <p className="mt-1 text-xl font-black text-slate-900">{remainingQuests.length}개</p>
                    </div>
                    <div className="rounded-[22px] bg-slate-100 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Completed</p>
                      <p className="mt-1 text-xl font-black text-slate-900">{completedQuests.length}개</p>
                    </div>
                  </div>

                  <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                    {record.totalCount === 0 ? (
                      <div className="rounded-[24px] bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-500">
                        아직 등록한 퀘스트가 없어요. 빠른 추가로 오늘 첫 퀘스트를 만들어 보세요.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {remainingQuests.length > 0 ? (
                          <section>
                            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Now</p>
                            <ul className="space-y-3">{remainingQuests.map((quest) => renderQuestRow(quest))}</ul>
                          </section>
                        ) : null}

                        {completedQuests.length > 0 ? (
                          <section>
                            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Done</p>
                            <ul className="space-y-3">{completedQuests.map((quest) => renderQuestRow(quest))}</ul>
                          </section>
                        ) : null}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Quick Add</p>
                      <h3 className="mt-2 text-2xl font-black text-slate-900">새 퀘스트</h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeSheet}
                      className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600"
                    >
                      닫기
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                    <form onSubmit={onSubmit} className="space-y-4">
                      <div>
                        <input
                          ref={titleInputRef}
                          value={titleInput}
                          maxLength={80}
                          onChange={(event) => {
                            setTitleInput(event.target.value);
                            if (composerMessage) {
                              setComposerMessage(null);
                            }
                          }}
                          placeholder="예: 오늘 편집본 완성"
                          className="min-h-[58px] w-full rounded-[24px] border-2 border-slate-200 px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-quest-primary"
                          aria-label="새 퀘스트 입력"
                        />
                        {composerMessage ? <p className="mt-2 text-sm font-semibold text-rose-600">{composerMessage}</p> : null}
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        {(["daily", "main", "sub"] as QuestType[]).map((type) => {
                          const visual = getFloorVisualStyle(type);
                          const active = selectedType === type;

                          return (
                            <button
                              key={type}
                              type="button"
                              aria-pressed={active}
                              onClick={() => handleSelectType(type)}
                              className={`min-h-[56px] rounded-[22px] px-3 text-sm font-black transition ${
                                active ? questTypeSelectorActiveClass[type] : "border border-slate-200 bg-white text-slate-600"
                              }`}
                            >
                              {visual.icon} {questTypeShortLabel[type]}
                            </button>
                          );
                        })}
                      </div>

                      <Button
                        type="submit"
                        className={`min-h-[64px] w-full rounded-[26px] border-0 bg-gradient-to-r text-lg font-black text-white ${getHeroToneClass("quest", selectedType)}`}
                      >
                        바로 추가
                      </Button>

                      <details className="rounded-[24px] bg-slate-50 p-4">
                        <summary className="cursor-pointer list-none text-sm font-black text-slate-700 [&::-webkit-details-marker]:hidden">
                          고급 설정
                        </summary>

                        <div className="mt-4 space-y-4">
                          <div className="grid grid-cols-3 gap-3">
                            {(["p1", "p2", "p3"] as QuestPriority[]).map((priority) => {
                              const active = selectedPriority === priority;
                              return (
                                <button
                                  key={priority}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => setSelectedPriority(priority)}
                                  className={`min-h-[50px] rounded-[20px] border px-2 text-xs font-black ${
                                    active ? priorityButtonClass[priority] : "border-slate-200 bg-white text-slate-600"
                                  }`}
                                >
                                  우선 {priorityLabel[priority]}
                                </button>
                              );
                            })}
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-bold text-slate-700">선행 퀘스트</label>
                            <select
                              value={selectedDependencyQuestId}
                              onChange={(event) => setSelectedDependencyQuestId(event.target.value)}
                              className="min-h-[52px] w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
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
                            <label className="mb-2 block text-sm font-bold text-slate-700">반복 규칙</label>
                            <select
                              value={recurrencePattern}
                              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                                const value = event.target.value as RecurrencePattern;
                                setRecurrencePattern(value);
                                if (value !== "interval") {
                                  setRecurrenceIntervalDays(2);
                                }
                              }}
                              className="min-h-[52px] w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
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
                              <div className="mb-2 flex items-center justify-between text-sm font-bold text-slate-700">
                                <span>간격</span>
                                <span>{recurrenceIntervalDays}일</span>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={14}
                                value={recurrenceIntervalDays}
                                onChange={(event) => setRecurrenceIntervalDays(Math.max(1, Number(event.target.value) || 1))}
                                className="w-full accent-indigo-500"
                                aria-label="반복 간격 일수 설정"
                              />
                            </div>
                          ) : null}

                          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                              <input
                                type="checkbox"
                                checked={carryOverEnabled}
                                onChange={(event) => setCarryOverEnabled(event.target.checked)}
                                className="h-4 w-4"
                              />
                              미완료 퀘스트를 다음 날로 이월
                            </label>

                            {carryOverEnabled ? (
                              <div className="mt-3">
                                <div className="mb-2 flex items-center justify-between text-sm font-bold text-slate-700">
                                  <span>최대 횟수</span>
                                  <span>{carryOverLimit}회</span>
                                </div>
                                <input
                                  type="range"
                                  min={1}
                                  max={14}
                                  value={carryOverLimit}
                                  onChange={(event) => setCarryOverLimit(Math.max(1, Math.round(Number(event.target.value) || 1)))}
                                  className="w-full accent-orange-500"
                                  aria-label="최대 이월 횟수 설정"
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </details>
                    </form>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
