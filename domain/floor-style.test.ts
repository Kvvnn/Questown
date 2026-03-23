import { describe, expect, it } from "vitest";
import { getFloorVisualStyle } from "./floor-style";

describe("floor style util", () => {
  it("maps all quest types to visual styles", () => {
    const daily = getFloorVisualStyle("daily");
    const main = getFloorVisualStyle("main");
    const sub = getFloorVisualStyle("sub");

    expect(daily.icon).toBe("🌤️");
    expect(main.icon).toBe("🚀");
    expect(sub.icon).toBe("🌱");
    expect(main.gradientClass).not.toBe(daily.gradientClass);
  });
});
