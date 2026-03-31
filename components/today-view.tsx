"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AnimatedNumber } from "@/components/animated-number";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { RewardToastItem, RewardToasts } from "@/components/reward-toasts";
import { Button, Card } from "@/components/ui";
import {
  buildQuestRewardQueue,
  findNewlyCompletedQuest,
  getRoofPreviewType,
  QuestAnimationEventType,
  idleQuestAnimationEvent
} from "@/domain/animation";
import { getDisplayedRoofType, roofTypeLabel } from "@/domain/building";
import { getExecutionQueue, normalizeQuestPriority, priorityLabel } from "@/domain/execution";
import { getFloorVisualStyle } from "@/domain/floor-style";
import { getStreakCount } from "@/domain/progress";
import { getCompletedQuestTypes, getDominantQuestType, questTypeShortLabel } from "@/domain/quest";
import { getHeroQuestCandidate } from "@/domain/selectors";
import { QuestItem, QuestPriority, QuestType, RecurrencePattern, RoofType } from "@/domain/types";
import { useQuestownStore, useTodayBuildingHeight, useTodayRecord } from "@/store/questown-store";

type NoticeTone = "info" | "success" | "error";

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

const noticeClass: Record<NoticeTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700"
};

const nextPriority: Record<QuestPriority, QuestPriority> = {
  p1: "p2",
  p2: "p3",
  p3: "p1"
};

const rewardEventPreference: QuestAnimationEventType[] = [
  "day-finalized",
  "goal-reached",
  "roof-preview",
  "main-quest-clear",
  "streak-up",
  "combo-up",
  "quest-complete"
];

type RewardEvent = ReturnType<typeof buildQuestRewardQueue>[number];

const formatTodayLabel = (dateKey: string) => {
  const [, month = "0", day = "0"] = dateKey.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
};

const getHeroToneClass = (mode: "empty" | "quest" | "blocked" | "done", type?: QuestType) => {
  if (mode === "done") return "from-emerald-500 to-teal-500";
  if (mode === "blocked") return "from-amber-500 to-orange-500";
  if (mode === "empty") return "from-indigo-500 to-sky-500";
  if (type === "daily") return "from-sky-500 to-cyan-500";
  if (type === "sub") return "from-emerald-500 to-teal-500";
  return "from-indigo-600 to-violet-600";
};

const getRewardFeedback = (completedCount: number, dailyGoal: number) => {
  if (completedCount === 0) return "첫 퀘스트 하나만 끝내면 바로 건물이 자라요.";
  if (completedCount >= dailyGoal) return "오늘 목표 달성! 이제 지붕을 닫을 수 있어요.";
  return completedCount === 1 ? "첫 층이 올라갔어요." : `${completedCount}층까지 올라왔어요.`;
};

const getPrimaryRewardEvent = (queue: RewardEvent[]) =>
  rewardEventPreference.map((type) => queue.find((event) => event.type === type)).find(Boolean) ?? queue[0];

const buildRewardHelperText = (queue: RewardEvent[], primaryType: QuestAnimationEventType) => {
  const helperMessages = queue.filter((event) => event.type !== primaryType).map((event) => event.text);
  if (helperMessages.length === 0) return undefined;
  return helperMessages.slice(0, 2).join(" · ");
};

function DayReviewOverlay({
  dateLabel,
  height,
  streak,
  record,
  reducedMotion,
  completedQuestTypes,
  dominantType,
  summary,
  animationToken,
  onClose
}: {
  dateLabel: string;
  height: number;
  streak: number;
  record: ReturnType<typeof useTodayRecord>;
  reducedMotion: boolean;
  completedQuestTypes: QuestType[];
  dominantType: QuestType | null;
  summary: string;
  animationToken: number;
  onClose: () => void;
}) {
  const visual = dominantType ? getFloorVisualStyle(dominantType) : null;
  const percent = Math.round(record.completionRate * 100);
  const reviewRoofType = getRoofPreviewType(record);
  const showRoof = reviewRoofType !== "none";
  const animationEvent = showRoof ? { type: "day-finalized" as const, token: animationToken } : idleQuestAnimationEvent;

  return (
    <div className="fixed inset-0 z-[80] flex justify-center bg-slate-950/60 backdrop-blur-sm">
      <div className="h-[100dvh] w-full max-w-[430px] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[36px] border border-white/80 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.22),_transparent_30%),radial-gradient(circle_at_bottom,_rgba(99,102,241,0.24),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(240,253,250,0.98)_42%,_rgba(238,242,255,0.98)_100%)] shadow-[0_28px_56px_rgba(15,23,42,0.24)]">
          <div className="pointer-events-none absolute -top-12 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full bg-emerald-200/35 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-indigo-200/28 blur-3xl" />

          <div className="relative flex h-full flex-col justify-between px-5 pb-6 pt-6">
            <header>
              <div className="flex items-start justify-between gap-3">
                <div className="text-left">
                  <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">Day Review</p>
                  <h1 className="mt-3 text-[30px] font-black leading-none text-slate-900">{dateLabel}</h1>
                  <div className="mt-4 flex">
                    <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">
                      오늘 리뷰
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  className="min-h-[44px] rounded-[18px] border-0 bg-slate-100 px-4 py-0 text-sm font-black text-slate-700 shadow-none"
                  onClick={onClose}
                >
                  닫기
                </Button>
              </div>
            </header>

            <section className="mt-6 flex flex-1 flex-col items-center justify-center">
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={reducedMotion ? { duration: 0.1 } : { type: "spring", stiffness: 120, damping: 18 }}
                className="w-full rounded-[34px] border border-white/80 bg-white/88 px-5 py-6 text-center shadow-[0_24px_50px_rgba(15,23,42,0.12)]"
              >
                <div className="mx-auto flex h-[260px] w-full items-center justify-center rounded-[28px] bg-[linear-gradient(180deg,#ecfdf5_0%,#eff6ff_100%)]">
                  {CssFramerBuildingRenderer.render({
                    height,
                    roofType: showRoof ? reviewRoofType : "none",
                    finalized: showRoof,
                    animationEvent,
                    reducedMotion,
                    completedQuestTypes,
                    compact: false,
                    maxVisibleFloors: 7
                  })}
                </div>

                <p className="mt-5 text-2xl font-black text-slate-900">
                  {showRoof ? "지붕을 닫아보며 오늘을 리뷰하고 있어요" : "오늘 쌓은 건물을 정리해 보고 있어요"}
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
                  리뷰를 닫으면 다시 퀘스트 화면으로 돌아가고, 오늘 할 일은 계속 추가하거나 완료할 수 있습니다.
                </p>
              </motion.div>
            </section>

            <section className="mt-6 rounded-[32px] border border-white/80 bg-white/92 p-4 shadow-[0_18px_34px_rgba(15,23,42,0.1)]">
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-[20px] bg-slate-50 px-3 py-3 text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">완료</p>
                  <p className="mt-1 text-base font-black text-slate-900">
                    <AnimatedNumber value={record.completedCount} />/{record.totalCount}
                  </p>
                </div>
                <div className="rounded-[20px] bg-slate-50 px-3 py-3 text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">완료율</p>
                  <p className="mt-1 text-base font-black text-slate-900">{percent}%</p>
                </div>
                <div className="rounded-[20px] bg-slate-50 px-3 py-3 text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Streak</p>
                  <p className="mt-1 text-base font-black text-slate-900">
                    <AnimatedNumber value={streak} />일
                  </p>
                </div>
                <div className="rounded-[20px] bg-slate-50 px-3 py-3 text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">지붕</p>
                  <p className="mt-1 text-base font-black text-slate-900">{roofTypeLabel[reviewRoofType]}</p>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] bg-slate-50 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-black text-white">오늘 요약</span>
                  {dominantType ? (
                    <span className={`rounded-full px-3 py-1 text-[11px] font-black ${visual?.badgeClass ?? "bg-slate-100 text-slate-600"}`}>
                      {visual?.icon ?? "🏗️"} {questTypeShortLabel[dominantType]}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">{summary}</p>
              </div>

              <Button
                type="button"
                className="mt-4 min-h-[54px] w-full rounded-[22px] border-0 bg-gradient-to-r from-slate-900 to-indigo-600 text-sm font-black text-white"
                onClick={onClose}
              >
                리뷰 닫기
              </Button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TodayView() {
  const record = useTodayRecord();
  const height = useTodayBuildingHeight();
  const reduceMotion = !!useReducedMotion();

  const [titleInput, setTitleInput] = useState("");
  const [selectedType, setSelectedType] = useState<QuestType>("main");
  const [selectedPriority, setSelectedPriority] = useState<QuestPriority>("p1");
  const [selectedDependencyQuestId, setSelectedDependencyQuestId] = useState("");
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("none");
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState(2);
  const [carryOverEnabled, setCarryOverEnabled] = useState(true);
  const [carryOverLimit, setCarryOverLimit] = useState(3);
  const [composerNotice, setComposerNotice] = useState<{ text: string; tone: NoticeTone } | null>(null);
  const [listNotice, setListNotice] = useState<{ text: string; tone: NoticeTone } | null>(null);
  const [completedSectionOpen, setCompletedSectionOpen] = useState(true);
  const [toasts, setToasts] = useState<RewardToastItem[]>([]);
  const [animationEvent, setAnimationEvent] = useState(idleQuestAnimationEvent);
  const [previewRoofType, setPreviewRoofType] = useState<RoofType>("none");
  const [isReviewOverlayOpen, setIsReviewOverlayOpen] = useState(false);
  const [reviewAnimationToken, setReviewAnimationToken] = useState(0);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimeoutRefs = useRef<number[]>([]);
  const roofPreviewTimeoutRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const toastIdRef = useRef(1);
  const previousRef = useRef({
    record,
    streak: 0
  });

  const dailyGoal = useQuestownStore((state) => state.dailyGoal);
  const recordsByDate = useQuestownStore((state) => state.recordsByDate);
  const currentDateKey = useQuestownStore((state) => state.currentDateKey);
  const addQuest = useQuestownStore((state) => state.addQuest);
  const toggleQuest = useQuestownStore((state) => state.toggleQuest);
  const deleteQuest = useQuestownStore((state) => state.deleteQuest);
  const updateQuestMeta = useQuestownStore((state) => state.updateQuestMeta);
  const setFocusQuest = useQuestownStore((state) => state.setFocusQuest);
  const clearFocusQuest = useQuestownStore((state) => state.clearFocusQuest);

  const displayedRoofType = getDisplayedRoofType(record.completedCount, record.roofType, record.isFinalized);
  const buildingRoofType = previewRoofType !== "none" ? previewRoofType : displayedRoofType;
  const percent = Math.round(record.completionRate * 100);
  const streak = useMemo(
    () => getStreakCount(recordsByDate, currentDateKey, dailyGoal),
    [recordsByDate, currentDateKey, dailyGoal]
  );
  const feedback = useMemo(() => getRewardFeedback(record.completedCount, dailyGoal), [dailyGoal, record.completedCount]);
  const completedQuestTypes = useMemo(() => getCompletedQuestTypes(record.quests), [record.quests]);
  const questMap = useMemo(() => new Map(record.quests.map((quest) => [quest.id, quest] as const)), [record.quests]);
  const executionQueue = useMemo(() => getExecutionQueue(record.quests), [record.quests]);
  const heroCandidate = useMemo(() => getHeroQuestCandidate(record), [record]);
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

  const primaryQuest = heroCandidate?.quest ?? null;
  const heroTypeVisual = primaryQuest ? getFloorVisualStyle(primaryQuest.type) : null;
  const reviewDominantType = useMemo(
    () => getDominantQuestType(record, "completed") ?? getDominantQuestType(record, "total"),
    [record]
  );
  const reviewSummary = useMemo(() => {
    if (completedQuests.length === 0) {
      return "아직 완료한 퀘스트는 적지만, 지금까지 쌓인 진행 상태를 한눈에 볼 수 있어요.";
    }

    const headline = completedQuests.slice(0, 2).map((quest) => quest.title);
    return completedQuests.length <= 2
      ? headline.join(" · ")
      : `${headline.join(" · ")} 외 ${completedQuests.length - 2}개`;
  }, [completedQuests]);

  const heroState = useMemo(() => {
    if (record.totalCount === 0) {
      return {
        mode: "empty" as const,
        eyebrow: "시작하기",
        title: "입력창에 바로 오늘 퀘스트를 적어보세요",
        description: "한 줄 추가하고 바로 체크하는 흐름으로 설계했어요.",
        cta: "입력창으로 이동"
      };
    }

    if (!heroCandidate) {
      return {
        mode: "done" as const,
        eyebrow: "정리 완료",
        title: "남은 퀘스트가 없어요",
        description: "지금은 리뷰를 열어 지붕과 오늘 요약을 확인하고, 필요하면 새 퀘스트를 더 추가할 수 있어요.",
        cta: "오늘 리뷰"
      };
    }

    if (heroCandidate.blockedByIds.length > 0) {
      return {
        mode: "blocked" as const,
        eyebrow: heroCandidate.isFocused ? "집중 대기" : "선행 필요",
        title: heroCandidate.quest.title,
        description: heroCandidate.blockedReason ?? "먼저 선행 퀘스트를 완료해야 해요.",
        cta: "막힌 이유 보기"
      };
    }

    return {
      mode: "quest" as const,
      eyebrow: heroCandidate.isFocused ? "현재 집중" : "다음 추천",
      title: heroCandidate.quest.title,
      description: heroCandidate.isFocused
        ? "작은 집중 카드만 두고, 나머지는 목록에서 바로 처리할 수 있게 했어요."
        : "지금 이 퀘스트를 끝내면 흐름이 이어집니다.",
      cta: heroCandidate.isFocused ? "집중 퀘스트 완료" : "바로 완료"
    };
  }, [heroCandidate, record.totalCount]);

  const clearToastQueue = useCallback(() => {
    toastTimeoutRefs.current.forEach((id) => window.clearTimeout(id));
    toastTimeoutRefs.current = [];
    setToasts([]);
  }, []);

  const clearRoofPreview = useCallback(() => {
    if (roofPreviewTimeoutRef.current !== null) {
      window.clearTimeout(roofPreviewTimeoutRef.current);
      roofPreviewTimeoutRef.current = null;
    }
    setPreviewRoofType("none");
  }, []);

  const pushToast = useCallback((text: string, tone: RewardToastItem["tone"], helperText?: string) => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;

    setToasts((prev) => [...prev, { id, text, tone, helperText }]);

    const timeout = window.setTimeout(() => {
      toastTimeoutRefs.current = toastTimeoutRefs.current.filter((storedId) => storedId !== timeout);
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2400);

    toastTimeoutRefs.current.push(timeout);
  }, []);

  const triggerAnimation = useCallback((type: QuestAnimationEventType) => {
    setAnimationEvent((prev) => ({ type, token: prev.token + 1 }));
  }, []);

  useEffect(() => {
    return () => {
      clearToastQueue();
      clearRoofPreview();
    };
  }, [clearRoofPreview, clearToastQueue]);

  useEffect(() => {
    if (!composerNotice) return undefined;

    const timeout = window.setTimeout(() => {
      setComposerNotice(null);
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [composerNotice]);

  useEffect(() => {
    if (!listNotice) return undefined;

    const timeout = window.setTimeout(() => {
      setListNotice(null);
    }, 2600);

    return () => window.clearTimeout(timeout);
  }, [listNotice]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      previousRef.current = {
        record,
        streak
      };
      return;
    }

    const prev = previousRef.current;
    if (prev.record.date !== record.date) {
      clearRoofPreview();
      previousRef.current = { record, streak };
      return;
    }

    const newlyCompletedQuest = findNewlyCompletedQuest(prev.record.quests, record.quests);
    const queue = buildQuestRewardQueue({
      previous: prev.record,
      next: record,
      previousStreak: prev.streak,
      nextStreak: streak,
      dailyGoal,
      newlyCompletedQuest
    });

    if (queue.length > 0) {
      const primaryEvent = getPrimaryRewardEvent(queue);
      if (primaryEvent) {
        triggerAnimation(primaryEvent.type);
        pushToast(primaryEvent.text, primaryEvent.tone, buildRewardHelperText(queue, primaryEvent.type));
      }

      if (queue.some((event) => event.type === "roof-preview")) {
        const nextPreviewRoofType = getRoofPreviewType(record);
        clearRoofPreview();
        setPreviewRoofType(nextPreviewRoofType);
        roofPreviewTimeoutRef.current = window.setTimeout(() => {
          roofPreviewTimeoutRef.current = null;
          setPreviewRoofType("none");
        }, 1200);
      }
    }

    previousRef.current = {
      record,
      streak
    };
  }, [clearRoofPreview, dailyGoal, pushToast, record, streak, triggerAnimation]);

  useEffect(() => {
    setIsReviewOverlayOpen(false);
  }, [record.date]);

  const focusComposer = () => {
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const openReviewOverlay = useCallback(() => {
    if (record.totalCount === 0) {
      focusComposer();
      return;
    }

    setReviewAnimationToken((prev) => prev + 1);
    setIsReviewOverlayOpen(true);
  }, [record.totalCount]);

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
      setListNotice({ text: result.reason ?? "퀘스트를 수정할 수 없어요.", tone: "error" });
      return;
    }

    setListNotice(null);
  };

  const handleDeleteQuest = (quest: QuestItem) => {
    const confirmed = window.confirm(`'${quest.title}' 퀘스트를 삭제할까요?`);
    if (!confirmed) return;

    const result = deleteQuest(quest.id);
    if (!result.ok) {
      setListNotice({ text: result.reason ?? "퀘스트를 삭제할 수 없어요.", tone: "error" });
      return;
    }

    setListNotice({ text: "퀘스트를 삭제했어요.", tone: "success" });
  };

  const handleCyclePriority = (quest: QuestItem) => {
    const priority = normalizeQuestPriority(quest.priority, quest.type);
    const result = updateQuestMeta(quest.id, { priority: nextPriority[priority] });

    if (!result.ok) {
      setListNotice({ text: result.reason ?? "우선순위를 바꿀 수 없어요.", tone: "error" });
      return;
    }

    setListNotice({ text: `우선순위를 ${priorityLabel[nextPriority[priority]]}로 바꿨어요.`, tone: "success" });
  };

  const handleToggleFocusQuest = (quest: QuestItem) => {
    const result = quest.focusPinned ? clearFocusQuest() : setFocusQuest(quest.id);
    if (!result.ok) {
      setListNotice({ text: result.reason ?? "집중 퀘스트를 바꿀 수 없어요.", tone: "error" });
      return;
    }

    setListNotice({
      text: quest.focusPinned ? "집중 퀘스트를 해제했어요." : "집중 퀘스트로 고정했어요.",
      tone: "success"
    });
  };

  const handlePrimaryAction = () => {
    if (heroState.mode === "empty") {
      focusComposer();
      return;
    }

    if (heroState.mode === "done") {
      openReviewOverlay();
      return;
    }

    if (heroState.mode === "blocked") {
      setListNotice({ text: heroCandidate?.blockedReason ?? "먼저 선행 퀘스트를 완료해 주세요.", tone: "info" });
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
      setComposerNotice({ text: "퀘스트 제목을 입력해 주세요.", tone: "error" });
      focusComposer();
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
      setComposerNotice({ text: result.reason ?? "퀘스트를 추가할 수 없어요.", tone: "error" });
      focusComposer();
      return;
    }

    setTitleInput("");
    setSelectedDependencyQuestId("");
    setComposerNotice({ text: "퀘스트를 추가했어요. 바로 아래 목록에서 진행하세요.", tone: "success" });
    setListNotice({ text: "새 퀘스트가 진행 중 목록에 추가됐어요.", tone: "success" });
    focusComposer();
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
      <li
        key={quest.id}
        className={`rounded-[24px] border px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${
          quest.completed ? "border-emerald-100 bg-emerald-50/70" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex items-start gap-3">
          <input
            aria-label={`${quest.title} 완료 여부`}
            type="checkbox"
            checked={quest.completed}
            disabled={isBlocked}
            onChange={() => handleToggleQuest(quest)}
            className="mt-1 h-5 w-5 shrink-0 accent-emerald-500"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-sm font-black ${quest.completed ? "text-emerald-800 line-through" : "text-slate-900"}`}>
                    {quest.title}
                  </span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${typeVisual.badgeClass}`}>
                    {typeVisual.icon} {questTypeShortLabel[quest.type]}
                  </span>
                  {!quest.completed ? (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                      {priorityLabel[priority]}
                    </span>
                  ) : null}
                </div>

                {isBlocked ? (
                  <p className="mt-1 text-[11px] font-semibold text-rose-600">먼저 {blockedByTitles.join(", ")} 완료</p>
                ) : quest.completed ? (
                  <p className="mt-1 text-[11px] font-semibold text-emerald-700">완료됨</p>
                ) : quest.focusPinned ? (
                  <p className="mt-1 text-[11px] font-semibold text-amber-700">현재 집중 퀘스트</p>
                ) : null}
              </div>

              {!quest.completed ? (
                <button
                  type="button"
                  onClick={() => handleToggleFocusQuest(quest)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black ${
                    quest.focusPinned
                      ? "bg-amber-100 text-amber-800 shadow-[0_8px_18px_rgba(251,191,36,0.24)]"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {quest.focusPinned ? "집중중" : "집중"}
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {!quest.completed ? (
                <Button
                  type="button"
                  className="min-h-[38px] rounded-[16px] bg-slate-100 px-3 py-2 text-xs font-black shadow-none"
                  onClick={() => handleCyclePriority(quest)}
                >
                  우선 {priorityLabel[priority]}
                </Button>
              ) : null}
              <Button
                type="button"
                className="min-h-[38px] rounded-[16px] bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 shadow-none"
                onClick={() => handleDeleteQuest(quest)}
              >
                삭제
              </Button>
            </div>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[36px] border border-white/80 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(239,246,255,0.96)_52%,_rgba(236,253,245,0.98)_100%)] shadow-[0_28px_56px_rgba(15,23,42,0.14)]">
      <RewardToasts toasts={toasts} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        <div className="sticky top-0 z-20 -mx-4 bg-[linear-gradient(180deg,rgba(232,247,255,0.98)_0%,rgba(232,247,255,0.94)_75%,rgba(232,247,255,0)_100%)] px-4 pb-4 pt-4 backdrop-blur-sm">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Today</p>
              <h1 className="mt-2 text-[28px] font-black leading-none text-slate-900">{formatTodayLabel(record.date)}</h1>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[22px] bg-white px-3 py-2 text-center shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Done</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  <AnimatedNumber value={record.completedCount} />/{record.totalCount}
                </p>
              </div>
              <div className="rounded-[22px] bg-white px-3 py-2 text-center shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Streak</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  <AnimatedNumber value={streak} />일
                </p>
              </div>
            </div>
          </header>

          <Card className="mt-4 rounded-[30px] bg-white/92 p-4 shadow-[0_18px_34px_rgba(15,23,42,0.1)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Quick Add</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">바로 추가하고 바로 체크</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">
                진행 중 {remainingQuests.length}
              </span>
            </div>

            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  value={titleInput}
                  maxLength={80}
                  onChange={(event) => {
                    setTitleInput(event.target.value);
                    if (composerNotice?.tone === "error") {
                      setComposerNotice(null);
                    }
                  }}
                  placeholder="예: 오늘 편집본 완성"
                  className="min-h-[56px] flex-1 rounded-[22px] border-2 border-slate-200 px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-quest-primary"
                  aria-label="새 퀘스트 입력"
                />
                <Button
                  type="submit"
                  className={`min-h-[56px] rounded-[22px] border-0 px-5 text-sm font-black text-white ${getHeroToneClass("quest", selectedType)}`}
                >
                  추가
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(["daily", "main", "sub"] as QuestType[]).map((type) => {
                  const visual = getFloorVisualStyle(type);
                  const active = selectedType === type;

                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleSelectType(type)}
                      className={`min-h-[48px] rounded-[18px] px-3 text-sm font-black transition ${
                        active ? questTypeSelectorActiveClass[type] : "border border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {visual.icon} {questTypeShortLabel[type]}
                    </button>
                  );
                })}
              </div>

              {composerNotice ? (
                <div className={`rounded-[18px] border px-3 py-2 text-sm font-semibold ${noticeClass[composerNotice.tone]}`}>
                  {composerNotice.text}
                </div>
              ) : null}

              <details className="disclosure rounded-[22px] bg-slate-50 p-4">
                <summary className="disclosure-summary-inline">
                  고급 설정
                  <span className="disclosure-caret">⌄</span>
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
                          className={`min-h-[48px] rounded-[18px] border px-2 text-xs font-black ${
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
          </Card>
        </div>

        <Card className="mt-2 rounded-[30px] bg-white/88 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[24px] bg-slate-50">
              {CssFramerBuildingRenderer.render({
                height,
                roofType: buildingRoofType,
                finalized: buildingRoofType !== "none",
                animationEvent,
                reducedMotion: reduceMotion,
                completedQuestTypes,
                compact: true,
                maxVisibleFloors: 5
              })}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">{heroState.eyebrow}</span>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black text-indigo-700">{percent}%</span>
                {primaryQuest ? (
                  <span className={`rounded-full px-3 py-1 text-[11px] font-black ${heroTypeVisual?.badgeClass ?? "bg-slate-100 text-slate-600"}`}>
                    {heroTypeVisual?.icon ?? "🏗️"} {questTypeShortLabel[primaryQuest.type]}
                  </span>
                ) : null}
              </div>
              <h2 className="mt-3 text-lg font-black leading-snug text-slate-900">{heroState.title}</h2>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">{heroState.description}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
                  animate={{ width: `${percent}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <p className="mt-2 text-xs font-bold text-slate-500">{feedback}</p>
              <Button
                type="button"
                className={`mt-3 min-h-[48px] rounded-[18px] border-0 px-4 text-sm font-black text-white ${getHeroToneClass(heroState.mode, primaryQuest?.type)}`}
                onClick={handlePrimaryAction}
              >
                {heroState.cta}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="mt-4 rounded-[30px] bg-white/90 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Quest Board</p>
              <h3 className="mt-1 text-xl font-black text-slate-900">오늘 목록</h3>
            </div>
            <div className="flex items-center gap-2">
              {record.totalCount > 0 ? (
                <Button
                  type="button"
                  className="min-h-[40px] rounded-[16px] border-0 bg-slate-900 px-3 py-2 text-xs font-black text-white"
                  onClick={openReviewOverlay}
                >
                  오늘 리뷰
                </Button>
              ) : null}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">
                완료 {record.completedCount}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-[20px] bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">진행 중</p>
              <p className="mt-1 text-lg font-black text-slate-900">{remainingQuests.length}</p>
            </div>
            <div className="rounded-[20px] bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">완료</p>
              <p className="mt-1 text-lg font-black text-slate-900">{completedQuests.length}</p>
            </div>
            <div className="rounded-[20px] bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">목표</p>
              <p className="mt-1 text-lg font-black text-slate-900">{dailyGoal}개</p>
            </div>
          </div>

          {listNotice ? (
            <div className={`mt-4 rounded-[18px] border px-3 py-2 text-sm font-semibold ${noticeClass[listNotice.tone]}`}>
              {listNotice.text}
            </div>
          ) : null}

          <section className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-900">진행 중</p>
              {record.totalCount > 0 ? <span className="text-xs font-bold text-slate-500">리뷰 후에도 계속 수정 가능</span> : null}
            </div>

            {record.totalCount === 0 ? (
              <div className="rounded-[24px] bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-500">
                아직 등록한 퀘스트가 없어요. 위 입력창에 적고 바로 추가하면 여기에서 바로 확인할 수 있어요.
              </div>
            ) : remainingQuests.length === 0 ? (
              <div className="rounded-[24px] border border-emerald-100 bg-emerald-50 px-4 py-5">
                <p className="text-sm font-black text-emerald-800">진행 중 퀘스트가 없어요.</p>
                <p className="mt-1 text-sm font-semibold text-emerald-700">
                  오늘 퀘스트를 모두 끝냈습니다. 리뷰를 보고, 필요하면 새 퀘스트를 더 추가할 수 있어요.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">{remainingQuests.map((quest) => renderQuestRow(quest))}</ul>
            )}
          </section>

          {completedQuests.length > 0 ? (
            <section className="mt-5">
              <button
                type="button"
                onClick={() => setCompletedSectionOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-[20px] bg-slate-50 px-4 py-3 text-left"
                aria-expanded={completedSectionOpen}
              >
                <span>
                  <span className="text-sm font-black text-slate-900">완료됨</span>
                  <span className="ml-2 text-xs font-semibold text-slate-500">{completedQuests.length}개</span>
                </span>
                <span className="text-sm font-black text-slate-500">{completedSectionOpen ? "접기" : "펼치기"}</span>
              </button>

              {completedSectionOpen ? <ul className="mt-3 space-y-3">{completedQuests.map((quest) => renderQuestRow(quest))}</ul> : null}
            </section>
          ) : null}
        </Card>
      </div>

      <AnimatePresence>
        {isReviewOverlayOpen ? (
          <DayReviewOverlay
            key={`review-${record.date}-${reviewAnimationToken}`}
            dateLabel={formatTodayLabel(record.date)}
            height={height}
            streak={streak}
            record={record}
            reducedMotion={reduceMotion}
            completedQuestTypes={completedQuestTypes}
            dominantType={reviewDominantType}
            summary={reviewSummary}
            animationToken={reviewAnimationToken}
            onClose={() => setIsReviewOverlayOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
