import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAiSuggestionRequest } from "./handle-ai-suggestion-request";
import { createDefaultRoutineSeed } from "@/domain/game-seeds";

describe("ai suggestions route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("rejects malformed requests with 400", async () => {
    const response = await handleAiSuggestionRequest(
      new Request("http://localhost/api/ai/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ kind: "launcher" })
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns a degraded launcher response when OpenAI env is missing", async () => {
    const seed = createDefaultRoutineSeed();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await handleAiSuggestionRequest(
      new Request("http://localhost/api/ai/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: "launcher",
          nowIso: "2026-03-31T08:30:00+09:00",
          localTimeOffsetMinutes: 540,
          routinesById: seed.routinesById,
          triggersByRoutineId: seed.triggersByRoutineId,
          sessionsById: {},
          dailyBuildingsByDate: {},
          surpriseQuestsById: {}
        })
      })
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.kind).toBe("launcher");
    expect(payload.responseSource).toBe("degraded");
    expect(payload.degradedReason).toBe("missing_env");
    expect(payload.routineSuggestion).toBeNull();
    expect(payload.surpriseQuestSuggestion).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a degraded review response when the model output is invalid", async () => {
    const seed = createDefaultRoutineSeed();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-5.4-mini";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                content: [{ type: "output_text", text: "not valid json" }]
              }
            ]
          }),
          { status: 200 }
        )
      )
    );

    const response = await handleAiSuggestionRequest(
      new Request("http://localhost/api/ai/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: "review",
          nowIso: "2026-03-31T23:30:00+09:00",
          localTimeOffsetMinutes: 540,
          dateKey: "2026-03-31",
          building: {
            dateKey: "2026-03-31",
            sessionIds: [],
            floorIds: [],
            roofType: "none",
            ornamentIds: [],
            totalScore: 0,
            successfulSessionCount: 0,
            averageNormalizedScore: 0,
            streakSnapshot: {}
          },
          routinesById: seed.routinesById,
          stepsByRoutineId: seed.stepsByRoutineId,
          triggersByRoutineId: seed.triggersByRoutineId,
          sessionsById: {},
          stepResultsBySessionId: {},
          dismissedRemainingRoutineIds: []
        })
      })
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.kind).toBe("review");
    expect(payload.responseSource).toBe("degraded");
    expect(payload.degradedReason).toBe("invalid_output");
    expect(payload.suggestion).toBeNull();
  });
});
