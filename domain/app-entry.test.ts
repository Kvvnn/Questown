import { describe, expect, it } from "vitest";
import { parseAppEntryPayload, serializeAppEntryPayload } from "./app-entry";

describe("app entry payload", () => {
  it("serializes and parses a notification payload round-trip", () => {
    const url = serializeAppEntryPayload({
      source: "notification",
      launchContext: {
        routineId: "routine-night-shutdown",
        triggerSource: "time",
        triggerId: "trigger-night-time",
        entrySource: "notification",
        reasonKey: "time_window_active"
      }
    });

    expect(
      parseAppEntryPayload(new URL(url, "https://example.com").searchParams)
    ).toEqual({
      source: "notification",
      launchContext: {
        routineId: "routine-night-shutdown",
        triggerSource: "time",
        triggerId: "trigger-night-time",
        entrySource: "notification",
        reasonKey: "time_window_active"
      }
    });
  });

  it("rejects malformed entry payloads", () => {
    expect(parseAppEntryPayload(new URLSearchParams("entry=notification&triggerSource=time"))).toBeNull();
  });
});
