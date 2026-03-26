import { QuestType, RoofType } from "./types";

export interface IsometricPalette {
  top: string;
  left: string;
  right: string;
  accent: string;
}

export const districtGroundPalette = ["#d2f4e8", "#d8ecff", "#e7ddff", "#ffebcc", "#ffd9ea", "#e6edf7"] as const;

const typePalette: Record<QuestType | "empty", IsometricPalette> = {
  daily: {
    top: "#6ee7b7",
    left: "#2bb98e",
    right: "#45d1a0",
    accent: "#042f2e"
  },
  main: {
    top: "#fbbf24",
    left: "#ea8c1e",
    right: "#f5a524",
    accent: "#7c2d12"
  },
  sub: {
    top: "#c4b5fd",
    left: "#8b5cf6",
    right: "#a78bfa",
    accent: "#4c1d95"
  },
  empty: {
    top: "#e2e8f0",
    left: "#cbd5e1",
    right: "#d9e2ec",
    accent: "#475569"
  }
};

const roofPalette: Record<Exclude<RoofType, "none">, IsometricPalette> = {
  low: {
    top: "#fb923c",
    left: "#ea580c",
    right: "#f97316",
    accent: "#7c2d12"
  },
  mid: {
    top: "#fbbf24",
    left: "#d97706",
    right: "#f59e0b",
    accent: "#78350f"
  },
  high: {
    top: "#34d399",
    left: "#059669",
    right: "#10b981",
    accent: "#064e3b"
  }
};

export const fallbackQuestType = (index: number): QuestType => {
  const order: QuestType[] = ["daily", "main", "sub"];
  return order[index % order.length];
};

export const getIsometricPalette = (type: QuestType | null | undefined): IsometricPalette =>
  type ? typePalette[type] : typePalette.empty;

export const getRoofPalette = (roofType: RoofType): IsometricPalette | null =>
  roofType === "none" ? null : roofPalette[roofType];

export const getVisibleFloorCount = (height: number, maxVisibleFloors = 6) => Math.max(0, Math.min(height, maxVisibleFloors));

export const getVisibleCompletedFloorTypes = (
  height: number,
  completedQuestTypes: QuestType[],
  maxVisibleFloors = 6
) =>
  Array.from({ length: getVisibleFloorCount(height, maxVisibleFloors) }, (_, index) => completedQuestTypes[index] ?? fallbackQuestType(index));

export const getFloorCountLabel = (height: number, maxVisibleFloors = 6) => {
  if (height <= 0) return "";
  const visibleFloors = getVisibleFloorCount(height, maxVisibleFloors);
  if (height <= visibleFloors) return `${height}F`;
  return `${visibleFloors}F+${height - visibleFloors}`;
};

export const toPhaserColor = (hex: string) => Number(hex.replace("#", "0x"));
