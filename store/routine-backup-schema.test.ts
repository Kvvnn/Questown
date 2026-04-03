import { describe, expect, it } from "vitest";
import { validateRoutineBackupImportSchema } from "./routine-backup-schema";

describe("routine backup schema", () => {
  it("accepts a minimal routine backup envelope", () => {
    const result = validateRoutineBackupImportSchema({
      version: 1,
      exportedAt: "2026-03-31T00:00:00.000Z",
      state: {
        activeView: "launcher"
      }
    });

    expect(result.ok).toBe(true);
  });

  it("rejects malformed routine backup metadata", () => {
    const result = validateRoutineBackupImportSchema({
      version: 999,
      exportedAt: "broken",
      state: null
    });

    expect(result.ok).toBe(false);
  });
});
