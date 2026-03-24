import { RoofType } from "./types";

export const getBuildingHeight = (completedCount: number) => Math.max(0, completedCount);

export const roofTypeLabel: Record<RoofType, string> = {
  none: "미완성",
  low: "기초 지붕",
  mid: "안정 지붕",
  high: "완성 지붕"
};

export const getCompletionRate = (completedCount: number, totalCount: number) => {
  if (totalCount <= 0) return 0;
  return completedCount / totalCount;
};

export const getRoofType = (completionRate: number): RoofType => {
  const percent = completionRate * 100;
  if (percent >= 80) return "high";
  if (percent >= 40) return "mid";
  return "low";
};

export const getDisplayedRoofType = (completedCount: number, roofType: RoofType, isFinalized: boolean): RoofType => {
  if (!isFinalized || completedCount <= 0) return "none";
  return roofType;
};
