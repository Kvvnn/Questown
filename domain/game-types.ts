export type RoutineCategory =
  | "morning_reset"
  | "leave_home_sprint"
  | "commute_focus"
  | "arrival_setup"
  | "night_shutdown"
  | "weekend_reset"
  | "custom";

export type TriggerType = "manual" | "time" | "location" | "ai_recommended";

export type SessionStatus = "idle" | "active_step" | "paused" | "completed" | "reviewed";

export type StepResultStatus = "success" | "grace_completed" | "late_completed" | "skipped";

export type ResultGrade = "Perfect" | "Great" | "Clear" | "Partial";

export type RoofType = "none" | "low" | "mid" | "high" | "gold";

export type QualityTier = "standard" | "refined" | "signature";

export type SurpriseQuestStatus = "proposed" | "accepted" | "completed" | "skipped" | "expired";

export type SuggestionType =
  | "routine_recommendation"
  | "routine_template"
  | "duration_tune"
  | "trigger_tune"
  | "surprise_quest"
  | "review_commentary"
  | "tomorrow_hint";

export type GameActiveView = "launcher" | "prelaunch" | "session" | "debug";

export interface Routine {
  id: string;
  name: string;
  category: RoutineCategory;
  estimatedDurationSec: number;
  themeKey: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  successProfile: "strict" | "balanced" | "gentle";
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RoutineTriggerConfig =
  | { type: "manual" }
  | { type: "time"; weekdayMask: number[]; startMinuteOfDay: number; endMinuteOfDay: number }
  | { type: "location"; geofenceId: string; enterOrExit: "enter" | "exit" }
  | { type: "ai_recommended"; recommendationWindowMin: number };

export interface RoutineTrigger {
  id: string;
  routineId: string;
  triggerType: TriggerType;
  triggerConfig: RoutineTriggerConfig;
  priority: number;
  cooldownMinutes: number;
  isEnabled: boolean;
}

export interface RoutineStep {
  id: string;
  routineId: string;
  title: string;
  order: number;
  recommendedDurationSec: number;
  minimumCompletion: "complete" | "grace_or_better" | "any_finished";
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  completionFxKey: string;
  isOptional: boolean;
}

export interface RoutineSession {
  id: string;
  routineId: string;
  dateKey: string;
  startedAt: string;
  endedAt?: string;
  triggerSource: TriggerType;
  status: SessionStatus;
  resultGrade?: ResultGrade;
  baseScore: number;
  timeBonus: number;
  comboBonus: number;
  clearBonus: number;
  focusBonus: number;
  streakBonus: number;
  totalScore: number;
  normalizedScore?: number;
  completedStepCount: number;
  skippedStepCount: number;
  pausedCount: number;
  wasGraceApplied: boolean;
  aiSuggestionId?: string;
}

export interface SessionStepResult {
  id: string;
  sessionId: string;
  stepId: string;
  order: number;
  status: StepResultStatus;
  startedAt: string;
  endedAt: string;
  elapsedSec: number;
  targetDurationSec: number;
  overtimeSec: number;
  pauseCount: number;
  comboIndexAfterStep: number;
  scoreEarned: number;
}

export interface SessionRuntime {
  sessionId: string;
  currentStepIndex: number;
  stepStartedAt: string;
  pausedAt?: string;
  accumulatedPauseMs: number;
  currentComboCount: number;
  graceUsed: boolean;
  currentStepPauseCount: number;
}

export interface ActiveStepTiming {
  elapsedMs: number;
  remainingMs: number;
  overtimeMs: number;
  isOvertime: boolean;
  targetMs: number;
}

export interface SessionProgressSnapshot {
  totalSteps: number;
  finishedSteps: number;
  completedSteps: number;
  skippedSteps: number;
  progressRatio: number;
}

export interface DailyBuilding {
  dateKey: string;
  sessionIds: string[];
  floorIds: string[];
  roofType: RoofType;
  ornamentIds: string[];
  totalScore: number;
  successfulSessionCount: number;
  averageNormalizedScore: number;
  streakSnapshot: Record<string, number>;
  reviewSummaryId?: string;
  finalizedAt?: string;
}

export interface Floor {
  id: string;
  sessionId: string;
  dateKey: string;
  routineCategory: RoutineCategory;
  visualStyleKey: string;
  qualityTier: QualityTier;
  ornamentIds: string[];
}

export interface SurpriseQuest {
  id: string;
  dateKey: string;
  title: string;
  contextType: "home" | "commute" | "work" | "night" | "health" | "generic";
  difficulty: 1 | 2 | 3 | 4 | 5;
  rewardType: "ornament" | "score" | "theme_token";
  status: SurpriseQuestStatus;
  sourceSuggestionId?: string;
  acceptedAt?: string;
  completedAt?: string;
  expiresAt?: string;
}

export interface TownPlotSnapshot {
  dateKey: string;
  floorCount: number;
  roofType: RoofType;
  ornamentIds: string[];
}

export interface TownMonth {
  monthKey: string;
  seasonTheme: "spring" | "summer" | "autumn" | "winter";
  plotSnapshots: TownPlotSnapshot[];
  landmarkIds: string[];
  totalFloorCount: number;
  generatedAt: string;
}

export interface AiSuggestion {
  id: string;
  type: SuggestionType;
  targetDateKey?: string;
  targetRoutineId?: string;
  generatedAt: string;
  reasoningSummary: string;
  confidence: number;
  applied: boolean;
  expiresAt?: string;
  payload: Record<string, unknown>;
}

export interface ReviewSummary {
  id: string;
  dateKey: string;
  generatedAt: string;
  headline: string;
  body: string;
  stableRoutines: string[];
  frictionPoints: string[];
  tomorrowHints: string[];
  source: "ai" | "fallback";
}

export interface StartableRoutineCandidate {
  routine: Routine;
  matchedTriggers: RoutineTrigger[];
  isManualAvailable: boolean;
  isTimeWindowActive: boolean;
}

export interface NextScheduledRoutineCandidate {
  routine: Routine;
  trigger: RoutineTrigger;
  scheduledAt: string;
}

export interface SessionDraftSummary {
  sessionId: string;
  routineId: string;
  routineName: string;
  stepCount: number;
  status: SessionStatus;
  triggerSource: TriggerType;
  startedAt: string;
}

export interface TodayBuildingPreview {
  hasBuilding: boolean;
  floorCount: number;
  successfulSessionCount: number;
  roofType: RoofType;
  totalScore: number;
}

export interface RoutineStreakSummary {
  hasData: boolean;
  topRoutineName?: string;
  topRoutineStreak: number;
  currentComboCount: number;
}

export interface LauncherSurpriseQuestPreview {
  hasQuest: boolean;
  quest?: SurpriseQuest;
}
