import { addDays } from "./date";
import { buildBuildingOrnamentIds } from "./town-month";
import { isClearOrBetterGrade } from "./session-scoring";
import { DailyBuilding, Floor, QualityTier, Routine, RoutineSession, SurpriseQuest } from "./game-types";

const getQualityTierFromGrade = (grade: RoutineSession["resultGrade"]): QualityTier | null => {
  if (grade === "Clear") return "standard";
  if (grade === "Great") return "refined";
  if (grade === "Perfect") return "signature";
  return null;
};

const getSessionTimestamp = (session: RoutineSession) => {
  const endedAt = session.endedAt ? new Date(session.endedAt).getTime() : NaN;
  if (!Number.isNaN(endedAt)) return endedAt;

  const startedAt = new Date(session.startedAt).getTime();
  return Number.isNaN(startedAt) ? 0 : startedAt;
};

const sortSessionsChronologically = (sessions: RoutineSession[]) =>
  [...sessions].sort((left, right) => {
    const timestampDiff = getSessionTimestamp(left) - getSessionTimestamp(right);
    if (timestampDiff !== 0) return timestampDiff;
    return left.id.localeCompare(right.id, "en");
  });

const buildRoutineDateStreaks = (sessions: RoutineSession[]) => {
  const dateStreaksByRoutineId: Record<string, Record<string, number>> = {};

  const successfulSessions = sessions.filter((session) => isClearOrBetterGrade(session.resultGrade));
  const routineIds = Array.from(new Set(successfulSessions.map((session) => session.routineId)));

  routineIds.forEach((routineId) => {
    const uniqueDateKeys = Array.from(
      new Set(successfulSessions.filter((session) => session.routineId === routineId).map((session) => session.dateKey))
    ).sort((left, right) => left.localeCompare(right, "en"));

    const streaksForRoutine: Record<string, number> = {};
    let previousDateKey: string | undefined;
    let previousStreak = 0;

    uniqueDateKeys.forEach((dateKey) => {
      const nextStreak = previousDateKey && addDays(previousDateKey, 1) === dateKey ? previousStreak + 1 : 1;
      streaksForRoutine[dateKey] = nextStreak;
      previousDateKey = dateKey;
      previousStreak = nextStreak;
    });

    dateStreaksByRoutineId[routineId] = streaksForRoutine;
  });

  return dateStreaksByRoutineId;
};

export const createFloorFromSession = ({
  routine,
  session
}: {
  routine: Routine;
  session: RoutineSession;
}): Floor | null => {
  const qualityTier = getQualityTierFromGrade(session.resultGrade);
  if (!qualityTier) return null;

  return {
    id: `floor-${session.id}`,
    sessionId: session.id,
    dateKey: session.dateKey,
    routineCategory: routine.category,
    visualStyleKey: `floor:${routine.themeKey}:${qualityTier}`,
    qualityTier,
    ornamentIds: []
  };
};

export const buildDailyBuildingForDate = ({
  dateKey,
  sessions,
  floorsBySessionId,
  streakLengthsBySessionId,
  surpriseQuestsById = {}
}: {
  dateKey: string;
  sessions: RoutineSession[];
  floorsBySessionId: Record<string, Floor>;
  streakLengthsBySessionId: Record<string, number>;
  surpriseQuestsById?: Record<string, SurpriseQuest>;
}): DailyBuilding | null => {
  const successfulSessions = sortSessionsChronologically(
    sessions.filter((session) => session.dateKey === dateKey && isClearOrBetterGrade(session.resultGrade))
  );

  if (successfulSessions.length === 0) return null;

  const streakSnapshot = successfulSessions.reduce<Record<string, number>>((snapshot, session) => {
    const streakLength = streakLengthsBySessionId[session.id] ?? 0;
    if (streakLength <= 0) return snapshot;

    return {
      ...snapshot,
      [session.routineId]: Math.max(snapshot[session.routineId] ?? 0, streakLength)
    };
  }, {});

  const normalizedScoreSum = successfulSessions.reduce((sum, session) => sum + (session.normalizedScore ?? 0), 0);

  return {
    dateKey,
    sessionIds: successfulSessions.map((session) => session.id),
    floorIds: successfulSessions.map((session) => floorsBySessionId[session.id].id),
    roofType: "none",
    ornamentIds: buildBuildingOrnamentIds({
      dateKey,
      surpriseQuestsById
    }),
    totalScore: successfulSessions.reduce((sum, session) => sum + session.totalScore, 0),
    successfulSessionCount: successfulSessions.length,
    averageNormalizedScore: normalizedScoreSum / successfulSessions.length,
    streakSnapshot
  };
};

export const rebuildSessionAggregates = ({
  sessionsById,
  routinesById,
  surpriseQuestsById = {}
}: {
  sessionsById: Record<string, RoutineSession>;
  routinesById: Record<string, Routine>;
  surpriseQuestsById?: Record<string, SurpriseQuest>;
}) => {
  const candidateSessions = sortSessionsChronologically(
    Object.values(sessionsById).filter(
      (session) =>
        (session.status === "completed" || session.status === "reviewed") &&
        !!session.resultGrade &&
        !!routinesById[session.routineId]
    )
  );

  const floorsById: Record<string, Floor> = {};
  const floorsBySessionId: Record<string, Floor> = {};

  candidateSessions.forEach((session) => {
    const floor = createFloorFromSession({
      routine: routinesById[session.routineId],
      session
    });

    if (!floor) return;

    floorsById[floor.id] = floor;
    floorsBySessionId[session.id] = floor;
  });

  const streaksByRoutineId = buildRoutineDateStreaks(candidateSessions);
  const streakLengthsBySessionId = candidateSessions.reduce<Record<string, number>>((acc, session) => {
    if (!isClearOrBetterGrade(session.resultGrade)) return acc;

    return {
      ...acc,
      [session.id]: streaksByRoutineId[session.routineId]?.[session.dateKey] ?? 0
    };
  }, {});

  const dateKeys = Array.from(new Set(candidateSessions.map((session) => session.dateKey))).sort((left, right) =>
    left.localeCompare(right, "en")
  );

  const dailyBuildingsByDate = dateKeys.reduce<Record<string, DailyBuilding>>((acc, dateKey) => {
    const building = buildDailyBuildingForDate({
      dateKey,
      sessions: candidateSessions,
      floorsBySessionId,
      streakLengthsBySessionId,
      surpriseQuestsById
    });

    if (!building) return acc;

    return {
      ...acc,
      [dateKey]: building
    };
  }, {});

  return {
    floorsById,
    dailyBuildingsByDate
  };
};
