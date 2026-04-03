import {
  AiSuggestionRouteRequest,
  AiSuggestionRouteResponse,
  isAiSuggestionRouteResponse
} from "./ai-contracts";

export const requestAiSuggestionRoute = async (request: AiSuggestionRouteRequest): Promise<AiSuggestionRouteResponse> => {
  const response = await fetch("/api/ai/suggestions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`ai suggestion route failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isAiSuggestionRouteResponse(payload)) {
    throw new Error("ai suggestion route returned an invalid payload");
  }

  return payload;
};
