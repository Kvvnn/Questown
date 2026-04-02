import { RoutineSession } from "./game-types";

export const RESULT_LOOP_AUTO_DISMISS_MS = 2400;

export const getFallbackResultCommentary = ({
  resultGrade,
  skippedStepCount,
  pausedCount,
  streakBonus
}: Pick<RoutineSession, "resultGrade" | "skippedStepCount" | "pausedCount" | "streakBonus">) => {
  if (resultGrade === "Perfect") {
    return streakBonus > 0 ? "흐름이 끊기지 않았어요. 연속 기록도 이어졌습니다." : "흐름이 끊기지 않았어요.";
  }

  if (resultGrade === "Great") {
    return pausedCount > 0 || skippedStepCount > 0
      ? "한 번 흔들렸지만 리듬을 지켰어요."
      : "거의 완벽했습니다. 리듬이 안정적으로 이어졌어요.";
  }

  if (resultGrade === "Clear") {
    return "완주했습니다. 다음엔 더 매끄럽게 줄일 수 있어요.";
  }

  return "이번 세션은 기록만 남기고 바로 런처로 돌아갑니다.";
};

export const shouldShowResultLoop = (session: Pick<RoutineSession, "resultGrade"> | undefined) =>
  session?.resultGrade === "Clear" || session?.resultGrade === "Great" || session?.resultGrade === "Perfect";
