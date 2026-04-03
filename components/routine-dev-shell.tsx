"use client";

import React from "react";
import { getRoutineList, getSessionDraftSummary, getStartableRoutines, getStepsForRoutine } from "@/domain/game-selectors";
import {
  AiSuggestion,
  DailyBuilding,
  Floor,
  GameActiveView,
  ReviewSummary,
  Routine,
  RoutineSession,
  RoutineStep,
  RoutineStoreNotice,
  RoutineTrigger,
  SessionStepResult,
  SurpriseQuest,
  TownMonth
} from "@/domain/game-types";
import { StorageHealth } from "@/domain/types";
import { Button, Card } from "@/components/ui";
import { ROUTINE_GAME_STORAGE_NAME, useRoutineGameStore } from "@/store/routine-game-store";

const formatDuration = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
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

const formatTimestamp = (value: string) => {
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

const viewButtonClass = (active: boolean) =>
  active
    ? "border-slate-900 bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.18)]"
    : "border-slate-200 bg-white/80 text-slate-600";

export interface RoutineDevShellContentProps {
  activeView: GameActiveView;
  selectedRoutineId?: string;
  activeSessionId?: string;
  routinesById: Record<string, Routine>;
  stepsByRoutineId: Record<string, RoutineStep[]>;
  triggersByRoutineId: Record<string, RoutineTrigger[]>;
  sessionsById: Record<string, RoutineSession>;
  stepResultsBySessionId: Record<string, SessionStepResult[]>;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  floorsById: Record<string, Floor>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  townMonthsByKey: Record<string, TownMonth>;
  aiSuggestionsById: Record<string, AiSuggestion>;
  reviewSummariesById: Record<string, ReviewSummary>;
  storageHealth: StorageHealth;
  migrationNotice?: RoutineStoreNotice;
  recoveryNotice?: RoutineStoreNotice;
  clearMigrationNotice: () => void;
  clearRecoveryNotice: () => void;
  bootstrapDefaultRoutines: () => void;
  selectRoutine: (routineId: string | undefined) => void;
  startRoutineSession: (launchContext: {
    routineId: string;
    triggerSource: "manual" | "time" | "location" | "ai_recommended";
    triggerId?: string;
    entrySource: "launcher_hero" | "launcher_queue" | "notification";
    reasonKey: "time_window_active" | "time_window_upcoming" | "manual_fallback";
  }) => { ok: boolean; reason?: string; sessionId?: string };
  setActiveView: (view: GameActiveView) => void;
  resetGameData: () => void;
}

export function RoutineDevShellContent({
  activeView,
  selectedRoutineId,
  activeSessionId,
  routinesById,
  stepsByRoutineId,
  triggersByRoutineId,
  sessionsById,
  stepResultsBySessionId,
  dailyBuildingsByDate,
  floorsById,
  surpriseQuestsById,
  townMonthsByKey,
  aiSuggestionsById,
  reviewSummariesById,
  storageHealth,
  migrationNotice,
  recoveryNotice,
  clearMigrationNotice,
  clearRecoveryNotice,
  bootstrapDefaultRoutines,
  selectRoutine,
  startRoutineSession,
  setActiveView,
  resetGameData
}: RoutineDevShellContentProps) {
  const routineList = getRoutineList(routinesById);
  const startableRoutines = getStartableRoutines(routinesById, triggersByRoutineId, new Date());
  const startableByRoutineId = new Map(startableRoutines.map((candidate) => [candidate.routine.id, candidate]));
  const selectedRoutine = selectedRoutineId ? routinesById[selectedRoutineId] : undefined;
  const selectedSteps = getStepsForRoutine(stepsByRoutineId, selectedRoutineId);
  const sessionDraftSummary = getSessionDraftSummary(sessionsById, routinesById, stepsByRoutineId, activeSessionId);

  const totalStepCount = Object.values(stepsByRoutineId).reduce((sum, steps) => sum + steps.length, 0);
  const totalTriggerCount = Object.values(triggersByRoutineId).reduce((sum, triggers) => sum + triggers.length, 0);
  const totalStepResultCount = Object.values(stepResultsBySessionId).reduce((sum, results) => sum + results.length, 0);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pb-2">
      <Card className="rounded-[30px] border border-slate-200/70 bg-white/92 px-5 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.12)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Phase 1</p>
            <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950">Routine / Session Dev Shell</h1>
            <p className="mt-2 max-w-[34ch] text-sm leading-6 text-slate-500">
              Quest/todo 메인 경로를 내리고, 새 routine/session 도메인을 기준으로 앱을 다시 세우는 단계입니다.
            </p>
          </div>

          <div className="flex gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
            {(["launcher", "prelaunch", "session", "debug"] as GameActiveView[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setActiveView(view)}
                className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${viewButtonClass(activeView === view)}`}
                aria-pressed={activeView === view}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {migrationNotice ? (
        <Card className="rounded-[24px] border border-amber-200 bg-amber-50/92 px-4 py-4 text-sm font-semibold text-amber-950 shadow-[0_16px_32px_rgba(217,119,6,0.16)]">
          <div className="flex items-start justify-between gap-3">
            <p>{migrationNotice.body}</p>
            <button
              type="button"
              onClick={clearMigrationNotice}
              className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-amber-900"
            >
              닫기
            </button>
          </div>
        </Card>
      ) : null}

      {recoveryNotice ? (
        <Card className="rounded-[24px] border border-sky-200 bg-sky-50/92 px-4 py-4 text-sm font-semibold text-sky-950 shadow-[0_16px_32px_rgba(14,165,233,0.16)]">
          <div className="flex items-start justify-between gap-3">
            <p>{recoveryNotice.body}</p>
            <button
              type="button"
              onClick={clearRecoveryNotice}
              className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-sky-900"
            >
              닫기
            </button>
          </div>
        </Card>
      ) : null}

      <Card className="rounded-[30px] border border-slate-200/70 bg-white/92 px-5 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.12)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black tracking-[-0.03em] text-slate-950">Routine Registry</h2>
            <p className="mt-1 text-sm text-slate-500">seed routine 목록과 trigger 상태를 확인하고 세션 초안을 생성합니다.</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
            startable {startableRoutines.length}
          </span>
        </div>

        {routineList.length === 0 ? (
          <div className="mt-4 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            <p>현재 등록된 routine이 없습니다.</p>
            <Button className="mt-3" onClick={bootstrapDefaultRoutines}>
              기본 루틴 불러오기
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {routineList.map((routine) => {
              const steps = stepsByRoutineId[routine.id] ?? [];
              const triggers = triggersByRoutineId[routine.id] ?? [];
              const candidate = startableByRoutineId.get(routine.id);
              const isSelected = selectedRoutineId === routine.id;

              return (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => selectRoutine(routine.id)}
                  className={`rounded-[24px] border px-4 py-4 text-left transition ${
                    isSelected
                      ? "border-slate-900 bg-slate-950 text-white shadow-[0_18px_36px_rgba(15,23,42,0.24)]"
                      : "border-slate-200 bg-slate-50/85 text-slate-900 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black tracking-[-0.03em]">{routine.name}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                            isSelected ? "bg-white/14 text-white/88" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {routine.category}
                        </span>
                        {candidate?.isTimeWindowActive ? (
                          <span className="rounded-full bg-emerald-400/18 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
                            지금 추천
                          </span>
                        ) : candidate?.isManualAvailable ? (
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                              isSelected ? "bg-white/14 text-white/72" : "bg-slate-200 text-slate-500"
                            }`}
                          >
                            수동 시작 가능
                          </span>
                        ) : null}
                        {isSelected ? (
                          <span className="rounded-full bg-white/14 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/88">
                            선택됨
                          </span>
                        ) : null}
                      </div>
                      <div className={`mt-3 grid grid-cols-3 gap-2 text-xs font-semibold ${isSelected ? "text-white/78" : "text-slate-500"}`}>
                        <span>steps {steps.length}</span>
                        <span>duration {formatDuration(routine.estimatedDurationSec)}</span>
                        <span>triggers {triggers.length}</span>
                      </div>
                    </div>

                    <p className={`max-w-[24ch] text-xs leading-5 ${isSelected ? "text-white/72" : "text-slate-500"}`}>
                      {formatTriggerSummary(triggers)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selectedRoutine ? (
          <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Selected Routine</p>
                <h3 className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-950">{selectedRoutine.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedSteps.length} step 초안 기준으로 세션을 생성합니다.</p>
              </div>
              <Button
                onClick={() => {
                  const triggerSource = startableByRoutineId.get(selectedRoutine.id)?.isTimeWindowActive ? "time" : "manual";
                  startRoutineSession({
                    routineId: selectedRoutine.id,
                    triggerSource,
                    entrySource: "launcher_hero",
                    reasonKey: triggerSource === "time" ? "time_window_active" : "manual_fallback"
                  });
                }}
              >
                세션 초안 생성
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="rounded-[30px] border border-slate-200/70 bg-white/92 px-5 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.12)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black tracking-[-0.03em] text-slate-950">Active Session</h2>
            <p className="mt-1 text-sm text-slate-500">Phase 1에서는 draft session 생성과 store 연결까지만 확인합니다.</p>
          </div>
          {sessionDraftSummary ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
              {sessionDraftSummary.status}
            </span>
          ) : null}
        </div>

        {sessionDraftSummary ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
              <div className="grid grid-cols-2 gap-2">
                <span className="font-black text-slate-950">routine</span>
                <span>{sessionDraftSummary.routineName}</span>
                <span className="font-black text-slate-950">step count</span>
                <span>{sessionDraftSummary.stepCount}</span>
                <span className="font-black text-slate-950">session id</span>
                <span className="truncate">{sessionDraftSummary.sessionId}</span>
                <span className="font-black text-slate-950">started</span>
                <span>{formatTimestamp(sessionDraftSummary.startedAt)}</span>
              </div>
            </div>
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500">
              Phase 3에서 타이머가 들어온다.
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            먼저 routine을 선택하고 <span className="font-semibold text-slate-700">세션 초안 생성</span>을 눌러야 합니다.
          </div>
        )}
      </Card>

      <Card className="rounded-[30px] border border-slate-200/70 bg-white/92 px-5 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.12)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black tracking-[-0.03em] text-slate-950">Data Inspector</h2>
            <p className="mt-1 text-sm text-slate-500">persisted entity 수와 storage 상태를 한 번에 봅니다.</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
              storageHealth.degraded
                ? "border border-amber-200 bg-amber-50 text-amber-700"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {storageHealth.degraded ? "저하" : "정상"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
          <span>Routine: {routineList.length}</span>
          <span>Step: {totalStepCount}</span>
          <span>Trigger: {totalTriggerCount}</span>
          <span>Session: {Object.keys(sessionsById).length}</span>
          <span>Step Result: {totalStepResultCount}</span>
          <span>Building: {Object.keys(dailyBuildingsByDate).length}</span>
          <span>Floor: {Object.keys(floorsById).length}</span>
          <span>Surprise Quest: {Object.keys(surpriseQuestsById).length}</span>
          <span>Town Month: {Object.keys(townMonthsByKey).length}</span>
          <span>AI Suggestion: {Object.keys(aiSuggestionsById).length}</span>
          <span>Review Summary: {Object.keys(reviewSummariesById).length}</span>
          <span>activeView: {activeView}</span>
        </div>

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
          <p>storageKey: {ROUTINE_GAME_STORAGE_NAME}</p>
          <p className="mt-1">selectedRoutineId: {selectedRoutineId ?? "none"}</p>
          <p className="mt-1">activeSessionId: {activeSessionId ?? "none"}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={bootstrapDefaultRoutines}>
            기본 루틴 다시 불러오기
          </Button>
          <Button className="bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={resetGameData}>
            전체 초기화
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function RoutineDevShell() {
  const activeView = useRoutineGameStore((state) => state.activeView);
  const selectedRoutineId = useRoutineGameStore((state) => state.selectedRoutineId);
  const activeSessionId = useRoutineGameStore((state) => state.activeSessionId);
  const routinesById = useRoutineGameStore((state) => state.routinesById);
  const stepsByRoutineId = useRoutineGameStore((state) => state.stepsByRoutineId);
  const triggersByRoutineId = useRoutineGameStore((state) => state.triggersByRoutineId);
  const sessionsById = useRoutineGameStore((state) => state.sessionsById);
  const stepResultsBySessionId = useRoutineGameStore((state) => state.stepResultsBySessionId);
  const dailyBuildingsByDate = useRoutineGameStore((state) => state.dailyBuildingsByDate);
  const floorsById = useRoutineGameStore((state) => state.floorsById);
  const surpriseQuestsById = useRoutineGameStore((state) => state.surpriseQuestsById);
  const townMonthsByKey = useRoutineGameStore((state) => state.townMonthsByKey);
  const aiSuggestionsById = useRoutineGameStore((state) => state.aiSuggestionsById);
  const reviewSummariesById = useRoutineGameStore((state) => state.reviewSummariesById);
  const storageHealth = useRoutineGameStore((state) => state.storageHealth);
  const migrationNotice = useRoutineGameStore((state) => state.migrationNotice);
  const recoveryNotice = useRoutineGameStore((state) => state.recoveryNotice);
  const clearMigrationNotice = useRoutineGameStore((state) => state.clearMigrationNotice);
  const clearRecoveryNotice = useRoutineGameStore((state) => state.clearRecoveryNotice);
  const bootstrapDefaultRoutines = useRoutineGameStore((state) => state.bootstrapDefaultRoutines);
  const selectRoutine = useRoutineGameStore((state) => state.selectRoutine);
  const startRoutineSession = useRoutineGameStore((state) => state.startRoutineSession);
  const setActiveView = useRoutineGameStore((state) => state.setActiveView);
  const resetGameData = useRoutineGameStore((state) => state.resetGameData);

  return (
    <RoutineDevShellContent
      activeView={activeView}
      selectedRoutineId={selectedRoutineId}
      activeSessionId={activeSessionId}
      routinesById={routinesById}
      stepsByRoutineId={stepsByRoutineId}
      triggersByRoutineId={triggersByRoutineId}
      sessionsById={sessionsById}
      stepResultsBySessionId={stepResultsBySessionId}
      dailyBuildingsByDate={dailyBuildingsByDate}
      floorsById={floorsById}
      surpriseQuestsById={surpriseQuestsById}
      townMonthsByKey={townMonthsByKey}
      aiSuggestionsById={aiSuggestionsById}
      reviewSummariesById={reviewSummariesById}
      storageHealth={storageHealth}
      migrationNotice={migrationNotice}
      recoveryNotice={recoveryNotice}
      clearMigrationNotice={clearMigrationNotice}
      clearRecoveryNotice={clearRecoveryNotice}
      bootstrapDefaultRoutines={bootstrapDefaultRoutines}
      selectRoutine={selectRoutine}
      startRoutineSession={startRoutineSession}
      setActiveView={setActiveView}
      resetGameData={resetGameData}
    />
  );
}
