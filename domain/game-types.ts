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
  | "duration_tune"
  | "surprise_quest"
  | "review_commentary";

export type AiSuggestionStatus = "pending" | "applied" | "dismissed" | "expired";

export type AiSuggestionSource = "ai" | "fallback";

export type GameActiveView = "launcher" | "prelaunch" | "session" | "review_gate" | "day_review" | "town" | "manage" | "debug";

export type LaunchEntrySource = "launcher_hero" | "launcher_queue" | "notification";

export type LaunchReasonKey = "time_window_active" | "time_window_upcoming" | "manual_fallback";

export interface Routine {
  id: string;
  name: string;
  category: RoutineCategory;
  sessionRole: "standard" | "day_closer";
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
  cleanRunBonus: number;
  firstSessionBonus: number;
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

export interface SessionScoringStepBreakdown {
  stepResultId: string;
  baseScore: number;
  timeBonus: number;
  comboBonus: number;
  scoreEarned: number;
}

export interface SessionScoringPayload {
  baseScore: number;
  timeBonus: number;
  comboBonus: number;
  clearBonus: number;
  cleanRunBonus: number;
  firstSessionBonus: number;
  focusBonus: number;
  streakBonus: number;
  totalScore: number;
  coreTotalScore: number;
  maxExpectedScore: number;
  normalizedScore: number;
  resultGrade: ResultGrade;
  provisionalGrade: ResultGrade;
  streakLengthAfterSession: number;
  stepBreakdowns: SessionScoringStepBreakdown[];
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

export interface RoutineRecommendationSuggestionPayload {
  kind: "routine_recommendation";
  routineId: string;
  launchContext: RoutineLaunchContext;
  directorNote: string;
}

export interface DurationTuneSuggestionPayload {
  kind: "duration_tune";
  routineId: string;
  stepId: string;
  stepTitle: string;
  currentDurationSec: number;
  proposedDurationSec: number;
  deltaSec: number;
  frictionSignals: Array<"overtime" | "pause" | "grace">;
}

export interface SurpriseQuestSuggestionPayload {
  kind: "surprise_quest";
  questId: string;
  quest: SurpriseQuest;
}

export interface ReviewCommentarySuggestionPayload {
  kind: "review_commentary";
  summary: ReviewSummary;
}

export type AiSuggestionPayload =
  | RoutineRecommendationSuggestionPayload
  | DurationTuneSuggestionPayload
  | SurpriseQuestSuggestionPayload
  | ReviewCommentarySuggestionPayload;

export interface AiSuggestion {
  id: string;
  type: SuggestionType;
  targetDateKey?: string;
  targetRoutineId?: string;
  targetSessionId?: string;
  generatedAt: string;
  reasoningSummary: string;
  confidence: number;
  status: AiSuggestionStatus;
  source: AiSuggestionSource;
  resolvedAt?: string;
  expiresAt?: string;
  payload: AiSuggestionPayload;
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
  sourceSuggestionId?: string;
}

export type RoutineImportSourceKind = "legacy_local_storage" | "legacy_backup" | "routine_backup";

export interface RoutineStoreNotice {
  title: string;
  body: string;
  tone: "info" | "success" | "warning" | "error";
}

export interface RoutineMigrationMeta {
  sourceKind: RoutineImportSourceKind;
  sourceFingerprint: string;
  importedAt: string;
  importedDateCount: number;
  importedCompletedQuestCount: number;
  unmappedQuestCount: number;
  warningCount: number;
  latestExportedAt?: string;
}

export interface RoutineBackupState {
  activeView: GameActiveView;
  selectedRoutineId?: string;
  activeSessionId?: string;
  hasBootstrappedDefaults: boolean;
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
  aiSuggestionsById: Record<string, AiSuggestion>;
  reviewSummariesById: Record<string, ReviewSummary>;
  migrationMetaBySourceFingerprint: Record<string, RoutineMigrationMeta>;
}

export interface RoutineBackupData {
  version: number;
  exportedAt: string;
  state: RoutineBackupState;
}

export interface RoutineBackupImportPreview {
  sourceKind: RoutineImportSourceKind;
  version: number;
  exportedAt: string;
  dateCount: number;
  earliestDate?: string;
  latestDate?: string;
  overwriteDateCount: number;
  newDateCount: number;
  hasRepairWarning: boolean;
  repairSummary?: string;
  alreadyImported: boolean;
  unmappedLegacyQuestCount: number;
  unmappedLegacyQuestTitles: string[];
  state: RoutineBackupState;
  migrationMeta: RoutineMigrationMeta;
}

export type RoutineAnalyticsEventType =
  | "session_completed"
  | "day_review_finalized"
  | "surprise_quest_completed"
  | "ai_suggestion_resolved"
  | "backup_import_applied";

export interface RoutineAnalyticsEvent {
  id: string;
  type: RoutineAnalyticsEventType;
  occurredAt: string;
  dateKey?: string;
  routineId?: string;
  suggestionId?: string;
  suggestionSource?: AiSuggestionSource;
  title: string;
  body: string;
}

export interface RoutineAnalyticsSnapshot {
  completedSessionsLast7: number;
  clearRateLast14: number;
  finalizedReviewRateLast14: number;
  totalFloors: number;
  currentMonthFloorCount: number;
  surpriseQuestCompletionRate: number;
  aiSuggestionAcceptanceRate: number;
  fallbackSuggestionResolutionCount: number;
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

export interface RoutineLaunchContext {
  routineId: string;
  triggerSource: TriggerType;
  triggerId?: string;
  entrySource: LaunchEntrySource;
  reasonKey: LaunchReasonKey;
}

export interface RoutineRecommendationItem {
  routine: Routine;
  trigger?: RoutineTrigger;
  launchContext: RoutineLaunchContext;
  reasonCopy: string;
  scheduledAt?: string;
  triggerWindowStartAt?: string;
  triggerWindowEndAt?: string;
  notificationWindowKey?: string;
}

export interface RoutineLaunchAvailability {
  canStartNow: boolean;
  blockedReason?: string;
  windowState: "manual" | "active" | "upcoming" | "closed" | "invalid";
}

export interface RoutineNotificationCandidate {
  title: string;
  body: string;
  launchContext: RoutineLaunchContext;
  notificationWindowKey: string;
  triggerWindowStartAt: string;
  triggerWindowEndAt: string;
}

export interface TriggerEvaluationResult {
  primaryRecommendation: RoutineRecommendationItem | null;
  upcomingRecommendations: RoutineRecommendationItem[];
  notificationCandidate: RoutineNotificationCandidate | null;
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
