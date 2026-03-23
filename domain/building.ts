import { RoofType } from "./types";

export const getBuildingHeight = (completedCount: number) => Math.max(0, completedCount);

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
