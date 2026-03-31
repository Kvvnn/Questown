"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  getActiveSession,
  getActiveStepTiming,
  getCurrentStep,
  getLauncherHeroRoutine,
  getLauncherSurpriseQuest,
  getNextStepPreview,
  getNextScheduledRoutine,
  getRoutineStreakSummary,
  getSessionProgress,
  getStepsForRoutine,
  getTodayBuildingPreview
} from "@/domain/game-selectors";
import {
  DailyBuilding,
  GameActiveView,
  NextScheduledRoutineCandidate,
  Routine,
  RoutineSession,
  SessionRuntime,
  RoutineStep,
  RoutineTrigger,
  SessionStepResult,
  SurpriseQuest
} from "@/domain/game-types";
import { Button, Card } from "@/components/ui";
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

const ZeroStateNote = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-2 text-sm leading-6 text-slate-500">{children}</p>
);

export interface RoutineLauncherContentProps {
  activeView: GameActiveView;
  selectedRoutineId?: string;
  activeSessionId?: string;
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  sessionsById: Record<string, RoutineSession>;
  sessionRuntimeBySessionId: Record<string, SessionRuntime>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  openRoutinePrelaunch: (routineId: string) => void;
  returnToLauncher: () => void;
  openActiveSession: () => void;
  startRoutineSession: (routineId: string, triggerSource: "manual" | "time" | "location" | "ai_recommended") => {
    ok: boolean;
    reason?: string;
    sessionId?: string;
  };
  pauseActiveSession: () => { ok: boolean; reason?: string };
  resumeActiveSession: () => { ok: boolean; reason?: string };
  completeCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  skipCurrentStep: () => { ok: boolean; reason?: string; completedSession?: boolean };
  dismissCompletedSession: () => void;
  now?: Date;
}

function LauncherHome({
  heroRoutineId,
  heroReason,
  nextScheduled,
  routinesById,
  stepsByRoutineId,
  dailyBuildingsByDate,
  surpriseQuestsById,
  sessionsById,
  activeSessionId,
  triggersByRoutineId,
  openRoutinePrelaunch,
  openActiveSession,
  now
}: {
  heroRoutineId?: string;
  heroReason?: string;
  nextScheduled: NextScheduledRoutineCandidate | null;
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  sessionsById: Record<string, RoutineSession>;
  activeSessionId?: string;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  openRoutinePrelaunch: (routineId: string) => void;
  openActiveSession: () => void;
  now: Date;
}) {
  const activeSession = getActiveSession(sessionsById, activeSessionId);
  const activeRoutine = activeSession ? routinesById[activeSession.routineId] : undefined;
  const heroRoutine = heroRoutineId ? routinesById[heroRoutineId] : undefined;
  const heroSteps = heroRoutine ? stepsByRoutineId[heroRoutine.id] ?? [] : [];
  const todayBuildingPreview = getTodayBuildingPreview(dailyBuildingsByDate, now);
  const streakSummary = getRoutineStreakSummary(dailyBuildingsByDate, routinesById);
  const surpriseQuest = getLauncherSurpriseQuest(surpriseQuestsById, now);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pb-2">
      <Card className="rounded-[30px] border border-slate-200/70 bg-white/92 px-5 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.12)]">
        <p className="text-xs font-black uppercase tracking-[0.26em] text-sky-500">Questown Launcher</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950">지금 시작 가능한 한 판만 보여줍니다.</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">목록을 읽는 대신, 바로 시작하거나 이어서 플레이할 루틴만 남깁니다.</p>
      </Card>

      <Card className="rounded-[32px] border border-slate-900/5 bg-slate-950 px-5 py-5 text-white shadow-[0_24px_56px_rgba(15,23,42,0.28)]">
        {activeSession && activeSession.status !== "completed" && activeRoutine ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">진행 중 세션</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">{activeRoutine.name}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              {stepsByRoutineId[activeRoutine.id]?.length ?? 0} step이 열려 있습니다. 새로운 루틴보다 먼저 현재 흐름을 이어갑니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-200">
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
              {heroReason ?? "지금 이 루틴이 가장 자연스럽게 열려 있습니다."}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-200">
              <span className="rounded-2xl bg-white/10 px-3 py-2">steps {heroSteps.length}</span>
              <span className="rounded-2xl bg-white/10 px-3 py-2">duration {formatDuration(heroRoutine.estimatedDurationSec)}</span>
              <span className="rounded-2xl bg-white/10 px-3 py-2">{heroRoutine.category}</span>
            </div>
            <Button className="mt-5 w-full border-0 bg-white text-slate-950" onClick={() => openRoutinePrelaunch(heroRoutine.id)}>
              지금 시작
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">지금 시작 가능한 루틴</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">준비 중</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">활성 루틴이 아직 없습니다. seed routine을 불러오면 여기서 바로 시작할 수 있습니다.</p>
          </>
        )}
      </Card>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">다음 예정 루틴</p>
        {nextScheduled ? (
          <>
            <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">{nextScheduled.routine.name}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {formatScheduledAt(nextScheduled.scheduledAt, now)}에 열립니다. 미리 step을 확인해 둘 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{nextScheduled.routine.category}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {formatTriggerSummary(triggersByRoutineId[nextScheduled.routine.id] ?? [])}
              </span>
            </div>
            <Button className="mt-4" onClick={() => openRoutinePrelaunch(nextScheduled.routine.id)}>
              준비 보기
            </Button>
          </>
        ) : (
          <ZeroStateNote>다음 7일 안에 surfaced 되는 time-trigger 루틴이 아직 없습니다.</ZeroStateNote>
        )}
      </Card>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">오늘 building 진행</p>
        {todayBuildingPreview.hasBuilding ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-semibold text-slate-700">
            <span className="rounded-2xl bg-slate-50 px-3 py-3">floor {todayBuildingPreview.floorCount}</span>
            <span className="rounded-2xl bg-slate-50 px-3 py-3">roof {todayBuildingPreview.roofType}</span>
            <span className="rounded-2xl bg-slate-50 px-3 py-3">score {todayBuildingPreview.totalScore}</span>
          </div>
        ) : (
          <ZeroStateNote>오늘 세션이 쌓이면 floor와 roof 요약이 이 카드에 표시됩니다.</ZeroStateNote>
        )}
      </Card>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">streak / combo</p>
        {streakSummary.hasData ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold text-slate-700">
            <span className="rounded-2xl bg-slate-50 px-3 py-3">{streakSummary.topRoutineName}</span>
            <span className="rounded-2xl bg-slate-50 px-3 py-3">streak {streakSummary.topRoutineStreak}</span>
          </div>
        ) : (
          <ZeroStateNote>연속 클리어와 combo 집계는 세션이 누적되면 이 카드에서 바로 확인할 수 있습니다.</ZeroStateNote>
        )}
      </Card>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 px-5 py-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">surprise quest</p>
        {surpriseQuest.hasQuest && surpriseQuest.quest ? (
          <>
            <h3 className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">{surpriseQuest.quest.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">오늘 surfaced 된 surprise quest입니다. 세션 흐름이 붙으면 여기서 요약됩니다.</p>
          </>
        ) : (
          <ZeroStateNote>AI 또는 규칙 기반 이벤트가 열리면 surprise quest 슬롯이 여기에 나타납니다.</ZeroStateNote>
        )}
      </Card>
    </div>
  );
}

function PrelaunchView({
  selectedRoutine,
  selectedSteps,
  selectedTriggers,
  isTimeWindowActive,
  startRoutineSession,
  returnToLauncher
}: {
  selectedRoutine?: Routine;
  selectedSteps: RoutineStep[];
  selectedTriggers: RoutineTrigger[];
  isTimeWindowActive: boolean;
  startRoutineSession: (routineId: string, triggerSource: "manual" | "time" | "location" | "ai_recommended") => {
    ok: boolean;
    reason?: string;
    sessionId?: string;
  };
  returnToLauncher: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  if (!selectedRoutine) {
    return (
      <div className="flex h-full flex-col justify-center gap-4">
        <Card className="rounded-[30px] border border-white/80 bg-white/88 px-5 py-5">
          <h2 className="text-xl font-black tracking-[-0.03em] text-slate-950">선택된 루틴이 없습니다.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">런처로 돌아가 다시 시작할 루틴을 선택해 주세요.</p>
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
        <p className="mt-3 text-sm leading-6 text-slate-500">
          루틴을 시작하기 전, step과 시간 감각을 짧게 확인하는 화면입니다.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-600">
          <span className="rounded-2xl bg-slate-50 px-3 py-3">{selectedRoutine.category}</span>
          <span className="rounded-2xl bg-slate-50 px-3 py-3">{selectedSteps.length} step</span>
          <span className="rounded-2xl bg-slate-50 px-3 py-3">{formatDuration(selectedRoutine.estimatedDurationSec)}</span>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          {formatTriggerSummary(selectedTriggers)}
        </p>
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
          onClick={() => {
            const triggerSource = isTimeWindowActive ? "time" : "manual";
            const result = startRoutineSession(selectedRoutine.id, triggerSource);
            if (!result.ok) {
              setErrorMessage(result.reason);
              return;
            }
            setErrorMessage(undefined);
          }}
        >
          세션 열기
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
  stepResults,
  dismissCompletedSession
}: {
  session?: RoutineSession;
  routine?: Routine;
  stepResults: SessionStepResult[];
  dismissCompletedSession: () => void;
}) {
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

  return (
    <div className="flex h-full flex-col justify-between rounded-[34px] border border-slate-900/5 bg-slate-950 px-5 py-5 text-white shadow-[0_30px_72px_rgba(15,23,42,0.32)]">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">세션 완료</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">{routine.name}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Phase 4에서 점수와 등급이 들어옵니다. 지금은 완료 기록만 고정합니다.</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-[24px] bg-white/10 px-4 py-4 text-sm font-semibold text-slate-200">
          <div>완료 step {session.completedStepCount}</div>
          <div className="mt-2">skip step {session.skippedStepCount}</div>
        </div>
        <div className="rounded-[24px] bg-white/10 px-4 py-4 text-sm font-semibold text-slate-200">
          <div>started {formatStartedAt(session.startedAt)}</div>
          <div className="mt-2">ended {session.endedAt ? formatStartedAt(session.endedAt) : "-"}</div>
        </div>
      </div>

      <Card className="mt-6 rounded-[26px] border border-white/12 bg-white/8 px-4 py-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Recorded Results</p>
        <div className="mt-3 flex flex-col gap-2">
          {stepResults.map((result) => (
            <div key={result.id} className="rounded-[18px] bg-white/8 px-3 py-3 text-sm font-semibold text-slate-200">
              step {result.order} · {result.status} · {result.elapsedSec}s
            </div>
          ))}
        </div>
      </Card>

      <Button className="mt-6 rounded-[28px] border-0 bg-white py-4 text-base font-black text-slate-950" onClick={dismissCompletedSession}>
        런처로 돌아가기
      </Button>
    </div>
  );
}

export function RoutineLauncherContent({
  activeView,
  selectedRoutineId,
  activeSessionId,
  routinesById,
  stepsByRoutineId,
  triggersByRoutineId,
  sessionsById,
  sessionRuntimeBySessionId,
  stepResultsBySessionId,
  dailyBuildingsByDate,
  surpriseQuestsById,
  openRoutinePrelaunch,
  returnToLauncher,
  openActiveSession,
  startRoutineSession,
  pauseActiveSession,
  resumeActiveSession,
  completeCurrentStep,
  skipCurrentStep,
  dismissCompletedSession,
  now = new Date()
}: RoutineLauncherContentProps) {
  const visibleView = activeView === "debug" ? "launcher" : activeView;
  const heroCandidate = getLauncherHeroRoutine(routinesById, triggersByRoutineId, now);
  const nextScheduled = getNextScheduledRoutine(routinesById, triggersByRoutineId, heroCandidate?.routine.id, now);
  const selectedRoutine = selectedRoutineId ? routinesById[selectedRoutineId] : undefined;
  const selectedSteps = getStepsForRoutine(stepsByRoutineId, selectedRoutineId);
  const selectedTriggers = selectedRoutine ? triggersByRoutineId[selectedRoutine.id] ?? [] : [];
  const selectedStartable = selectedRoutine
    ? getLauncherHeroRoutine(
        selectedRoutine ? { [selectedRoutine.id]: selectedRoutine } : {},
        selectedRoutine ? { [selectedRoutine.id]: selectedTriggers } : {},
        now
      )
    : null;
  const activeSession = getActiveSession(sessionsById, activeSessionId);
  const activeRoutine = activeSession ? routinesById[activeSession.routineId] : undefined;

  if (visibleView === "prelaunch") {
    return (
      <PrelaunchView
        selectedRoutine={selectedRoutine}
        selectedSteps={selectedSteps}
        selectedTriggers={selectedTriggers}
        isTimeWindowActive={selectedStartable?.isTimeWindowActive ?? false}
        startRoutineSession={startRoutineSession}
        returnToLauncher={returnToLauncher}
      />
    );
  }

  if (visibleView === "session") {
    return activeSession?.status === "completed" ? (
      <SessionCompletedView
        session={activeSession}
        routine={activeRoutine}
        stepResults={activeSessionId ? stepResultsBySessionId[activeSessionId] ?? [] : []}
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
      heroRoutineId={heroCandidate?.routine.id}
      heroReason={
        heroCandidate?.isTimeWindowActive
          ? "현재 시간 창이 열려 있어서 바로 시작하기 좋습니다."
          : heroCandidate
            ? "수동으로 언제든 시작할 수 있는 루틴입니다."
            : undefined
      }
      nextScheduled={nextScheduled}
      routinesById={routinesById}
      stepsByRoutineId={stepsByRoutineId}
      dailyBuildingsByDate={dailyBuildingsByDate}
      surpriseQuestsById={surpriseQuestsById}
      sessionsById={sessionsById}
      activeSessionId={activeSessionId}
      triggersByRoutineId={triggersByRoutineId}
      openRoutinePrelaunch={openRoutinePrelaunch}
      openActiveSession={openActiveSession}
      now={now}
    />
  );
}

export function RoutineLauncher() {
  const activeView = useRoutineGameStore((state) => state.activeView);
  const selectedRoutineId = useRoutineGameStore((state) => state.selectedRoutineId);
  const activeSessionId = useRoutineGameStore((state) => state.activeSessionId);
  const routinesById = useRoutineGameStore((state) => state.routinesById);
  const stepsByRoutineId = useRoutineGameStore((state) => state.stepsByRoutineId);
  const triggersByRoutineId = useRoutineGameStore((state) => state.triggersByRoutineId);
  const sessionsById = useRoutineGameStore((state) => state.sessionsById);
  const sessionRuntimeBySessionId = useRoutineGameStore((state) => state.sessionRuntimeBySessionId);
  const stepResultsBySessionId = useRoutineGameStore((state) => state.stepResultsBySessionId);
  const dailyBuildingsByDate = useRoutineGameStore((state) => state.dailyBuildingsByDate);
  const surpriseQuestsById = useRoutineGameStore((state) => state.surpriseQuestsById);
  const openRoutinePrelaunch = useRoutineGameStore((state) => state.openRoutinePrelaunch);
  const returnToLauncher = useRoutineGameStore((state) => state.returnToLauncher);
  const openActiveSession = useRoutineGameStore((state) => state.openActiveSession);
  const startRoutineSession = useRoutineGameStore((state) => state.startRoutineSession);
  const pauseActiveSession = useRoutineGameStore((state) => state.pauseActiveSession);
  const resumeActiveSession = useRoutineGameStore((state) => state.resumeActiveSession);
  const completeCurrentStep = useRoutineGameStore((state) => state.completeCurrentStep);
  const skipCurrentStep = useRoutineGameStore((state) => state.skipCurrentStep);
  const dismissCompletedSession = useRoutineGameStore((state) => state.dismissCompletedSession);

  return (
    <RoutineLauncherContent
      activeView={activeView}
      selectedRoutineId={selectedRoutineId}
      activeSessionId={activeSessionId}
      routinesById={routinesById}
      stepsByRoutineId={stepsByRoutineId}
      triggersByRoutineId={triggersByRoutineId}
      sessionsById={sessionsById}
      sessionRuntimeBySessionId={sessionRuntimeBySessionId}
      stepResultsBySessionId={stepResultsBySessionId}
      dailyBuildingsByDate={dailyBuildingsByDate}
      surpriseQuestsById={surpriseQuestsById}
      openRoutinePrelaunch={openRoutinePrelaunch}
      returnToLauncher={returnToLauncher}
      openActiveSession={openActiveSession}
      startRoutineSession={startRoutineSession}
      pauseActiveSession={pauseActiveSession}
      resumeActiveSession={resumeActiveSession}
      completeCurrentStep={completeCurrentStep}
      skipCurrentStep={skipCurrentStep}
      dismissCompletedSession={dismissCompletedSession}
    />
  );
}
