import { NextResponse } from "next/server";
import { parseAiSuggestionRouteRequest } from "@/domain/ai-contracts";
import { generateAiSuggestionResponse } from "@/server/ai-suggestion-service";

export const handleAiSuggestionRequest = async (request: Request) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseAiSuggestionRouteRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid AI suggestion request." }, { status: 400 });
  }

  const response = await generateAiSuggestionResponse(parsed);
  return NextResponse.json(response);
};
