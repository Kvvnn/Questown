import { QuestType } from "./types";

export interface FloorVisualStyle {
  gradientClass: string;
  accentClass: string;
  badgeClass: string;
  icon: string;
}

const floorVisualByType: Record<QuestType, FloorVisualStyle> = {
  daily: {
    gradientClass: "from-blue-300 to-cyan-300",
    accentClass: "bg-blue-50",
    badgeClass: "bg-blue-100 text-blue-700",
    icon: "🌤️"
  },
  main: {
    gradientClass: "from-indigo-500 to-purple-500",
    accentClass: "bg-purple-50",
    badgeClass: "bg-purple-100 text-purple-700",
    icon: "🚀"
  },
  sub: {
    gradientClass: "from-emerald-400 to-teal-400",
    accentClass: "bg-emerald-50",
    badgeClass: "bg-emerald-100 text-emerald-700",
    icon: "🌱"
  }
};

export const getFloorVisualStyle = (type: QuestType): FloorVisualStyle => floorVisualByType[type];
