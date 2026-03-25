"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedNumber } from "@/components/animated-number";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { RewardToastItem, RewardToasts } from "@/components/reward-toasts";
import { Button, Card } from "@/components/ui";
import { QuestAnimationEventType, idleQuestAnimationEvent } from "@/domain/animation";
import { getDisplayedRoofType, roofTypeLabel } from "@/domain/building";
import { ensureDailyRecord } from "@/domain/date";
import {
  getCompletedDependentIds,
  getExecutionQueue,
  getFocusQuestIds,
  getWeeklyMainProgress,
  normalizeQuestPriority,
  priorityLabel,
  wouldCreateDependencyCycle
} from "@/domain/execution";
import { getFloorVisualStyle } from "@/domain/floor-style";
import { getStreakCount, getWeeklySummary } from "@/domain/progress";
import { getCompletedQuestTypes, questTypeLabel, questTypeOrder, questTypeShortLabel } from "@/domain/quest";
import { DailyRecord, QuestItem, QuestPriority, QuestType, RecurrencePattern } from "@/domain/types";
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

type WorkspaceTab = "run" | "compose" | "manage";

const workspaceTabOrder: WorkspaceTab[] = ["run", "compose", "manage"];

const workspaceTabMeta: Record<WorkspaceTab, { label: string; hint: string }> = {
  run: {
    label: "실행",
    hint: "먼저 처리할 퀘스트"
  },
  compose: {
    label: "추가",
    hint: "필요할 때 등록"
  },
  manage: {
    label: "관리",
    hint: "정리와 백업"
  }
};

type InlineStatusTone = "info" | "success" | "error";
type InlineStatusMessage = { text: string; tone: InlineStatusTone };

const inlineStatusClass: Record<InlineStatusTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700"
};

const nextPriority: Record<QuestPriority, QuestPriority> = {
  p1: "p2",
  p2: "p3",
  p3: "p1"
};

const executionPreviewLimit = 3;

const getRoofFeedback = (completionRate: number) => {
  if (completionRate >= 0.8) return "🏆 완성 지붕! 오늘 하루를 정말 잘 마무리했어요.";
  if (completionRate >= 0.4) return "👍 안정 지붕! 내일 한 걸음 더 가봐요.";
  return "🌤️ 기초 지붕! 그래도 오늘의 건물은 세워졌어요.";
};

const createRewardSnapshot = (
  currentRecord: Pick<DailyRecord, "date" | "completedCount" | "isFinalized">,
  streak: number
) => ({
  date: currentRecord.date,
  completedCount: currentRecord.completedCount,
  isFinalized: currentRecord.isFinalized,
  streak
});

export function TodayView() {
  const record = useTodayRecord();
  const height = useTodayBuildingHeight();
  const [titleInput, setTitleInput] = useState("");
  const [hasTriedEmptySubmit, setHasTriedEmptySubmit] = useState(false);
  const [selectedType, setSelectedType] = useState<QuestType>("main");
  const [selectedPriority, setSelectedPriority] = useState<QuestPriority>("p1");
  const [selectedDependencyQuestIds, setSelectedDependencyQuestIds] = useState<string[]>([]);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("run");
  const [focusMode, setFocusMode] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("none");
  const [isRecurrenceAutoSelected, setIsRecurrenceAutoSelected] = useState(true);
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState(2);
  const [carryOverEnabled, setCarryOverEnabled] = useState(true);
  const [isCarryOverAutoSelected, setIsCarryOverAutoSelected] = useState(true);
  const [carryOverLimit, setCarryOverLimit] = useState(3);
  const [composerMessage, setComposerMessage] = useState<InlineStatusMessage | null>(null);
  const [globalMessage, setGlobalMessage] = useState<InlineStatusMessage | null>(null);
  const [toasts, setToasts] = useState<RewardToastItem[]>([]);
  const [animationEvent, setAnimationEvent] = useState(idleQuestAnimationEvent);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const buildingPanelRef = useRef<HTMLDivElement | null>(null);
  const workspacePanelRef = useRef<HTMLDivElement | null>(null);
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

  const showComposerMessage = useCallback((text: string, tone: InlineStatusTone = "info") => {
    setComposerMessage({ text, tone });
  }, []);
  const showGlobalMessage = useCallback((text: string, tone: InlineStatusTone = "info") => {
    setGlobalMessage({ text, tone });
  }, []);
  const clearComposerFeedback = () => {
    setHasTriedEmptySubmit(false);
    setComposerMessage(null);
  };

  const percent = Math.round(record.completionRate * 100);
  const displayedRoofType = getDisplayedRoofType(record.completedCount, record.roofType, record.isFinalized);
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
  const primaryExecutionQueue = useMemo(
    () => visibleExecutionQueue.slice(0, executionPreviewLimit),
    [visibleExecutionQueue]
  );
  const deferredExecutionQueue = useMemo(
    () => visibleExecutionQueue.slice(executionPreviewLimit),
    [visibleExecutionQueue]
  );
  const allRemainingBlocked = useMemo(
    () => executionQueue.length > 0 && executionQueue.every((item) => item.blockedByIds.length > 0),
    [executionQueue]
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
  const hasDependencyCandidates = dependencyCandidates.length > 0;
  const composerDependencyCandidateIds = useMemo(
    () => new Set(dependencyCandidates.map((quest) => quest.id)),
    [dependencyCandidates]
  );

  const weeklyMainProgress = useMemo(
    () => getWeeklyMainProgress(recordsByDate, currentDateKey),
    [recordsByDate, currentDateKey]
  );
  const weeklyMainPercent = Math.round(weeklyMainProgress.rate * 100);

  const previousRef = useRef(createRewardSnapshot(record, streak));

  const feedback = useMemo(() => {
    if (record.completedCount === 0) return "첫 퀘스트를 완료하고 1층을 올려보세요.";
    if (record.completedCount >= dailyGoal) return "오늘 목표 달성! 마감하면 지붕이 완성돼요.";
    return upbeatMessages[record.completedCount % upbeatMessages.length];
  }, [dailyGoal, record.completedCount]);
  const isAddLocked = record.isFinalized;

  const isQuestTitleEmpty = titleInput.trim().length === 0;
  const titleErrorMessage =
    composerMessage?.tone === "error"
      ? composerMessage.text
      : hasTriedEmptySubmit && isQuestTitleEmpty
        ? "퀘스트 제목을 입력해야 추가할 수 있어요."
        : null;
  const showQuestTitleError = Boolean(titleErrorMessage);

  const clearEventQueue = useCallback(() => {
    eventTimeoutRefs.current.forEach((id) => window.clearTimeout(id));
    eventTimeoutRefs.current = [];
  }, []);

  const clearToastQueue = useCallback(() => {
    toastTimeoutRefs.current.forEach((id) => window.clearTimeout(id));
    toastTimeoutRefs.current = [];
    setToasts([]);
  }, []);

  const scrollToBuilding = useCallback(() => {
    buildingPanelRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }, [reduceMotion]);

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
    if (!initializedRef.current) {
      initializedRef.current = true;
      previousRef.current = createRewardSnapshot(record, streak);
      return;
    }

    const prev = previousRef.current;

    if (prev.date !== record.date) {
      clearEventQueue();
      previousRef.current = createRewardSnapshot(record, streak);
      return;
    }

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
        eventTimeoutRefs.current = eventTimeoutRefs.current.filter((id) => id !== timeout);
        triggerReward(event.type, event.text, event.tone);
      }, index * 220);

      eventTimeoutRefs.current.push(timeout);
    });

    previousRef.current = createRewardSnapshot(record, streak);
  }, [
    clearEventQueue,
    dailyGoal,
    record.completedCount,
    record.completionRate,
    record.date,
    record.isFinalized,
    streak,
    triggerReward
  ]);

  useEffect(() => {
    setSelectedDependencyQuestIds((prev) => {
      const next = prev.filter((questId) => composerDependencyCandidateIds.has(questId));
      return next.length === prev.length ? prev : next;
    });
  }, [composerDependencyCandidateIds]);

  const handleSelectType = (type: QuestType) => {
    clearComposerFeedback();
    setSelectedType(type);
    setSelectedPriority(normalizeQuestPriority(undefined, type));

    if (type === "daily" && recurrencePattern === "none" && isRecurrenceAutoSelected) {
      setRecurrencePattern("daily");
    } else if (type !== "daily" && recurrencePattern === "daily" && isRecurrenceAutoSelected) {
      setRecurrencePattern("none");
    }

    if (type === "main" && !carryOverEnabled && isCarryOverAutoSelected) {
      setCarryOverEnabled(true);
    } else if (type !== "main" && carryOverEnabled && isCarryOverAutoSelected) {
      setCarryOverEnabled(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = titleInput.trim();

    if (!trimmedTitle) {
      setHasTriedEmptySubmit(true);
      showComposerMessage("퀘스트를 입력해 주세요.", "error");
      titleInputRef.current?.focus();
      return;
    }

    const result = addQuest({
      title: trimmedTitle,
      type: selectedType,
      priority: selectedPriority,
      dependencyQuestIds: selectedDependencyQuestIds.length > 0 ? selectedDependencyQuestIds : undefined,
      recurrencePattern,
      recurrenceIntervalDays: recurrencePattern === "interval" ? recurrenceIntervalDays : undefined,
      carryOverEnabled,
      carryOverLimit: carryOverEnabled ? carryOverLimit : undefined
    });

    if (!result.ok) {
      showComposerMessage(result.reason ?? "추가에 실패했어요.", "error");
      titleInputRef.current?.focus();
      if (trimmedTitle) {
        titleInputRef.current?.select();
      }
      return;
    }

    setTitleInput("");
    setHasTriedEmptySubmit(false);
    setSelectedDependencyQuestIds([]);
    setComposerMessage(null);
    titleInputRef.current?.focus();
  };

  const onGoalChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDailyGoal(Number(e.target.value));
  };

  const onWeeklyMainTargetChange = (e: ChangeEvent<HTMLInputElement>) => {
    setWeeklyMainTarget(Number(e.target.value));
  };

  const onRecurrencePatternChange = (e: ChangeEvent<HTMLSelectElement>) => {
    clearComposerFeedback();
    const value = e.target.value as RecurrencePattern;
    setRecurrencePattern(value);
    setIsRecurrenceAutoSelected(false);
    if (value !== "interval") {
      setRecurrenceIntervalDays(2);
    }
  };

  const onCarryOverEnabledChange = (e: ChangeEvent<HTMLInputElement>) => {
    clearComposerFeedback();
    setIsCarryOverAutoSelected(false);
    setCarryOverEnabled(e.target.checked);
  };

  const onCarryOverLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
    clearComposerFeedback();
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
    showGlobalMessage("백업 파일을 저장했어요.", "success");
  };

  const onBackupImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let parsed: unknown;

      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        showGlobalMessage("JSON 형식이 올바르지 않아요.", "error");
        return;
      }

      const result = importBackup(parsed);
      if (result.ok) {
        const nextState = useQuestownStore.getState();
        const nextRecord =
          nextState.recordsByDate[nextState.currentDateKey] ?? ensureDailyRecord(nextState.currentDateKey);
        const nextStreak = getStreakCount(nextState.recordsByDate, nextState.currentDateKey, nextState.dailyGoal);

        clearEventQueue();
        clearToastQueue();
        setAnimationEvent(idleQuestAnimationEvent);
        previousRef.current = createRewardSnapshot(nextRecord, nextStreak);
      }

      showGlobalMessage(result.ok ? "백업을 복원했어요." : result.reason ?? "복원에 실패했어요.", result.ok ? "success" : "error");
    } catch {
      showGlobalMessage("백업 파일을 읽지 못했어요.", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const focusWorkspaceTabButton = (nextTab: WorkspaceTab) => {
    requestAnimationFrame(() => {
      document.getElementById(`workspace-tab-${nextTab}`)?.focus();
    });
  };

  const activateWorkspaceTab = (nextTab: WorkspaceTab) => {
    setWorkspaceTab(nextTab);
  };

  const handleWorkspaceTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: WorkspaceTab) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();

    if (event.key === "Home") {
      activateWorkspaceTab("run");
      focusWorkspaceTabButton("run");
      return;
    }

    if (event.key === "End") {
      activateWorkspaceTab("manage");
      focusWorkspaceTabButton("manage");
      return;
    }

    const currentIndex = workspaceTabOrder.indexOf(tab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + workspaceTabOrder.length) % workspaceTabOrder.length;
    const nextTab = workspaceTabOrder[nextIndex];
    activateWorkspaceTab(nextTab);
    focusWorkspaceTabButton(nextTab);
  };

  const focusComposerInput = () => {
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const openComposerWorkspace = () => {
    activateWorkspaceTab("compose");
    workspacePanelRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    focusComposerInput();
  };

  const openWorkspaceTab = (nextTab: WorkspaceTab) => {
    activateWorkspaceTab(nextTab);
    workspacePanelRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  const toggleComposerDependency = (dependencyQuestId: string) => {
    clearComposerFeedback();
    setSelectedDependencyQuestIds((prev) =>
      prev.includes(dependencyQuestId) ? prev.filter((questId) => questId !== dependencyQuestId) : [...prev, dependencyQuestId]
    );
  };

  const toggleQuestDependency = (quest: QuestItem, dependencyQuestId: string) => {
    const nextDependencies = (quest.dependencyQuestIds ?? []).includes(dependencyQuestId)
      ? (quest.dependencyQuestIds ?? []).filter((questId) => questId !== dependencyQuestId)
      : [...(quest.dependencyQuestIds ?? []), dependencyQuestId];

    const result = updateQuestMeta(quest.id, {
      dependencyQuestIds: nextDependencies.length > 0 ? nextDependencies : []
    });

    if (!result.ok) {
      showGlobalMessage(result.reason ?? "선행 퀘스트를 변경할 수 없어요.", "error");
      return;
    }

    setGlobalMessage(null);
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
    const rollbackBlockedDependentIds = quest.completed ? getCompletedDependentIds(quest.id, questMap) : [];
    const rollbackBlockedTitles = rollbackBlockedDependentIds
      .map((id) => questMap.get(id)?.title)
      .filter((title): title is string => Boolean(title));
    const rollbackBlockedPreview = rollbackBlockedTitles.slice(0, 2).join(", ");
    const rollbackBlockedSuffix =
      rollbackBlockedTitles.length > 2 ? ` 외 ${rollbackBlockedTitles.length - 2}개` : "";
    const dependencyTitles = (quest.dependencyQuestIds ?? [])
      .map((id) => questMap.get(id)?.title)
      .filter((title): title is string => Boolean(title));
    const dependencyPreview = dependencyTitles.slice(0, 2).join(", ");
    const dependencySuffix = dependencyTitles.length > 2 ? ` 외 ${dependencyTitles.length - 2}개` : "";
    const dependencyEditorOptions = record.quests
      .filter(
        (candidate) =>
          candidate.id !== quest.id &&
          candidate.title.trim().length > 0 &&
          (!candidate.completed || (quest.dependencyQuestIds ?? []).includes(candidate.id))
      )
      .map((candidate) => ({
        quest: candidate,
        blockedByCycle: wouldCreateDependencyCycle(quest.id, candidate.id, questMap)
      }));
    const isRollbackBlocked = quest.completed && rollbackBlockedDependentIds.length > 0;
    const isToggleDisabled = record.isFinalized || isBlocked || isRollbackBlocked;

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
            disabled={isToggleDisabled}
            onChange={() => {
              const result = toggleQuest(quest.id);
              if (!result.ok) {
                showGlobalMessage(result.reason ?? "수정할 수 없어요.", "error");
                return;
              }

              setGlobalMessage(null);
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

              {isRollbackBlocked ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  후행 완료
                </span>
              ) : null}
            </div>

            {isBlocked ? (
              <p className="mt-1 text-[11px] font-semibold text-rose-600">선행 필요: {blockedByTitles.join(", ")}</p>
            ) : null}

            {isRollbackBlocked ? (
              <p className="mt-1 text-[11px] font-semibold text-amber-700">
                먼저 되돌릴 퀘스트: {rollbackBlockedPreview}
                {rollbackBlockedSuffix}
              </p>
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
                  {isRollbackBlocked ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      후행 {rollbackBlockedDependentIds.length}개 완료
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
                      if (!result.ok) showGlobalMessage(result.reason ?? "우선순위를 변경할 수 없어요.", "error");
                      else setGlobalMessage(null);
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
                      if (!result.ok) showGlobalMessage(result.reason ?? "집중 고정을 변경할 수 없어요.", "error");
                      else setGlobalMessage(null);
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
                      if (!result.ok) showGlobalMessage(result.reason ?? "삭제할 수 없어요.", "error");
                      else setGlobalMessage(null);
                    }}
                  >
                    삭제
                  </Button>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-white/90 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">선행 퀘스트</p>
                      <p className="text-[11px] text-slate-500">
                        {(quest.dependencyQuestIds ?? []).length > 0
                          ? `${dependencyPreview}${dependencySuffix}`
                          : "없음"}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                      {(quest.dependencyQuestIds ?? []).length}개
                    </span>
                  </div>

                  <div className="mt-2 space-y-2">
                    {dependencyEditorOptions.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                        연결할 다른 퀘스트가 아직 없어요.
                      </p>
                    ) : (
                      dependencyEditorOptions.map((option) => {
                        const checked = (quest.dependencyQuestIds ?? []).includes(option.quest.id);
                        const disabled = record.isFinalized || option.blockedByCycle;

                        return (
                          <label
                            key={option.quest.id}
                            className={`flex items-start gap-2 rounded-xl border px-2 py-2 ${
                              disabled ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleQuestDependency(quest, option.quest.id)}
                              className="mt-0.5 h-4 w-4 shrink-0"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-700">{option.quest.title}</span>
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${getFloorVisualStyle(option.quest.type).badgeClass}`}>
                                  {questTypeShortLabel[option.quest.type]}
                                </span>
                                {option.quest.completed ? (
                                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                    완료됨
                                  </span>
                                ) : null}
                                {option.blockedByCycle ? (
                                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                    순환 방지
                                  </span>
                                ) : null}
                              </span>
                              {option.blockedByCycle ? (
                                <span className="mt-1 block text-[11px] font-semibold text-rose-600">
                                  이 항목을 선행으로 두면 순환 관계가 생겨요.
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </li>
    );
  };

  const renderExecutionPreviewItem = (quest: QuestItem) => {
    const blockedByIds = (quest.dependencyQuestIds ?? []).filter((id) => {
      const dependency = questMap.get(id);
      return dependency ? !dependency.completed : false;
    });
    const blockedByTitles = blockedByIds.map((id) => questMap.get(id)?.title).filter((title): title is string => Boolean(title));
    const priority = normalizeQuestPriority(quest.priority, quest.type);
    const rank = queueRankMap.get(quest.id);
    const typeVisual = getFloorVisualStyle(quest.type);
    const isBlocked = blockedByIds.length > 0;
    const isToggleDisabled = record.isFinalized || isBlocked;

    return (
      <li key={quest.id} className="rounded-2xl border border-white/70 bg-white/85 px-3 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <label className="flex items-start gap-3">
          <input
            aria-label={`${quest.title} 완료 여부`}
            type="checkbox"
            checked={quest.completed}
            disabled={isToggleDisabled}
            onChange={() => {
              const result = toggleQuest(quest.id);
              if (!result.ok) {
                showGlobalMessage(result.reason ?? "수정할 수 없어요.", "error");
                return;
              }

              setGlobalMessage(null);
            }}
            className="mt-1 h-5 w-5 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${typeVisual.badgeClass}`}>
                {typeVisual.icon} {questTypeShortLabel[quest.type]}
              </span>
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${priorityButtonClass[priority]}`}>
                {priorityLabel[priority]}
              </span>
              {rank ? (
                <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                  순서 {rank}
                </span>
              ) : null}
              {isBlocked ? (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                  대기
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-sm font-semibold text-slate-800">{quest.title}</p>

            {isBlocked ? (
              <p className="mt-1 text-[11px] font-semibold text-rose-600">선행 필요: {blockedByTitles.join(", ")}</p>
            ) : null}
          </div>
        </label>
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
    <div className="space-y-3" id="today-panel-content">
      <RewardToasts toasts={toasts} />

      {globalMessage ? (
        <p
          role={globalMessage.tone === "error" ? "alert" : "status"}
          aria-live={globalMessage.tone === "error" ? "assertive" : "polite"}
          className={`rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm ${inlineStatusClass[globalMessage.tone]}`}
        >
          {globalMessage.text}
        </p>
      ) : null}

      <div ref={buildingPanelRef}>
        <Card className="relative overflow-hidden p-3" aria-labelledby="today-title">
          <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-indigo-200/35 blur-2xl" />
          <div className="pointer-events-none absolute -left-12 bottom-0 h-28 w-28 rounded-full bg-cyan-200/25 blur-2xl" />

          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">오늘 흐름</p>
              <div className="mt-1 flex items-start justify-between gap-2">
                <div>
                  <h2 id="today-title" className="text-lg font-black text-slate-900">
                    {record.date}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{feedback}</p>
                </div>
                <span className="rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  지붕 {roofTypeLabel[displayedRoofType]}
                </span>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
                  animate={{ width: `${percent}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm" aria-live="polite">
                <div className="metric-pill px-2">
                  <span className="text-[11px] font-semibold text-slate-500">완료</span>
                  <p className="text-sm font-black text-slate-800">
                    <AnimatedNumber value={record.completedCount} />/{record.totalCount}
                  </p>
                </div>
                <div className="metric-pill px-2">
                  <span className="text-[11px] font-semibold text-slate-500">연속</span>
                  <p className="text-sm font-black text-slate-800">
                    <AnimatedNumber value={streak} />일
                  </p>
                </div>
                <div className="metric-pill px-2">
                  <span className="text-[11px] font-semibold text-slate-500">주간</span>
                  <p className="text-sm font-black text-slate-800">
                    <AnimatedNumber value={weeklyPercent} />%
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/75 p-2 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-500">
                <span>실시간 건물</span>
                <span>{percent}%</span>
              </div>

              {CssFramerBuildingRenderer.render({
                height,
                roofType: displayedRoofType,
                finalized: record.isFinalized,
                animationEvent,
                reducedMotion: reduceMotion,
                completedQuestTypes,
                compact: true
              })}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button type="button" className="min-h-10 bg-white px-2 text-xs" onClick={openComposerWorkspace}>
              퀘스트 추가
            </Button>
            <Button type="button" className="min-h-10 bg-slate-100 px-2 text-xs" onClick={() => openWorkspaceTab("manage")}>
              관리 열기
            </Button>
            <Button
              type="button"
              className={`min-h-10 px-2 text-xs ${
                record.isFinalized ? "bg-amber-100 text-amber-900" : "bg-quest-primary text-white"
              }`}
              onClick={record.isFinalized ? onUnfinalizeDay : onFinalizeDay}
            >
              {record.isFinalized ? "마감 해제" : "오늘 마감"}
            </Button>
          </div>
        </Card>
      </div>

      <div ref={workspacePanelRef} className="space-y-3">
        <Card className="p-2">
          <div role="tablist" aria-label="오늘 작업 보드" className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
            {workspaceTabOrder.map((tab) => {
              const active = workspaceTab === tab;
              return (
                <Button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`workspace-tab-${tab}`}
                  aria-controls={`workspace-panel-${tab}`}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  className={`min-h-12 px-2 py-2 text-left ${
                    active ? "bg-quest-primary text-white" : "bg-transparent shadow-none"
                  }`}
                  onClick={() => activateWorkspaceTab(tab)}
                  onKeyDown={(event) => handleWorkspaceTabKeyDown(event, tab)}
                >
                  <span className="block text-sm font-bold">{workspaceTabMeta[tab].label}</span>
                  <span className={`block text-[11px] ${active ? "text-white/80" : "text-slate-500"}`}>
                    {workspaceTabMeta[tab].hint}
                  </span>
                </Button>
              );
            })}
          </div>
        </Card>

        <div
          id="workspace-panel-run"
          role="tabpanel"
          aria-labelledby="workspace-tab-run"
          hidden={workspaceTab !== "run"}
          tabIndex={-1}
        >
          <Card>
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_124px] gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Execution</p>
                <h3 className="text-base font-bold text-slate-900">지금 할 일</h3>
                <p className="mt-1 text-xs text-slate-500">오늘은 먼저 실행만 보이고, 나머지는 필요할 때 펼쳐서 정리합니다.</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                    {focusMode ? `집중 ${visibleExecutionQueue.length}개` : `남은 ${executionQueue.length}개`}
                  </span>
                  <label className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                    <span className="mr-2">집중 모드</span>
                    <input
                      type="checkbox"
                      checked={focusMode}
                      onChange={(e) => setFocusMode(e.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-2">
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-sky-700">
                  <span>체크 즉시 반영</span>
                  <span>{height}층</span>
                </div>
                {CssFramerBuildingRenderer.render({
                  height,
                  roofType: displayedRoofType,
                  finalized: record.isFinalized,
                  animationEvent,
                  reducedMotion: reduceMotion,
                  completedQuestTypes,
                  compact: true
                })}
              </div>
            </div>

            {primaryExecutionQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
                {record.totalCount === 0
                  ? "오늘 첫 퀘스트를 추가 탭에서 등록해 보세요."
                  : executionQueue.length === 0
                    ? "오늘 등록한 퀘스트를 모두 완료했어요. 관리 탭에서 하루를 마감해 보세요."
                    : allRemainingBlocked
                      ? "지금 남은 퀘스트는 모두 선행 조건으로 막혀 있어요. \"선행 필요\"가 보이는 항목부터 풀어 보세요."
                      : focusMode
                        ? "집중 모드 기준으로 지금 볼 퀘스트가 없어요. 집중 모드를 꺼보세요."
                        : "지금 바로 실행할 수 있는 퀘스트가 없어요."}
              </div>
            ) : (
              <ul className="space-y-2">{primaryExecutionQueue.map((item) => renderExecutionPreviewItem(item.quest))}</ul>
            )}

            {deferredExecutionQueue.length > 0 ? (
              <details className="disclosure mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                <summary className="disclosure-summary text-sm font-semibold text-slate-700">
                  <span>남은 퀘스트 {deferredExecutionQueue.length}개 더 보기</span>
                  <span aria-hidden="true" className="disclosure-caret">
                    ▾
                  </span>
                </summary>
                <ul className="mt-3 space-y-2">
                  {deferredExecutionQueue.map((item) => renderQuestItem(item.quest, { showTypeBadge: true }))}
                </ul>
              </details>
            ) : null}

            {visibleExecutionQueue.length > 0 && allRemainingBlocked ? (
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

            <details className="disclosure mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
              <summary className="disclosure-summary text-sm font-semibold text-slate-700">
                <span>실행 가이드 열기</span>
                <span aria-hidden="true" className="disclosure-caret">
                  ▾
                </span>
              </summary>

              <div className="mt-3 space-y-3">
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
        </div>

        <div
          id="workspace-panel-compose"
          role="tabpanel"
          aria-labelledby="workspace-tab-compose"
          hidden={workspaceTab !== "compose"}
          tabIndex={-1}
        >
          <Card>
            <div className="mb-3">
              <h3 className="text-base font-bold">빠른 퀘스트 추가</h3>
              <p className="text-xs text-slate-500">제목과 타입만 먼저 고르고 시작한 뒤, 필요할 때만 세부 규칙을 열어 주세요.</p>
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
                      if (hasTriedEmptySubmit || composerMessage) {
                        clearComposerFeedback();
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
                  <p id="quest-title-error" role="alert" className="text-xs font-semibold text-rose-600">
                    {titleErrorMessage}
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

                <p className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-600">
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
                            onClick={() => {
                              clearComposerFeedback();
                              setSelectedPriority(priority);
                            }}
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
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="block text-xs font-semibold text-slate-600">선행 퀘스트 (선택)</label>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                          {selectedDependencyQuestIds.length}개 선택
                        </span>
                      </div>

                      <div className="space-y-2">
                        {hasDependencyCandidates ? (
                          dependencyCandidates.map((quest) => {
                            const checked = selectedDependencyQuestIds.includes(quest.id);

                            return (
                              <label key={quest.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleComposerDependency(quest.id)}
                                  className="mt-0.5 h-4 w-4 shrink-0"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-semibold text-slate-700">{quest.title}</span>
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${getFloorVisualStyle(quest.type).badgeClass}`}>
                                      {questTypeShortLabel[quest.type]}
                                    </span>
                                  </span>
                                </span>
                              </label>
                            );
                          })
                        ) : (
                          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                            연결할 미완료 퀘스트가 아직 없어요. 먼저 다른 퀘스트를 추가하면 선행 조건을 설정할 수 있어요.
                          </p>
                        )}
                      </div>

                      {hasDependencyCandidates ? (
                        <p className="mt-1 text-xs text-slate-500">먼저 끝내야 하는 기존 미완료 퀘스트만 연결할 수 있어요.</p>
                      ) : null}
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
                          onChange={(e) => {
                            clearComposerFeedback();
                            setRecurrenceIntervalDays(Math.max(1, Number(e.target.value) || 1));
                          }}
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

            {composerMessage && composerMessage.tone !== "error" ? (
              <p
                role="status"
                aria-live="polite"
                className={`mt-3 rounded-xl border px-3 py-2 text-sm font-semibold ${inlineStatusClass[composerMessage.tone]}`}
              >
                {composerMessage.text}
              </p>
            ) : null}
          </Card>
        </div>

        <div
          id="workspace-panel-manage"
          role="tabpanel"
          aria-labelledby="workspace-tab-manage"
          hidden={workspaceTab !== "manage"}
          tabIndex={-1}
          className="space-y-3"
        >
          <Card>
            <h3 className="mb-1 text-base font-bold">하루 마감 컨트롤</h3>
            <p className="mb-3 text-xs text-slate-500">오늘을 닫으면 지붕이 확정되고, 필요하면 다시 열 수도 있어요.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button className="min-h-11 bg-quest-primary text-white" onClick={onFinalizeDay} disabled={record.isFinalized}>
                오늘 마감
              </Button>
              <Button className="min-h-11 bg-slate-100" onClick={onUnfinalizeDay} disabled={!record.isFinalized}>
                마감 해제
              </Button>
            </div>
          </Card>

          <Card className="p-0">
            <details className="disclosure overflow-hidden">
              <summary className="disclosure-summary p-4">
                <div>
                  <h3 className="text-base font-bold">목표 / 주간 요약</h3>
                  <p className="text-xs text-slate-500">일일 목표와 주간 페이스는 필요할 때만 열어서 조정하세요.</p>
                </div>
                <span aria-hidden="true" className="disclosure-caret">
                  ▾
                </span>
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
              </div>
            </details>
          </Card>

          <Card className="p-0">
            <details className="disclosure overflow-hidden">
              <summary className="disclosure-summary p-4">
                <div>
                  <h3 className="text-base font-bold">타입별 보기</h3>
                  <p className="text-xs text-slate-500">메인, 루틴, 서브 퀘스트를 섹션별로 정리해서 확인합니다.</p>
                </div>
                <span aria-hidden="true" className="disclosure-caret">
                  ▾
                </span>
              </summary>

              <div className="space-y-3 border-t border-slate-200/70 px-4 pb-4 pt-3">{sectionOrder.map((type) => renderQuestSection(type))}</div>
            </details>
          </Card>

          <Card className="p-0">
            <details className="disclosure overflow-hidden">
              <summary className="disclosure-summary p-4">
                <div>
                  <h3 className="text-base font-bold">백업 / 복원</h3>
                  <p className="text-xs text-slate-500">
                    {showDevTools ? "데이터 백업과 복원, 개발용 도구를 여기로 모아뒀어요." : "데이터 백업과 복원을 여기로 모아뒀어요."}
                  </p>
                </div>
                <span aria-hidden="true" className="disclosure-caret">
                  ▾
                </span>
              </summary>

              <div className="space-y-4 border-t border-slate-200/70 px-4 pb-4 pt-3">
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
                  accept=".json,application/json"
                  className="hidden"
                  onChange={onBackupImport}
                />

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
        </div>
      </div>
    </div>
  );
}
