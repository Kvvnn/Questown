import { QualityTier, RoofType } from "./game-types";

const ROOF_LABELS: Record<RoofType, string> = {
  none: "미정",
  low: "기초 지붕",
  mid: "안정 지붕",
  high: "완성 지붕",
  gold: "골드 지붕"
};

const ROOF_BADGE_CLASS_NAMES: Record<RoofType, string> = {
  none: "bg-slate-100 text-slate-600 border-slate-200",
  low: "bg-amber-50 text-amber-700 border-amber-200",
  mid: "bg-sky-50 text-sky-700 border-sky-200",
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  gold: "bg-yellow-50 text-yellow-700 border-yellow-200"
};

const FLOOR_LABELS: Record<QualityTier, string> = {
  standard: "Standard Floor",
  refined: "Refined Floor",
  signature: "Signature Floor"
};

export const getRoofLabel = (roofType: RoofType) => ROOF_LABELS[roofType];

export const getRoofBadgeClassName = (roofType: RoofType) =>
  `border ${ROOF_BADGE_CLASS_NAMES[roofType]} rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em]`;

export const getFloorQualityLabel = (qualityTier: QualityTier) => FLOOR_LABELS[qualityTier];
