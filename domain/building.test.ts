import { describe, expect, it } from "vitest";
import { getBuildingHeight, getCompletionRate, getRoofType } from "./building";

describe("building utils", () => {
  it("calculates building height", () => {
    expect(getBuildingHeight(5)).toBe(5);
    expect(getBuildingHeight(-1)).toBe(0);
  });

  it("calculates completion rate safely", () => {
    expect(getCompletionRate(2, 5)).toBe(0.4);
    expect(getCompletionRate(0, 0)).toBe(0);
  });

  it("maps roof types by completion rate", () => {
    expect(getRoofType(0)).toBe("low");
    expect(getRoofType(0.4)).toBe("mid");
    expect(getRoofType(0.8)).toBe("high");
  });
});
