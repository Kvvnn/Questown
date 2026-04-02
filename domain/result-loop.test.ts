import { describe, expect, it } from "vitest";
import { getFallbackResultCommentary, RESULT_LOOP_AUTO_DISMISS_MS, shouldShowResultLoop } from "./result-loop";

describe("result loop helpers", () => {
  it("returns deterministic fallback copy by grade", () => {
    expect(
      getFallbackResultCommentary({
        resultGrade: "Perfect",
        skippedStepCount: 0,
        pausedCount: 0,
        streakBonus: 0
      })
    ).toBe("흐름이 끊기지 않았어요.");
    expect(
      getFallbackResultCommentary({
        resultGrade: "Great",
        skippedStepCount: 0,
        pausedCount: 1,
        streakBonus: 0
      })
    ).toBe("한 번 흔들렸지만 리듬을 지켰어요.");
    expect(
      getFallbackResultCommentary({
        resultGrade: "Clear",
        skippedStepCount: 0,
        pausedCount: 0,
        streakBonus: 0
      })
    ).toBe("완주했습니다. 다음엔 더 매끄럽게 줄일 수 있어요.");
  });

  it("only shows the result loop for clear+ grades", () => {
    expect(RESULT_LOOP_AUTO_DISMISS_MS).toBe(2400);
    expect(shouldShowResultLoop({ resultGrade: "Clear" })).toBe(true);
    expect(shouldShowResultLoop({ resultGrade: "Great" })).toBe(true);
    expect(shouldShowResultLoop({ resultGrade: "Perfect" })).toBe(true);
    expect(shouldShowResultLoop({ resultGrade: "Partial" })).toBe(false);
  });
});
