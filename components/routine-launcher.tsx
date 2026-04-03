"use client";

import React, { useEffect, useRef, useState } from "react";
import { MonthlyTownView } from "@/components/monthly-town-view";
import { RoutineManageView } from "@/components/routine-manage-view";
import {
  getLauncherRoutineSuggestion,
  getPendingDurationTuneSuggestion,
  getReviewCommentarySuggestion,
  getSuggestionConfidenceLabel
} from "@/domain/ai-suggestion-selectors";
import { buildFallbackReviewSummary, computeDailyRoofType } from "@/domain/day-review";
import { getDaysInMonth } from "@/domain/date";
import { getFloorQualityLabel, getRoofBadgeClassName, getRoofLabel } from "@/domain/game-building";
import { toGameDateKey } from "@/domain/game-day";
import {
  getActiveSession,
  getActiveStepTiming,
  getCurrentStep,
  getLauncherSurpriseQuest,
  getRemainingReviewRoutines,
  getNextStepPreview,
  getSessionProgress,
  getStepsForRoutine,
  getTodayBuildingPreview
} from "@/domain/game-selectors";
import { getRoutineLaunchAvailability, getTriggerEvaluatorResult } from "@/domain/routine-trigger-evaluator";
import {
  AiSuggestion,
  DailyBuilding,
  Floor,
  GameActiveView,
  RoutineBackupData,
  RoutineBackupImportPreview,
  RoutineLaunchContext,
  RoutineMigrationMeta,
  RoutineRecommendationItem,
  RoutineStoreNotice,
  ReviewSummary,
  Routine,
  RoutineSession,
  SessionRuntime,
  RoutineStep,
  RoutineTrigger,
  SessionStepResult,
  SurpriseQuest,
  TownMonth
} from "@/domain/game-types";
import { getFallbackResultCommentary, RESULT_LOOP_AUTO_DISMISS_MS, shouldShowResultLoop } from "@/domain/result-loop";
import { buildTownMonthSnapshot } from "@/domain/town-month";
import { createTownLayout, getTownMonthProgress } from "@/domain/town-map";
import { Button, Card } from "@/components/ui";
import { StorageHealth } from "@/domain/types";
import { useRoutineGameStore } from "@/store/routine-game-store";

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;

  if (minutes === 0) return `${remainSeconds}초`;
  if (remainSeconds === 0) return `${minutes}분`;
  return `${minutes}분 ${remainSeconds}초`;
};

const formatMinuteOfDay = (value: number) => {
  const hours = String(Math.floor(value / 60)).padStart(2, "0");
  const minutes = String(value % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const formatTriggerSummary = (triggers: RoutineTrigger[]) =>
  triggers
    .map((trigger) => {
      if (trigger.triggerType === "manual") return "manual";
      if (trigger.triggerType === "time" && trigger.triggerConfig.type === "time") {
        return `${formatMinuteOfDay(trigger.triggerConfig.startMinuteOfDay)}-${formatMinuteOfDay(trigger.triggerConfig.endMinuteOfDay)}`;
      }
      return trigger.triggerType;
    })
    .join(" · ");

const formatStartedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
};

const formatScheduledAt = (value: string, now: Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(date);
  startOfTarget.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000);

  const timeLabel = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);

  if (dayDelta === 0) return `오늘 ${timeLabel}`;
  if (dayDelta === 1) return `내일 ${timeLabel}`;

  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit"
  }).format(date);

  return `${dateLabel} ${timeLabel}`;
};

const formatTimerValue = (totalMs: number, { overtime = false }: { overtime?: boolean } = {}) => {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${overtime ? "+" : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const buildManualLaunchContext = (
  routineId: string,
  entrySource: RoutineLaunchContext["entrySource"] = "launcher_hero"
): RoutineLaunchContext => ({
  routineId,
  triggerSource: "manual",
  entrySource,
  reasonKey: "manual_fallback"
});

const ZeroStateNote = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-2 text-sm leading-6 text-slate-500">{children}</p>
);

const townSeasonSummary: Record<TownMonth["seasonTheme"], string> = {
  spring: "봄 테마",
  summer: "여름 테마",
  autumn: "가을 테마",
  winter: "겨울 테마"
};

export interface RoutineLauncherContentProps {
  activeView: GameActiveView;
  selectedRoutineId?: string;
  selectedLaunchContext?: RoutineLaunchContext;
  activeSessionId?: string;
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  sessionsById: Record<string, RoutineSession>;
  sessionRuntimeBySessionId: Record<string, SessionRuntime>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  floorsById: Record<string, Floor>;
  dismissedRemainingRoutineIdsByDate: Record<string, string[]>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  townMonthsByKey: Record<string, TownMonth>;
  aiSuggestionsById: Record<string, AiSuggestion>;
  reviewSummariesById: Record<string, ReviewSummary>;
  migrationMetaBySourceFingerprint: Record<string, RoutineMigrationMeta>;
  selectedTownMonthKey?: string;
  selectedTownDateKey?: string;
  notificationPermission: NotificationPermission | "unsupported";
  storageHealth: StorageHealth;
  migrationNotice?: RoutineStoreNotice;
  recoveryNotice?: RoutineStoreNotice;
  openRoutinePrelaunch: (launchContext: RoutineLaunchContext, sourceSuggestionId?: string) => void;
  openTodayReview: () => void;
  openTownView: () => void;
  closeTownView: () => void;
  openManageView: () => void;
  closeManageView: () => void;
  returnToLauncher: () => void;
  openActiveSession: () => void;
  selectTownMonth: (monthKey: string) => void;
  selectTownDate: (dateKey: string) => void;
  ensureTownMonthSnapshot: (monthKey?: string) => TownMonth | undefined;
  startRoutineSession: (launchContext: RoutineLaunchContext) => {
    ok: boolean;
    reason?: string;
    sessionId?: string;
  };
  requestNotificationPermission: () => Promise<NotificationPermission | "unsupported">;
  pauseActiveSession: () => { ok: boolean; reason?: string };
  resumeActiveSession: () => { ok: boolean; reason?: string };
  completeCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  skipCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  dismissCompletedSession: () => void;
  requestLauncherSuggestions: () => Promise<void>;
  requestDurationSuggestion: (sessionId: string) => Promise<void>;
  requestReviewSuggestion: (dateKey?: string) => Promise<void>;
  applyAiSuggestion: (suggestionId: string) => { ok: boolean; reason?: string };
  dismissAiSuggestion: (suggestionId: string) => { ok: boolean; reason?: string };
  acceptSurpriseQuest: (questId: string) => { ok: boolean; reason?: string };
  completeSurpriseQuest: (questId: string) => { ok: boolean; reason?: string };
  skipSurpriseQuest: (questId: string) => { ok: boolean; reason?: string };
  dismissRemainingRoutineForToday: (routineId: string) => void;
  confirmDayReview: () => { ok: boolean; reason?: string };
  closeDayReview: () => void;
  exportBackup: () => RoutineBackupData;
  previewBackupImport: (data: unknown) => { ok: true; preview: RoutineBackupImportPreview } | { ok: false; reason: string };
  applyBackupImport: (preview: RoutineBackupImportPreview) => { ok: boolean; reason?: string };
  clearRecoveryNotice: () => void;
  clearMigrationNotice: () => void;
  setActiveView: (view: GameActiveView) => void;
  now?: Date;
}

function LauncherHome({
  primaryRecommendation,
  upcomingRecommendations,
  routinesById,
  stepsByRoutineId,
  dailyBuildingsByDate,
  floorsById,
  surpriseQuestsById,
  townMonthsByKey,
  aiSuggestionsById,
  migrationMetaBySourceFingerprint,
  sessionsById,
  activeSessionId,
  notificationPermission,
  storageHealth,
  openTodayReview,
  openTownView,
  openManageView,
  openRoutinePrelaunch,
  openActiveSession,
  requestNotificationPermission,
  requestLauncherSuggestions,
  dismissAiSuggestion,
  acceptSurpriseQuest,
  completeSurpriseQuest,
  skipSurpriseQuest,
  launcherAiSuggestion,
  now
}: {
  primaryRecommendation: RoutineRecommendationItem | null;
  upcomingRecommendations: RoutineRecommendationItem[];
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  floorsById: Record<string, Floor>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  townMonthsByKey: Record<string, TownMonth>;
  aiSuggestionsById: Record<string, AiSuggestion>;
  migrationMetaBySourceFingerprint: Record<string, RoutineMigrationMeta>;
  sessionsById: Record<string, RoutineSession>;
  activeSessionId?: string;
  notificationPermission: NotificationPermission | "unsupported";
  storageHealth: StorageHealth;
  openTodayReview: () => void;
  openTownView: () => void;
  openManageView: () => void;
  openRoutinePrelaunch: (launchContext: RoutineLaunchContext, sourceSuggestionId?: string) => void;
  openActiveSession: () => void;
  requestNotificationPermission: () => Promise<NotificationPermission | "unsupported">;
  requestLauncherSuggestions: () => Promise<void>;
  dismissAiSuggestion: (suggestionId: string) => { ok: boolean; reason?: string };
  acceptSurpriseQuest: (questId: string) => { ok: boolean; reason?: string };
  completeSurpriseQuest: (questId: string) => { ok: boolean; reason?: string };
  skipSurpriseQuest: (questId: string) => { ok: boolean; reason?: string };
  launcherAiSuggestion?: AiSuggestion;
  now: Date;
}) {
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const activeSession = getActiveSession(sessionsById, activeSessionId);
  const activeRoutine = activeSession ? routinesById[activeSession.routineId] : undefined;
  const heroRoutine = primaryRecommendation?.routine;
  const heroSteps = heroRoutine ? stepsByRoutineId[heroRoutine.id] ?? [] : [];
  const currentGameDateKey = toGameDateKey(now);
  const currentTownMonthKey = currentGameDateKey.slice(0, 7);
  const todayBuildingPreview = getTodayBuildingPreview(dailyBuildingsByDate, now);
  const surpriseQuest = getLauncherSurpriseQuest(surpriseQuestsById, now);
  const surpriseQuestSuggestion =
    surpriseQuest.quest?.sourceSuggestionId && aiSuggestionsById[surpriseQuest.quest.sourceSuggestionId]
      ? aiSuggestionsById[surpriseQuest.quest.sourceSuggestionId]
      : undefined;
  const currentTownMonth =
    townMonthsByKey[currentTownMonthKey] ??
    buildTownMonthSnapshot({
      monthKey: currentTownMonthKey,
      dailyBuildingsByDate,
      floorsById,
      surpriseQuestsById,
      currentGameDateKey
    });
  const currentTownLayout = createTownLayout(currentTownMonthKey, getDaysInMonth(currentTownMonthKey));
  const currentTownProgress = getTownMonthProgress(currentTownLayout, currentTownMonth);
  const migrationCount = Object.keys(migrationMetaBySourceFingerprint).length;
  const hasSecondaryContent =
    upcomingRecommendations.length > 0 ||
    surpriseQuest.hasQuest ||
    notificationPermission === "default" ||
    notificationPermission === "denied";

  useEffect(() => {
    void requestLauncherSuggestions();
  }, [currentGameDateKey, requestLauncherSuggestions]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pb-2">
      <Card className="rounded-[30px] border border-slate-200/70 bg-white/92 px-5 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.12)]">
        <p className="text-xs font-black uppercase tracking-[0.26em] text-sky-500">Questown Launcher</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950">지금 시작 가능한 한 판만 보여줍니다.</h1>
      </Card>

      <Card className="rounded-[32px] border border-slate-900/5 bg-slate-950 px-5 py-5 text-white shadow-[0_24px_56px_rgba(15,23,42,0.28)]">
        {activeSession && activeSession.status !== "completed" && activeRoutine ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">진행 중 세션</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">{activeRoutine.name}</h2>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-200">
              <span className="rounded-full bg-white/12 px-3 py-1">{stepsByRoutineId[activeRoutine.id]?.length ?? 0} step</span>
              <span className="rounded-full bg-white/12 px-3 py-1">started {formatStartedAt(activeSession.startedAt)}</span>
              <span className="rounded-full bg-white/12 px-3 py-1">status {activeSession.status}</span>
            </div>
            <Button className="mt-5 w-full border-0 bg-white text-slate-950" onClick={openActiveSession}>
              계속하기
            </Button>
          </>
        ) : heroRoutine ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">지금 시작 가능한 루틴</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">{heroRoutine.name}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              {primaryRecommendation?.reasonCopy ?? "지금 이 루틴이 가장 자연스럽게 열려 있습니다."}
            </p>
            {launcherAiSuggestion?.payload.kind === "routine_recommendation" ? (
              <div className="mt-4 rounded-[24px] border border-white/12 bg-white/10 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">
                      {launcherAiSuggestion.source === "ai" ? "AI Director Note" : "추천 근거"}
                    </p>
                    <p className="mt-2 text-base font-black tracking-[-0.03em] text-white">{launcherAiSuggestion.payload.directorNote}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-white/16 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-200"
                    onClick={() => dismissAiSuggestion(launcherAiSuggestion.id)}
                  >
                    hide
                  </button>
                </div>
                {launcherAiSuggestion.source === "ai" ? (
                  <div className="mt-3">
                    <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-sky-100">
                      {getSuggestionConfidenceLabel(launcherAiSuggestion.confidence)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-200">
              <span className="rounded-2xl bg-white/10 px-3 py-2">steps {heroSteps.length}</span>
              <span className="rounded-2xl bg-white/10 px-3 py-2">duration {formatDuration(heroRoutine.estimatedDurationSec)}</span>
              <span className="rounded-2xl bg-white/10 px-3 py-2">{heroRoutine.category}</span>
            </div>
            <Button
              className="mt-5 w-full border-0 bg-white text-slate-950"
              onClick={() =>
                openRoutinePrelaunch(
                  primaryRecommendation?.launchContext ?? buildManualLaunchContext(heroRoutine.id),
                  launcherAiSuggestion?.payload.kind === "routine_recommendation" ? launcherAiSuggestion.id : undefined
                )
              }
            >
              지금 시작
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">지금 시작 가능한 루틴</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">준비 중</h2>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3">
        <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Today</p>
              <h3 className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">오늘 building 진행</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {todayBuildingPreview.hasBuilding ? `floor ${todayBuildingPreview.floorCount} · ${getRoofLabel(todayBuildingPreview.roofType)} · score ${todayBuildingPreview.totalScore}` : "아직 기록 없음"}
              </p>
            </div>
            <Button className="border-slate-200 bg-white" onClick={openTodayReview} disabled={!todayBuildingPreview.hasBuilding}>
              오늘 리뷰
            </Button>
          </div>
        </Card>

        <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Town</p>
              <h3 className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">{currentTownMonthKey.replace("-", ".")} 월 타운</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {townSeasonSummary[currentTownMonth.seasonTheme]} · 핵심 랜드마크 {currentTownProgress.coreUnlockedCount}/4 · floor {currentTownMonth.totalFloorCount}
              </p>
            </div>
            <Button className="border-slate-200 bg-white" onClick={openTownView}>
              이번 달 타운 보기
            </Button>
          </div>
        </Card>

        <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Manage</p>
              <h3 className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">migration · backup · analytics</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">import {migrationCount} · storage {storageHealth.degraded ? "degraded" : "healthy"}</p>
            </div>
            <Button className="border-slate-200 bg-white" onClick={openManageView}>
              관리 화면 열기
            </Button>
          </div>
        </Card>
      </div>

      {hasSecondaryContent ? (
        <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Secondary</p>
              <h3 className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">예정 큐 · 사이드</h3>
            </div>
            <Button className="border-slate-200 bg-white" onClick={() => setIsSecondaryOpen((value) => !value)}>
              {isSecondaryOpen ? "접기" : "보조 정보 보기"}
            </Button>
          </div>

          {isSecondaryOpen ? (
            <div className="mt-4 flex flex-col gap-3">
              <Card className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">예정 루틴 큐</p>
                {upcomingRecommendations.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-3">
                    {upcomingRecommendations.map((item) => (
                      <div key={`${item.routine.id}-${item.scheduledAt}`} className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-base font-black tracking-[-0.03em] text-slate-950">{item.routine.name}</h4>
                            <p className="mt-2 text-sm leading-6 text-slate-500">{formatScheduledAt(item.scheduledAt ?? "", now)} · preview only</p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                            {item.routine.category}
                          </span>
                        </div>
                        <Button className="mt-4 border-slate-200 bg-white" onClick={() => openRoutinePrelaunch(item.launchContext)}>
                          준비 보기
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ZeroStateNote>다음 7일 안에 surfaced 되는 time-trigger 루틴이 아직 없습니다.</ZeroStateNote>
                )}
              </Card>

              {notificationPermission === "default" ? (
                <Card className="rounded-[24px] border border-sky-100 bg-sky-50/90 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-500">Open-App Notification</p>
                  <Button className="mt-4 border-sky-200 bg-white" onClick={() => void requestNotificationPermission()}>
                    시간대 알림 켜기
                  </Button>
                </Card>
              ) : null}

              {notificationPermission === "denied" ? (
                <Card className="rounded-[24px] border border-slate-200 bg-slate-50/90 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Notification Status</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">차단됨</p>
                </Card>
              ) : null}

              <Card className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">surprise quest</p>
                {surpriseQuest.hasQuest && surpriseQuest.quest ? (
                  <>
                    <h4 className="mt-2 text-base font-black tracking-[-0.03em] text-slate-950">{surpriseQuest.quest.title}</h4>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{surpriseQuest.quest.contextType}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{surpriseQuest.quest.rewardType}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">difficulty {surpriseQuest.quest.difficulty}</span>
                    </div>
                    {surpriseQuest.quest.status === "proposed" ? (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <Button className="border-slate-200 bg-white" onClick={() => acceptSurpriseQuest(surpriseQuest.quest?.id ?? "")}>
                          받기
                        </Button>
                        <Button className="bg-slate-100" onClick={() => skipSurpriseQuest(surpriseQuest.quest?.id ?? "")}>
                          오늘은 넘기기
                        </Button>
                      </div>
                    ) : null}
                    {surpriseQuest.quest.status === "accepted" ? (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <Button className="border-slate-200 bg-white" onClick={() => completeSurpriseQuest(surpriseQuest.quest?.id ?? "")}>
                          완료 처리
                        </Button>
                        <Button className="bg-slate-100" onClick={() => skipSurpriseQuest(surpriseQuest.quest?.id ?? "")}>
                          이번엔 스킵
                        </Button>
                      </div>
                    ) : null}
                    {surpriseQuest.quest.status === "completed" ? (
                      <p className="mt-4 rounded-[18px] bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">
                        오늘 surprise quest를 완료했습니다.
                      </p>
                    ) : null}
                    {surpriseQuest.quest.status === "skipped" ? (
                      <p className="mt-4 rounded-[18px] bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-600">
                        이번 surprise quest는 오늘 흐름에서 제외했습니다.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <ZeroStateNote>없음</ZeroStateNote>
                )}
              </Card>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function ReviewBuildingStack({
  building,
  floorsById
}: {
  building: DailyBuilding;
  floorsById: Record<string, Floor>;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {building.floorIds.map((floorId, index) => {
        const floor = floorsById[floorId];
        if (!floor) return null;

        return (
          <div key={floorId} className="flex min-w-[124px] flex-1 flex-col rounded-[24px] border border-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">floor {index + 1}</p>
            <h4 className="mt-2 text-base font-black tracking-[-0.03em] text-slate-950">{getFloorQualityLabel(floor.qualityTier)}</h4>
            <p className="mt-2 text-sm text-slate-500">{floor.visualStyleKey}</p>
          </div>
        );
      })}
    </div>
  );
}

function ReviewGateView({
  remainingRoutines,
  stepsByRoutineId,
  triggersByRoutineId,
  openRoutinePrelaunch,
  dismissRemainingRoutineForToday,
  closeDayReview,
  setActiveView
}: {
  remainingRoutines: Routine[];
  stepsByRoutineId: Record<string, RoutineStep[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  openRoutinePrelaunch: (launchContext: RoutineLaunchContext, sourceSuggestionId?: string) => void;
  dismissRemainingRoutineForToday: (routineId: string) => void;
  closeDayReview: () => void;
  setActiveView: (view: GameActiveView) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-[34px] border border-slate-900/5 bg-slate-950 px-5 py-5 text-white shadow-[0_30px_72px_rgba(15,23,42,0.32)]">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Review Gate</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">남은 세션을 수행하면 지붕을 더 높일 수 있습니다.</h1>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {remainingRoutines.length > 0 ? (
          remainingRoutines.map((routine) => (
            <Card key={routine.id} className="rounded-[26px] border border-white/12 bg-white/8 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{routine.category}</p>
                  <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">{routine.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {stepsByRoutineId[routine.id]?.length ?? 0} step · {formatTriggerSummary(triggersByRoutineId[routine.id] ?? [])}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/12 px-3 py-1 text-xs font-black text-slate-300"
                  onClick={() => dismissRemainingRoutineForToday(routine.id)}
                >
                  X
                </button>
              </div>
              <div className="mt-4">
                <Button className="border-0 bg-white text-slate-950" onClick={() => openRoutinePrelaunch(buildManualLaunchContext(routine.id))}>
                  세션 열기
                </Button>
              </div>
            </Card>
          ))
        ) : (
          <Card className="rounded-[26px] border border-white/12 bg-white/8 px-4 py-4 text-sm leading-6 text-slate-300">
            남은 세션이 없습니다. 지금 바로 하루 리뷰로 넘어갈 수 있습니다.
          </Card>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button className="border-0 bg-white text-slate-950" onClick={() => setActiveView("day_review")}>
          지금 리뷰 보기
        </Button>
        <Button className="bg-white/10 text-white" onClick={closeDayReview}>
          런처로 돌아가기
        </Button>
      </div>
    </div>
  );
}

function DayReviewView({
  dateKey,
  building,
  floorsById,
  sessionsById,
  routinesById,
  stepsByRoutineId,
  stepResultsBySessionId,
  triggersByRoutineId,
  aiSuggestionsById,
  reviewSummariesById,
  dismissedRoutineIds,
  requestReviewSuggestion,
  confirmDayReview,
  closeDayReview,
  now
}: {
  dateKey: string;
  building?: DailyBuilding;
  floorsById: Record<string, Floor>;
  sessionsById: Record<string, RoutineSession>;
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  aiSuggestionsById: Record<string, AiSuggestion>;
  reviewSummariesById: Record<string, ReviewSummary>;
  dismissedRoutineIds: string[];
  requestReviewSuggestion: (dateKey?: string) => Promise<void>;
  confirmDayReview: () => { ok: boolean; reason?: string };
  closeDayReview: () => void;
  now: Date;
}) {
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!building || building.finalizedAt) return;
    void requestReviewSuggestion(dateKey);
  }, [building, dateKey, requestReviewSuggestion]);

  if (!building) {
    return (
      <div className="flex h-full flex-col justify-center gap-4">
        <Card className="rounded-[30px] border border-white/80 bg-white/92 px-5 py-5">
          <h2 className="text-xl font-black tracking-[-0.03em] text-slate-950">리뷰할 building이 아직 없습니다.</h2>
          <Button className="mt-4 bg-white" onClick={closeDayReview}>
            런처로 돌아가기
          </Button>
        </Card>
      </div>
    );
  }

  const successfulSessions = building.sessionIds
    .map((sessionId) => sessionsById[sessionId])
    .filter((session): session is RoutineSession => !!session);
  const provisionalRoof = computeDailyRoofType({
    successfulSessions,
    stepResultsBySessionId,
    stepsByRoutineId
  });
  const reviewSuggestion = getReviewCommentarySuggestion({
    aiSuggestionsById,
    dateKey
  });
  const summary =
    (building.reviewSummaryId ? reviewSummariesById[building.reviewSummaryId] : undefined) ??
    (reviewSuggestion?.payload.kind === "review_commentary" ? reviewSuggestion.payload.summary : undefined) ??
    buildFallbackReviewSummary({
      dateKey,
      building,
      sessionsById,
      routinesById,
      stepResultsBySessionId,
      stepsByRoutineId,
      triggersByRoutineId,
      dismissedRemainingRoutineIds: dismissedRoutineIds,
      now
    });
  const roofType = building.finalizedAt ? building.roofType : provisionalRoof;
  const dismissedRoutineNames = dismissedRoutineIds.map((routineId) => routinesById[routineId]?.name ?? routineId);
  const streakEntries = Object.entries(building.streakSnapshot)
    .map(([routineId, streak]) => ({
      name: routinesById[routineId]?.name ?? routineId,
      streak
    }))
    .sort((left, right) => right.streak - left.streak || left.name.localeCompare(right.name, "en"));

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-[34px] border border-slate-900/5 bg-[#fff9ee] px-5 py-5 text-slate-950 shadow-[0_30px_72px_rgba(15,23,42,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-500">Day Review</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">오늘 정산을 확인하고 지붕을 닫습니다.</h1>
        </div>
        <span className={getRoofBadgeClassName(roofType)}>{getRoofLabel(roofType)}</span>
      </div>

      <Card className="rounded-[28px] border border-amber-100 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Today Building</p>
            <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">
              floor {building.floorIds.length} · score {building.totalScore}
            </h3>
          </div>
          <div className="text-right text-xs font-semibold text-slate-500">
            <div>avg {building.averageNormalizedScore.toFixed(2)}</div>
            <div className="mt-1">{building.finalizedAt ? `확정 ${formatStartedAt(building.finalizedAt)}` : "아직 미확정"}</div>
          </div>
        </div>
        <div className="mt-4">
          <ReviewBuildingStack building={building} floorsById={floorsById} />
        </div>
      </Card>

      <Card className="rounded-[28px] border border-amber-100 bg-white px-4 py-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">오늘 성공한 루틴</p>
        <div className="mt-3 flex flex-col gap-3">
          {successfulSessions.map((session) => (
            <div key={session.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-black tracking-[-0.03em] text-slate-950">{routinesById[session.routineId]?.name ?? session.routineId}</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {session.resultGrade} · score {session.totalScore} · step {session.completedStepCount}/{session.completedStepCount + session.skippedStepCount}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-slate-600">
                  streak {building.streakSnapshot[session.routineId] ?? 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-[28px] border border-amber-100 bg-white px-4 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">오늘 요약</p>
          {reviewSuggestion ? (
            <div className="mt-3">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">
                {reviewSuggestion.source === "ai" ? "AI commentary" : "fallback commentary"}
              </span>
            </div>
          ) : null}
          <h3 className="mt-3 text-xl font-black tracking-[-0.03em] text-slate-950">{summary.headline}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">{summary.body}</p>
          <div className="mt-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Tomorrow Hint</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{summary.tomorrowHints[0] ?? "내일 첫 추천 루틴은 다음 phase에서 더 정교하게 제안됩니다."}</p>
          </div>
        </Card>

        <Card className="rounded-[28px] border border-amber-100 bg-white px-4 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Streak / Friction</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {streakEntries.length > 0 ? (
              streakEntries.map((entry) => (
                <span key={entry.name} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  {entry.name} {entry.streak}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-500">아직 누적 streak가 없습니다.</span>
            )}
          </div>
          <div className="mt-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Dismissed Remaining</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {dismissedRoutineNames.length > 0 ? dismissedRoutineNames.join(", ") : "오늘 review 계산에서 제외한 루틴이 없습니다."}
            </p>
          </div>
          <div className="mt-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Stable Routines</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {summary.stableRoutines.length > 0 ? summary.stableRoutines.join(", ") : "오늘은 아직 안정적으로 닫힌 루틴이 없습니다."}
            </p>
          </div>
        </Card>
      </div>

      {errorMessage ? <Card className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{errorMessage}</Card> : null}

      <div className="grid grid-cols-2 gap-3">
        <Button
          className="border-0 bg-slate-950 text-white"
          onClick={() => {
            const result = confirmDayReview();
            setErrorMessage(result.ok ? undefined : result.reason);
          }}
        >
          오늘 정산 확정
        </Button>
        <Button className="bg-white" onClick={closeDayReview}>
          닫기
        </Button>
      </div>
    </div>
  );
}

function PrelaunchView({
  selectedRoutine,
  selectedLaunchContext,
  selectedSteps,
  selectedTriggers,
  startRoutineSession,
  returnToLauncher,
  now = new Date()
}: {
  selectedRoutine?: Routine;
  selectedLaunchContext?: RoutineLaunchContext;
  selectedSteps: RoutineStep[];
  selectedTriggers: RoutineTrigger[];
  startRoutineSession: (launchContext: RoutineLaunchContext) => {
    ok: boolean;
    reason?: string;
    sessionId?: string;
  };
  returnToLauncher: () => void;
  now?: Date;
}) {
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const launchAvailability = selectedLaunchContext
    ? getRoutineLaunchAvailability({
        launchContext: selectedLaunchContext,
        triggers: selectedTriggers,
        now
      })
    : {
        canStartNow: true,
        windowState: "manual" as const
      };

  if (!selectedRoutine) {
    return (
      <div className="flex h-full flex-col justify-center gap-4">
        <Card className="rounded-[30px] border border-white/80 bg-white/88 px-5 py-5">
          <h2 className="text-xl font-black tracking-[-0.03em] text-slate-950">선택된 루틴이 없습니다.</h2>
          <Button className="mt-4" onClick={returnToLauncher}>
            런처로 돌아가기
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pb-2">
      <Card className="rounded-[30px] border border-slate-900/5 bg-white/92 px-5 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.12)]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Prelaunch</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">{selectedRoutine.name}</h1>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-600">
          <span className="rounded-2xl bg-slate-50 px-3 py-3">{selectedRoutine.category}</span>
          <span className="rounded-2xl bg-slate-50 px-3 py-3">{selectedSteps.length} step</span>
          <span className="rounded-2xl bg-slate-50 px-3 py-3">{formatDuration(selectedRoutine.estimatedDurationSec)}</span>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          {formatTriggerSummary(selectedTriggers)}
        </p>
        {selectedLaunchContext ? (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {selectedLaunchContext.entrySource === "notification"
              ? "알림에서 바로 진입한 세션입니다."
              : selectedLaunchContext.reasonKey === "time_window_upcoming"
                ? "곧 열릴 시간대 루틴을 미리 준비 중입니다."
                : selectedLaunchContext.reasonKey === "time_window_active"
                  ? "현재 열려 있는 시간 창으로 진입합니다."
                  : "수동으로 바로 시작할 수 있습니다."}
          </p>
        ) : null}
        {!launchAvailability.canStartNow && launchAvailability.blockedReason ? (
          <p className="mt-3 rounded-[18px] bg-amber-50 px-3 py-3 text-sm font-semibold leading-6 text-amber-900">
            {launchAvailability.blockedReason}
          </p>
        ) : null}
      </Card>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Step Preview</p>
        <div className="mt-3 flex flex-col gap-3">
          {selectedSteps.map((step) => (
            <div key={step.id} className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">step {step.order}</p>
                  <h3 className="mt-1 text-base font-black tracking-[-0.03em] text-slate-950">{step.title}</h3>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                  {formatDuration(step.recommendedDurationSec)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {errorMessage ? (
        <Card className="rounded-[24px] border border-rose-200 bg-rose-50/90 px-4 py-4 text-sm font-semibold text-rose-700">
          {errorMessage}
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button className="bg-white" onClick={returnToLauncher}>
          뒤로
        </Button>
        <Button
          className="bg-slate-900 text-white hover:bg-slate-800"
          disabled={!launchAvailability.canStartNow}
          onClick={() => {
            const result = startRoutineSession(selectedLaunchContext ?? buildManualLaunchContext(selectedRoutine.id));
            if (!result.ok) {
              setErrorMessage(result.reason);
              return;
            }
            setErrorMessage(undefined);
          }}
        >
          {launchAvailability.canStartNow ? "세션 열기" : "시간 창 대기 중"}
        </Button>
      </div>
    </div>
  );
}

function HoldToSkipButton({
  disabled,
  onHoldComplete
}: {
  disabled: boolean;
  onHoldComplete: () => void;
}) {
  const HOLD_MS = 600;
  const [progress, setProgress] = useState(0);
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const clearHold = (resetProgress = true) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (resetProgress) {
      setProgress(0);
    }
  };

  useEffect(
    () => () => {
      clearHold();
    },
    []
  );

  const beginHold = () => {
    if (disabled || timeoutRef.current !== null) return;

    completedRef.current = false;
    const startedAt = Date.now();
    setProgress(0);

    intervalRef.current = window.setInterval(() => {
      setProgress(Math.min(1, (Date.now() - startedAt) / HOLD_MS));
    }, 16);

    timeoutRef.current = window.setTimeout(() => {
      completedRef.current = true;
      clearHold(false);
      setProgress(1);
      onHoldComplete();
      window.setTimeout(() => {
        completedRef.current = false;
        setProgress(0);
      }, 120);
    }, HOLD_MS);
  };

  const cancelHold = () => {
    if (completedRef.current) return;
    clearHold();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={beginHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onBlur={cancelHold}
      className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-4 py-4 text-sm font-black tracking-[-0.02em] text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="hold to skip"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 bg-amber-200/80 transition-[width]"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
      <span className="relative z-10">{disabled ? "skip 잠김" : "길게 눌러 skip"}</span>
    </button>
  );
}

function SessionRuntimeView({
  session,
  routine,
  stepsByRoutineId,
  sessionsById,
  sessionRuntimeBySessionId,
  stepResultsBySessionId,
  pauseActiveSession,
  resumeActiveSession,
  completeCurrentStep,
  skipCurrentStep,
  returnToLauncher,
  now
}: {
  session?: RoutineSession;
  routine?: Routine;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  sessionsById: Record<string, RoutineSession>;
  sessionRuntimeBySessionId: Record<string, SessionRuntime>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  pauseActiveSession: () => { ok: boolean; reason?: string };
  resumeActiveSession: () => { ok: boolean; reason?: string };
  completeCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  skipCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  returnToLauncher: () => void;
  now?: Date;
}) {
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [tickNow, setTickNow] = useState(now ?? new Date());

  useEffect(() => {
    if (now) {
      setTickNow(now);
      return;
    }

    setTickNow(new Date());
    if (session?.status !== "active_step") return;

    const intervalId = window.setInterval(() => {
      setTickNow(new Date());
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [now, session?.status, session?.id]);

  if (!session || !routine) {
    return (
      <div className="flex h-full flex-col justify-center gap-3">
        <Card className="rounded-[30px] border border-white/80 bg-white/92 px-5 py-5">
          <h2 className="text-2xl font-black tracking-[-0.03em] text-slate-950">활성 세션이 없습니다.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">런처로 돌아가 다시 시작할 루틴을 고를 수 있습니다.</p>
          <Button className="mt-4 bg-white" onClick={returnToLauncher}>
            런처로 돌아가기
          </Button>
        </Card>
      </div>
    );
  }

  const currentStep = getCurrentStep(session.id, sessionsById, sessionRuntimeBySessionId, stepsByRoutineId);
  const nextStep = getNextStepPreview(session.id, sessionsById, sessionRuntimeBySessionId, stepsByRoutineId);
  const timing = getActiveStepTiming(session.id, sessionsById, sessionRuntimeBySessionId, stepsByRoutineId, tickNow);
  const progress = getSessionProgress(session.id, sessionsById, stepsByRoutineId, stepResultsBySessionId);

  if (!currentStep || !timing || !progress) {
    return (
      <div className="flex h-full flex-col justify-center gap-3">
        <Card className="rounded-[30px] border border-rose-200 bg-rose-50/92 px-5 py-5">
          <h2 className="text-2xl font-black tracking-[-0.03em] text-rose-950">세션 런타임이 손상되었습니다.</h2>
          <p className="mt-2 text-sm leading-6 text-rose-700">현재 step을 찾지 못했습니다. 런처로 돌아가 세션을 다시 열어 주세요.</p>
          <Button className="mt-4 bg-white text-rose-900" onClick={returnToLauncher}>
            런처로 돌아가기
          </Button>
        </Card>
      </div>
    );
  }

  const stepCount = progress.totalSteps;
  const currentStepNumber = Math.min(stepCount, progress.finishedSteps + 1);

  const invoke = (action: () => { ok: boolean; reason?: string }) => {
    const result = action();
    setErrorMessage(result.ok ? undefined : result.reason);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[34px] border border-slate-900/5 bg-slate-950 px-5 py-5 text-white shadow-[0_30px_72px_rgba(15,23,42,0.32)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Routine Session</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">{routine.name}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            step {currentStepNumber}/{stepCount}
          </p>
        </div>
        <div className="rounded-[22px] bg-white/10 px-3 py-2 text-right text-xs font-semibold text-slate-200">
          <div>combo {sessionRuntimeBySessionId[session.id]?.currentComboCount ?? 0}</div>
          <div className="mt-1">started {formatStartedAt(session.startedAt)}</div>
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-300 transition-[width]" style={{ width: `${progress.progressRatio * 100}%` }} />
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">current step</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.05em]">{currentStep.title}</h2>

          {session.status === "paused" ? (
            <>
              <p className="mt-5 text-6xl font-black tracking-[-0.08em] text-amber-300">{formatTimerValue(timing.remainingMs)}</p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">일시정지</p>
            </>
          ) : (
            <>
              <p className={`mt-5 text-6xl font-black tracking-[-0.08em] ${timing.isOvertime ? "text-rose-300" : "text-white"}`}>
                {formatTimerValue(timing.isOvertime ? timing.overtimeMs : timing.remainingMs, {
                  overtime: timing.isOvertime
                })}
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-300">
                권장 시간 {formatDuration(currentStep.recommendedDurationSec)}
                {timing.isOvertime ? ` · overtime ${formatTimerValue(timing.overtimeMs, { overtime: true })}` : ""}
              </p>
            </>
          )}

          <div className="mx-auto mt-8 h-24 w-24 rounded-[28px] border border-white/12 bg-gradient-to-br from-emerald-300/28 via-sky-300/16 to-transparent p-3 shadow-[0_20px_40px_rgba(16,185,129,0.18)]">
            <div className="flex h-full w-full items-end justify-center rounded-[22px] bg-white/10">
              <div className="h-12 w-10 animate-pulse rounded-t-[14px] bg-white/80" />
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-[26px] border border-white/12 bg-white/8 px-4 py-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">next step</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-black tracking-[-0.03em] text-white">{nextStep ? nextStep.title : "마지막 step"}</p>
              <p className="mt-1 text-sm text-slate-300">
                {nextStep ? `${formatDuration(nextStep.recommendedDurationSec)} 예정` : "이 step이 끝나면 세션이 완료됩니다."}
              </p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
              {session.status === "paused" ? "paused" : "live"}
            </span>
          </div>
        </div>

        {errorMessage ? (
          <Card className="mt-4 rounded-[22px] border border-rose-200/70 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {errorMessage}
          </Card>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3">
        <Button
          className="rounded-[28px] border-0 bg-white py-4 text-base font-black text-slate-950"
          onClick={() => invoke(completeCurrentStep)}
          disabled={session.status !== "active_step"}
        >
          완료
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <Button
            className={`rounded-[28px] py-4 text-sm font-black ${
              session.status === "paused" ? "border-amber-300 bg-amber-300 text-slate-950" : "bg-white/10 text-white"
            }`}
            onClick={() => invoke(session.status === "paused" ? resumeActiveSession : pauseActiveSession)}
          >
            {session.status === "paused" ? "resume" : "pause"}
          </Button>
          <HoldToSkipButton disabled={session.status !== "active_step"} onHoldComplete={() => invoke(skipCurrentStep)} />
        </div>
      </div>
    </div>
  );
}

function SessionCompletedView({
  session,
  routine,
  floor,
  stepResults,
  aiSuggestionsById,
  requestDurationSuggestion,
  applyAiSuggestion,
  dismissAiSuggestion,
  dismissCompletedSession
}: {
  session?: RoutineSession;
  routine?: Routine;
  floor?: Floor;
  stepResults: SessionStepResult[];
  aiSuggestionsById: Record<string, AiSuggestion>;
  requestDurationSuggestion: (sessionId: string) => Promise<void>;
  applyAiSuggestion: (suggestionId: string) => { ok: boolean; reason?: string };
  dismissAiSuggestion: (suggestionId: string) => { ok: boolean; reason?: string };
  dismissCompletedSession: () => void;
}) {
  const shouldRenderResultLoop = shouldShowResultLoop(session);
  const durationSuggestion = getPendingDurationTuneSuggestion({
    aiSuggestionsById,
    sessionId: session?.id
  });

  useEffect(() => {
    if (!session || !routine) return;

    if (!shouldRenderResultLoop) {
      dismissCompletedSession();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      dismissCompletedSession();
    }, RESULT_LOOP_AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dismissCompletedSession, routine, session, shouldRenderResultLoop]);

  useEffect(() => {
    if (!session || !shouldRenderResultLoop) return;
    void requestDurationSuggestion(session.id);
  }, [requestDurationSuggestion, session, shouldRenderResultLoop]);

  if (!session || !routine) {
    return (
      <div className="flex h-full flex-col justify-center gap-3">
        <Card className="rounded-[30px] border border-white/80 bg-white/92 px-5 py-5">
          <h2 className="text-2xl font-black tracking-[-0.03em] text-slate-950">완료된 세션을 찾지 못했습니다.</h2>
          <Button className="mt-4 bg-white" onClick={dismissCompletedSession}>
            런처로 돌아가기
          </Button>
        </Card>
      </div>
    );
  }

  if (!shouldRenderResultLoop) {
    return (
      <div className="flex h-full flex-col justify-center gap-3">
        <Card className="rounded-[30px] border border-white/80 bg-white/92 px-5 py-5">
          <h2 className="text-2xl font-black tracking-[-0.03em] text-slate-950">런처로 돌아가는 중...</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">이번 세션은 floor가 생성되지 않아 결과 루프 없이 바로 복귀합니다.</p>
        </Card>
      </div>
    );
  }

  const fallbackCommentary = getFallbackResultCommentary(session);
  const stepSummary = `${session.completedStepCount} complete · ${session.skippedStepCount} skipped`;

  return (
    <div className="flex h-full flex-col justify-between rounded-[34px] border border-slate-900/5 bg-slate-950 px-5 py-5 text-white shadow-[0_30px_72px_rgba(15,23,42,0.32)]">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Result Loop</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">{routine.name}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">짧은 결과 루프를 보여준 뒤 자동으로 런처로 돌아갑니다.</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-[24px] bg-white/10 px-4 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">grade</p>
          <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">{session.resultGrade}</div>
          <div className="mt-2 text-sm font-semibold text-slate-200">score {session.totalScore}</div>
        </div>
        <div className="rounded-[24px] bg-white/10 px-4 py-4 text-sm font-semibold text-slate-200">
          <div>normalized {typeof session.normalizedScore === "number" ? session.normalizedScore.toFixed(2) : "-"}</div>
          <div className="mt-2">{stepSummary}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <span className="rounded-[20px] bg-white/8 px-3 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-200">
          clean {session.cleanRunBonus}
        </span>
        <span className="rounded-[20px] bg-white/8 px-3 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-200">
          focus {session.focusBonus}
        </span>
        <span className="rounded-[20px] bg-white/8 px-3 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-200">
          first {session.firstSessionBonus}
        </span>
        <span className="rounded-[20px] bg-white/8 px-3 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-200">
          streak {session.streakBonus}
        </span>
      </div>

      <Card className="mt-5 rounded-[26px] border border-white/12 bg-white/8 px-4 py-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">New Floor</p>
        {floor ? (
          <div className="mt-3">
            <p className="text-2xl font-black tracking-[-0.04em] text-white">{floor.qualityTier}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{floor.visualStyleKey}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-300">이번 세션에서는 새 floor가 생성되지 않았습니다.</p>
        )}
      </Card>

      <Card className="mt-4 rounded-[26px] border border-white/12 bg-white/8 px-4 py-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">AI comment</p>
        <p className="mt-3 text-base font-semibold leading-7 text-white">{fallbackCommentary}</p>
        <p className="mt-3 text-sm leading-6 text-slate-300">이번 세션 ornament 없음</p>
        <p className="mt-2 text-xs font-semibold text-slate-400">recorded step score {stepResults.reduce((sum, result) => sum + result.scoreEarned, 0)}</p>
      </Card>

      {durationSuggestion?.payload.kind === "duration_tune" ? (
        <Card className="mt-4 rounded-[26px] border border-amber-200/70 bg-amber-50 px-4 py-4 text-slate-950">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Duration Tune</p>
          <h3 className="mt-2 text-lg font-black tracking-[-0.03em]">{durationSuggestion.payload.stepTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{durationSuggestion.reasoningSummary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-full bg-white px-3 py-1">
              {formatDuration(durationSuggestion.payload.currentDurationSec)} → {formatDuration(durationSuggestion.payload.proposedDurationSec)}
            </span>
            <span className="rounded-full bg-white px-3 py-1">{getSuggestionConfidenceLabel(durationSuggestion.confidence)}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button className="border-amber-200 bg-white" onClick={() => applyAiSuggestion(durationSuggestion.id)}>
              이번부터 반영
            </Button>
            <Button className="bg-amber-100" onClick={() => dismissAiSuggestion(durationSuggestion.id)}>
              이번엔 유지
            </Button>
          </div>
        </Card>
      ) : null}

      <Button className="mt-6 rounded-[28px] border-0 bg-white py-4 text-base font-black text-slate-950" onClick={dismissCompletedSession}>
        즉시 닫기
      </Button>
    </div>
  );
}

export function RoutineLauncherContent({
  activeView,
  selectedRoutineId,
  selectedLaunchContext,
  activeSessionId,
  routinesById,
  stepsByRoutineId,
  triggersByRoutineId,
  sessionsById,
  sessionRuntimeBySessionId,
  stepResultsBySessionId,
  dailyBuildingsByDate,
  floorsById,
  dismissedRemainingRoutineIdsByDate,
  surpriseQuestsById,
  townMonthsByKey,
  aiSuggestionsById,
  reviewSummariesById,
  migrationMetaBySourceFingerprint,
  selectedTownMonthKey,
  selectedTownDateKey,
  notificationPermission,
  storageHealth,
  migrationNotice,
  recoveryNotice,
  openRoutinePrelaunch,
  openTodayReview,
  openTownView,
  closeTownView,
  openManageView,
  closeManageView,
  returnToLauncher,
  openActiveSession,
  selectTownMonth,
  selectTownDate,
  ensureTownMonthSnapshot,
  startRoutineSession,
  requestNotificationPermission,
  pauseActiveSession,
  resumeActiveSession,
  completeCurrentStep,
  skipCurrentStep,
  dismissCompletedSession,
  requestLauncherSuggestions,
  requestDurationSuggestion,
  requestReviewSuggestion,
  applyAiSuggestion,
  dismissAiSuggestion,
  acceptSurpriseQuest,
  completeSurpriseQuest,
  skipSurpriseQuest,
  dismissRemainingRoutineForToday,
  confirmDayReview,
  closeDayReview,
  exportBackup,
  previewBackupImport,
  applyBackupImport,
  clearRecoveryNotice,
  clearMigrationNotice,
  setActiveView,
  now = new Date()
}: RoutineLauncherContentProps) {
  const visibleView = activeView === "debug" ? "launcher" : activeView;
  const evaluation = getTriggerEvaluatorResult({
    routinesById,
    triggersByRoutineId,
    sessionsById,
    activeSessionId,
    now
  });
  const selectedRoutine = selectedLaunchContext
    ? routinesById[selectedLaunchContext.routineId]
    : selectedRoutineId
      ? routinesById[selectedRoutineId]
      : undefined;
  const selectedSteps = getStepsForRoutine(stepsByRoutineId, selectedRoutine?.id);
  const selectedTriggers = selectedRoutine ? triggersByRoutineId[selectedRoutine.id] ?? [] : [];
  const activeSession = getActiveSession(sessionsById, activeSessionId);
  const activeRoutine = activeSession ? routinesById[activeSession.routineId] : undefined;
  const currentGameDateKey = toGameDateKey(now);
  const currentTownMonthKey = currentGameDateKey.slice(0, 7);
  const currentBuilding = dailyBuildingsByDate[currentGameDateKey];
  const dismissedRoutineIds = dismissedRemainingRoutineIdsByDate[currentGameDateKey] ?? [];
  const launcherAiSuggestion = getLauncherRoutineSuggestion({
    aiSuggestionsById,
    dateKey: currentGameDateKey,
    routineId: evaluation.primaryRecommendation?.routine.id
  });
  const remainingReviewRoutines = getRemainingReviewRoutines({
    routinesById,
    triggersByRoutineId,
    sessionsById,
    dismissedRoutineIds,
    now
  });

  useEffect(() => {
    if (visibleView !== "town") return;
    ensureTownMonthSnapshot(selectedTownMonthKey ?? currentTownMonthKey);
  }, [currentTownMonthKey, ensureTownMonthSnapshot, selectedTownMonthKey, visibleView]);

  if (visibleView === "prelaunch") {
    return (
      <PrelaunchView
        selectedRoutine={selectedRoutine}
        selectedLaunchContext={selectedLaunchContext}
        selectedSteps={selectedSteps}
        selectedTriggers={selectedTriggers}
        startRoutineSession={startRoutineSession}
        returnToLauncher={returnToLauncher}
        now={now}
      />
    );
  }

  if (visibleView === "review_gate") {
    return (
      <ReviewGateView
        remainingRoutines={remainingReviewRoutines}
        stepsByRoutineId={stepsByRoutineId}
        triggersByRoutineId={triggersByRoutineId}
        openRoutinePrelaunch={openRoutinePrelaunch}
        dismissRemainingRoutineForToday={dismissRemainingRoutineForToday}
        closeDayReview={closeDayReview}
        setActiveView={setActiveView}
      />
    );
  }

  if (visibleView === "day_review") {
    return (
      <DayReviewView
        dateKey={currentGameDateKey}
        building={currentBuilding}
        floorsById={floorsById}
        sessionsById={sessionsById}
        routinesById={routinesById}
        stepsByRoutineId={stepsByRoutineId}
        stepResultsBySessionId={stepResultsBySessionId}
        triggersByRoutineId={triggersByRoutineId}
        aiSuggestionsById={aiSuggestionsById}
        reviewSummariesById={reviewSummariesById}
        dismissedRoutineIds={dismissedRoutineIds}
        requestReviewSuggestion={requestReviewSuggestion}
        confirmDayReview={confirmDayReview}
        closeDayReview={closeDayReview}
        now={now}
      />
    );
  }

  if (visibleView === "manage") {
    return (
      <RoutineManageView
        currentGameDateKey={currentGameDateKey}
        sessionsById={sessionsById}
        dailyBuildingsByDate={dailyBuildingsByDate}
        floorsById={floorsById}
        surpriseQuestsById={surpriseQuestsById}
        aiSuggestionsById={aiSuggestionsById}
        migrationMetaBySourceFingerprint={migrationMetaBySourceFingerprint}
        storageHealth={storageHealth}
        migrationNotice={migrationNotice}
        recoveryNotice={recoveryNotice}
        exportBackup={exportBackup}
        previewBackupImport={previewBackupImport}
        applyBackupImport={applyBackupImport}
        clearRecoveryNotice={clearRecoveryNotice}
        clearMigrationNotice={clearMigrationNotice}
        onClose={closeManageView}
      />
    );
  }

  if (visibleView === "town") {
    const activeTownMonthKey = selectedTownMonthKey ?? currentTownMonthKey;
    const activeTownMonth = townMonthsByKey[activeTownMonthKey];

    if (!activeTownMonth) {
      return (
        <div className="flex h-full flex-col justify-center gap-3">
          <Card className="rounded-[30px] border border-white/80 bg-white/92 px-5 py-5">
            <h2 className="text-2xl font-black tracking-[-0.03em] text-slate-950">타운을 준비하는 중입니다.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">이 달의 plot과 landmark를 스냅샷으로 다시 만들고 있습니다.</p>
            <Button className="mt-4 bg-white" onClick={closeTownView}>
              런처로 돌아가기
            </Button>
          </Card>
        </div>
      );
    }

    const layout = createTownLayout(activeTownMonthKey, getDaysInMonth(activeTownMonthKey));
    const monthProgress = getTownMonthProgress(layout, activeTownMonth);

    return (
      <MonthlyTownView
        townMonth={activeTownMonth}
        layout={layout}
        monthProgress={monthProgress}
        currentGameDateKey={currentGameDateKey}
        selectedDateKey={selectedTownDateKey ?? currentGameDateKey}
        dailyBuildingsByDate={dailyBuildingsByDate}
        reviewSummariesById={reviewSummariesById}
        surpriseQuestsById={surpriseQuestsById}
        canMoveToNextMonth={activeTownMonthKey < currentTownMonthKey}
        onSelectDate={selectTownDate}
        onChangeMonth={selectTownMonth}
        onClose={closeTownView}
      />
    );
  }

  if (visibleView === "session") {
    return activeSession?.status === "completed" ? (
      <SessionCompletedView
        session={activeSession}
        routine={activeRoutine}
        floor={activeSessionId ? floorsById[`floor-${activeSessionId}`] : undefined}
        stepResults={activeSessionId ? stepResultsBySessionId[activeSessionId] ?? [] : []}
        aiSuggestionsById={aiSuggestionsById}
        requestDurationSuggestion={requestDurationSuggestion}
        applyAiSuggestion={applyAiSuggestion}
        dismissAiSuggestion={dismissAiSuggestion}
        dismissCompletedSession={dismissCompletedSession}
      />
    ) : (
      <SessionRuntimeView
        session={activeSession}
        routine={activeRoutine}
        stepsByRoutineId={stepsByRoutineId}
        sessionsById={sessionsById}
        sessionRuntimeBySessionId={sessionRuntimeBySessionId}
        stepResultsBySessionId={stepResultsBySessionId}
        pauseActiveSession={pauseActiveSession}
        resumeActiveSession={resumeActiveSession}
        completeCurrentStep={completeCurrentStep}
        skipCurrentStep={skipCurrentStep}
        returnToLauncher={returnToLauncher}
        now={now}
      />
    );
  }

  return (
    <LauncherHome
      primaryRecommendation={evaluation.primaryRecommendation}
      upcomingRecommendations={evaluation.upcomingRecommendations}
      routinesById={routinesById}
      stepsByRoutineId={stepsByRoutineId}
      dailyBuildingsByDate={dailyBuildingsByDate}
      floorsById={floorsById}
      surpriseQuestsById={surpriseQuestsById}
      townMonthsByKey={townMonthsByKey}
      aiSuggestionsById={aiSuggestionsById}
      migrationMetaBySourceFingerprint={migrationMetaBySourceFingerprint}
      sessionsById={sessionsById}
      activeSessionId={activeSessionId}
      notificationPermission={notificationPermission}
      storageHealth={storageHealth}
      openTodayReview={openTodayReview}
      openTownView={openTownView}
      openManageView={openManageView}
      openRoutinePrelaunch={openRoutinePrelaunch}
      openActiveSession={openActiveSession}
      requestNotificationPermission={requestNotificationPermission}
      requestLauncherSuggestions={requestLauncherSuggestions}
      dismissAiSuggestion={dismissAiSuggestion}
      acceptSurpriseQuest={acceptSurpriseQuest}
      completeSurpriseQuest={completeSurpriseQuest}
      skipSurpriseQuest={skipSurpriseQuest}
      launcherAiSuggestion={launcherAiSuggestion}
      now={now}
    />
  );
}

export function RoutineLauncher() {
  const activeView = useRoutineGameStore((state) => state.activeView);
  const selectedRoutineId = useRoutineGameStore((state) => state.selectedRoutineId);
  const selectedLaunchContext = useRoutineGameStore((state) => state.selectedLaunchContext);
  const activeSessionId = useRoutineGameStore((state) => state.activeSessionId);
  const routinesById = useRoutineGameStore((state) => state.routinesById);
  const stepsByRoutineId = useRoutineGameStore((state) => state.stepsByRoutineId);
  const triggersByRoutineId = useRoutineGameStore((state) => state.triggersByRoutineId);
  const sessionsById = useRoutineGameStore((state) => state.sessionsById);
  const sessionRuntimeBySessionId = useRoutineGameStore((state) => state.sessionRuntimeBySessionId);
  const stepResultsBySessionId = useRoutineGameStore((state) => state.stepResultsBySessionId);
  const dailyBuildingsByDate = useRoutineGameStore((state) => state.dailyBuildingsByDate);
  const floorsById = useRoutineGameStore((state) => state.floorsById);
  const dismissedRemainingRoutineIdsByDate = useRoutineGameStore((state) => state.dismissedRemainingRoutineIdsByDate);
  const surpriseQuestsById = useRoutineGameStore((state) => state.surpriseQuestsById);
  const townMonthsByKey = useRoutineGameStore((state) => state.townMonthsByKey);
  const aiSuggestionsById = useRoutineGameStore((state) => state.aiSuggestionsById);
  const reviewSummariesById = useRoutineGameStore((state) => state.reviewSummariesById);
  const migrationMetaBySourceFingerprint = useRoutineGameStore((state) => state.migrationMetaBySourceFingerprint);
  const selectedTownMonthKey = useRoutineGameStore((state) => state.selectedTownMonthKey);
  const selectedTownDateKey = useRoutineGameStore((state) => state.selectedTownDateKey);
  const notificationPermission = useRoutineGameStore((state) => state.notificationPermission);
  const storageHealth = useRoutineGameStore((state) => state.storageHealth);
  const migrationNotice = useRoutineGameStore((state) => state.migrationNotice);
  const recoveryNotice = useRoutineGameStore((state) => state.recoveryNotice);
  const openRoutinePrelaunch = useRoutineGameStore((state) => state.openRoutinePrelaunch);
  const openTodayReview = useRoutineGameStore((state) => state.openTodayReview);
  const openTownView = useRoutineGameStore((state) => state.openTownView);
  const closeTownView = useRoutineGameStore((state) => state.closeTownView);
  const openManageView = useRoutineGameStore((state) => state.openManageView);
  const closeManageView = useRoutineGameStore((state) => state.closeManageView);
  const returnToLauncher = useRoutineGameStore((state) => state.returnToLauncher);
  const openActiveSession = useRoutineGameStore((state) => state.openActiveSession);
  const selectTownMonth = useRoutineGameStore((state) => state.selectTownMonth);
  const selectTownDate = useRoutineGameStore((state) => state.selectTownDate);
  const ensureTownMonthSnapshot = useRoutineGameStore((state) => state.ensureTownMonthSnapshot);
  const startRoutineSession = useRoutineGameStore((state) => state.startRoutineSession);
  const requestNotificationPermission = useRoutineGameStore((state) => state.requestNotificationPermission);
  const pauseActiveSession = useRoutineGameStore((state) => state.pauseActiveSession);
  const resumeActiveSession = useRoutineGameStore((state) => state.resumeActiveSession);
  const completeCurrentStep = useRoutineGameStore((state) => state.completeCurrentStep);
  const skipCurrentStep = useRoutineGameStore((state) => state.skipCurrentStep);
  const dismissCompletedSession = useRoutineGameStore((state) => state.dismissCompletedSession);
  const requestLauncherSuggestions = useRoutineGameStore((state) => state.requestLauncherSuggestions);
  const requestDurationSuggestion = useRoutineGameStore((state) => state.requestDurationSuggestion);
  const requestReviewSuggestion = useRoutineGameStore((state) => state.requestReviewSuggestion);
  const applyAiSuggestion = useRoutineGameStore((state) => state.applyAiSuggestion);
  const dismissAiSuggestion = useRoutineGameStore((state) => state.dismissAiSuggestion);
  const acceptSurpriseQuest = useRoutineGameStore((state) => state.acceptSurpriseQuest);
  const completeSurpriseQuest = useRoutineGameStore((state) => state.completeSurpriseQuest);
  const skipSurpriseQuest = useRoutineGameStore((state) => state.skipSurpriseQuest);
  const dismissRemainingRoutineForToday = useRoutineGameStore((state) => state.dismissRemainingRoutineForToday);
  const confirmDayReview = useRoutineGameStore((state) => state.confirmDayReview);
  const closeDayReview = useRoutineGameStore((state) => state.closeDayReview);
  const exportBackup = useRoutineGameStore((state) => state.exportBackup);
  const previewBackupImport = useRoutineGameStore((state) => state.previewBackupImport);
  const applyBackupImport = useRoutineGameStore((state) => state.applyBackupImport);
  const clearRecoveryNotice = useRoutineGameStore((state) => state.clearRecoveryNotice);
  const clearMigrationNotice = useRoutineGameStore((state) => state.clearMigrationNotice);
  const setActiveView = useRoutineGameStore((state) => state.setActiveView);

  return (
    <RoutineLauncherContent
      activeView={activeView}
      selectedRoutineId={selectedRoutineId}
      selectedLaunchContext={selectedLaunchContext}
      activeSessionId={activeSessionId}
      routinesById={routinesById}
      stepsByRoutineId={stepsByRoutineId}
      triggersByRoutineId={triggersByRoutineId}
      sessionsById={sessionsById}
      sessionRuntimeBySessionId={sessionRuntimeBySessionId}
      stepResultsBySessionId={stepResultsBySessionId}
      dailyBuildingsByDate={dailyBuildingsByDate}
      floorsById={floorsById}
      dismissedRemainingRoutineIdsByDate={dismissedRemainingRoutineIdsByDate}
      surpriseQuestsById={surpriseQuestsById}
      townMonthsByKey={townMonthsByKey}
      aiSuggestionsById={aiSuggestionsById}
      reviewSummariesById={reviewSummariesById}
      migrationMetaBySourceFingerprint={migrationMetaBySourceFingerprint}
      selectedTownMonthKey={selectedTownMonthKey}
      selectedTownDateKey={selectedTownDateKey}
      notificationPermission={notificationPermission}
      storageHealth={storageHealth}
      migrationNotice={migrationNotice}
      recoveryNotice={recoveryNotice}
      openRoutinePrelaunch={openRoutinePrelaunch}
      openTodayReview={openTodayReview}
      openTownView={openTownView}
      closeTownView={closeTownView}
      openManageView={openManageView}
      closeManageView={closeManageView}
      returnToLauncher={returnToLauncher}
      openActiveSession={openActiveSession}
      selectTownMonth={selectTownMonth}
      selectTownDate={selectTownDate}
      ensureTownMonthSnapshot={ensureTownMonthSnapshot}
      startRoutineSession={startRoutineSession}
      requestNotificationPermission={requestNotificationPermission}
      pauseActiveSession={pauseActiveSession}
      resumeActiveSession={resumeActiveSession}
      completeCurrentStep={completeCurrentStep}
      skipCurrentStep={skipCurrentStep}
      dismissCompletedSession={dismissCompletedSession}
      requestLauncherSuggestions={requestLauncherSuggestions}
      requestDurationSuggestion={requestDurationSuggestion}
      requestReviewSuggestion={requestReviewSuggestion}
      applyAiSuggestion={applyAiSuggestion}
      dismissAiSuggestion={dismissAiSuggestion}
      acceptSurpriseQuest={acceptSurpriseQuest}
      completeSurpriseQuest={completeSurpriseQuest}
      skipSurpriseQuest={skipSurpriseQuest}
      dismissRemainingRoutineForToday={dismissRemainingRoutineForToday}
      confirmDayReview={confirmDayReview}
      closeDayReview={closeDayReview}
      exportBackup={exportBackup}
      previewBackupImport={previewBackupImport}
      applyBackupImport={applyBackupImport}
      clearRecoveryNotice={clearRecoveryNotice}
      clearMigrationNotice={clearMigrationNotice}
      setActiveView={setActiveView}
    />
  );
}
