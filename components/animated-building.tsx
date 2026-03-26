"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QuestAnimationEvent } from "@/domain/animation";
import { roofTypeLabel } from "@/domain/building";
import {
  getFloorCountLabel,
  getIsometricPalette,
  getRoofPalette,
  getVisibleCompletedFloorTypes,
  getVisibleFloorCount
} from "@/domain/isometric-building";
import { QuestType, RoofType } from "@/domain/types";

export interface AnimatedBuildingRenderer {
  render: (props: BuildingRenderProps) => ReactNode;
}

export interface BuildingRenderProps {
  height: number;
  roofType: RoofType;
  finalized?: boolean;
  animationEvent?: QuestAnimationEvent;
  reducedMotion?: boolean;
  completedQuestTypes?: QuestType[];
  compact?: boolean;
  maxVisibleFloors?: number;
}

const burstParticles = [
  { x: -36, y: -26, delay: 0 },
  { x: -12, y: -36, delay: 0.03 },
  { x: 12, y: -34, delay: 0.06 },
  { x: 30, y: -22, delay: 0.09 },
  { x: -28, y: -6, delay: 0.04 },
  { x: 0, y: -18, delay: 0.07 },
  { x: 26, y: -8, delay: 0.1 },
  { x: 0, y: -42, delay: 0.12 }
];

const getContainerAnimation = (eventType: QuestAnimationEvent["type"] | undefined, reducedMotion: boolean) => {
  if (reducedMotion || !eventType || eventType === "idle") return { y: 0, scale: 1, rotate: 0 };

  switch (eventType) {
    case "quest-complete":
      return { y: [0, -5, 0], scale: [1, 1.02, 1], rotate: [0, 0.3, 0] };
    case "goal-reached":
      return { y: [0, -8, 0], scale: [1, 1.06, 1], rotate: [0, -0.4, 0.2, 0] };
    case "streak-up":
      return { y: [0, -6, 0], scale: [1, 1.05, 1], rotate: [0, 0.6, -0.5, 0] };
    case "day-finalized":
      return { y: [0, -4, 0], scale: [1, 1.03, 1], rotate: [0, -0.2, 0] };
    default:
      return { y: 0, scale: 1, rotate: 0 };
  }
};

const getGlowClass = (eventType: QuestAnimationEvent["type"] | undefined) => {
  if (eventType === "goal-reached") return "from-amber-200/70 to-fuchsia-200/40";
  if (eventType === "streak-up") return "from-orange-200/70 to-indigo-200/40";
  if (eventType === "quest-complete") return "from-sky-200/70 to-emerald-200/40";
  if (eventType === "day-finalized") return "from-emerald-200/70 to-cyan-200/40";
  return "from-transparent to-transparent";
};

const hexToRgba = (hex: string, alpha: number) => {
  const value = hex.replace("#", "");
  const normalized = value.length === 3 ? value.split("").map((char) => `${char}${char}`).join("") : value;
  const parsed = Number.parseInt(normalized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface PrismPalette {
  top: string;
  left: string;
  right: string;
  stroke?: string;
}

function PrismSvg({
  width,
  depth,
  sideHeight,
  palette
}: {
  width: number;
  depth: number;
  sideHeight: number;
  palette: PrismPalette;
}) {
  const half = width / 2;
  const stroke = palette.stroke ?? "rgba(255,255,255,0.85)";

  return (
    <svg width={width} height={depth + sideHeight + 2} viewBox={`0 0 ${width} ${depth + sideHeight + 2}`} aria-hidden="true">
      <polygon points={`${half},0 ${width},${depth / 2} ${half},${depth} 0,${depth / 2}`} fill={palette.top} stroke={stroke} strokeWidth="1.6" />
      <polygon
        points={`${half},${depth} 0,${depth / 2} 0,${depth / 2 + sideHeight} ${half},${depth + sideHeight}`}
        fill={palette.left}
        stroke={stroke}
        strokeWidth="1.4"
      />
      <polygon
        points={`${width},${depth / 2} ${half},${depth} ${half},${depth + sideHeight} ${width},${depth / 2 + sideHeight}`}
        fill={palette.right}
        stroke={stroke}
        strokeWidth="1.4"
      />
    </svg>
  );
}

export const CssFramerBuildingRenderer: AnimatedBuildingRenderer = {
  render: ({
    height,
    roofType,
    finalized,
    animationEvent,
    reducedMotion = false,
    completedQuestTypes = [],
    compact = false,
    maxVisibleFloors
  }) => {
    const eventType = animationEvent?.type;
    const visibleFloors = getVisibleFloorCount(height, maxVisibleFloors ?? 6);
    const hiddenFloorCount = Math.max(0, height - visibleFloors);
    const displayedRoofType = finalized && visibleFloors > 0 ? roofType : "none";
    const roofPalette = getRoofPalette(displayedRoofType);
    const showBurst =
      !reducedMotion &&
      eventType !== "idle" &&
      eventType !== undefined &&
      (eventType === "goal-reached" || eventType === "day-finalized" || eventType === "streak-up");

    const floorTypes = getVisibleCompletedFloorTypes(height, completedQuestTypes, maxVisibleFloors ?? 6);
    const floorWidth = compact ? 72 : 92;
    const floorDepth = compact ? 18 : 22;
    const floorSideHeight = compact ? 12 : 14;
    const baseWidth = compact ? 102 : 128;
    const baseDepth = compact ? 22 : 26;
    const baseSideHeight = compact ? 8 : 10;
    const roofWidth = compact ? 58 : 72;
    const roofDepth = compact ? 16 : 20;
    const roofSideHeight = compact ? 10 : 12;
    const stageWidth = compact ? 150 : 188;
    const stackBottom = compact ? 16 : 20;
    const stageHeight =
      stackBottom +
      baseDepth +
      baseSideHeight +
      Math.max(visibleFloors, 1) * floorSideHeight +
      floorDepth +
      (roofPalette ? roofSideHeight + 14 : 0) +
      (compact ? 26 : 34);
    const roofLabelClass = compact ? "px-2 py-0.5 text-[10px]" : "px-2 py-1 text-xs";

    return (
      <motion.div
        className="relative mx-auto flex flex-col items-center gap-1"
        animate={getContainerAnimation(eventType, reducedMotion)}
        transition={{ type: "spring", stiffness: 230, damping: 17 }}
      >
        <div
          className={`pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b ${getGlowClass(eventType)} blur-xl`}
        />

        <AnimatePresence>
          {showBurst ? (
            <motion.div
              key={`burst-${animationEvent?.token}`}
              className={`pointer-events-none absolute left-1/2 ${compact ? "top-7" : "top-9"}`}
              initial={{ opacity: 0.95 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              {burstParticles.map((particle, idx) => (
                <motion.span
                  key={`${animationEvent?.token}-${idx}`}
                  className="absolute block h-2 w-2 rounded-full bg-amber-300"
                  initial={{ x: 0, y: 0, scale: 0.7, opacity: 0.95 }}
                  animate={{
                    x: particle.x,
                    y: particle.y,
                    scale: [0.7, 1, 0.4],
                    opacity: [0.95, 0.8, 0]
                  }}
                  transition={{ duration: 0.65, delay: particle.delay, ease: "easeOut" }}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="relative" style={{ width: stageWidth, height: stageHeight }}>
          <div
            className="pointer-events-none absolute left-1/2 rounded-full blur-xl"
            style={{
              width: compact ? 92 : 122,
              height: compact ? 24 : 30,
              bottom: 4,
              marginLeft: compact ? -46 : -61,
              background: "rgba(15, 23, 42, 0.16)"
            }}
          />

          <div className="absolute left-1/2" style={{ width: baseWidth, marginLeft: -baseWidth / 2, bottom: 0 }}>
            <PrismSvg
              width={baseWidth}
              depth={baseDepth}
              sideHeight={baseSideHeight}
              palette={{
                top: "#dbeafe",
                left: "#cbd5e1",
                right: "#dbe4ef",
                stroke: "rgba(255,255,255,0.9)"
              }}
            />
          </div>

          <AnimatePresence>
            {floorTypes.map((floorType, index) => {
              const palette = getIsometricPalette(floorType);
              const bottom = stackBottom + index * floorSideHeight;

              return (
                <motion.div
                  key={`floor-${index}`}
                  initial={reducedMotion ? false : { y: 16, opacity: 0, scale: 0.92 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{
                    type: "spring",
                    stiffness: 280,
                    damping: 18,
                    delay: reducedMotion ? 0 : index * 0.03
                  }}
                  className="absolute left-1/2"
                  style={{ width: floorWidth, marginLeft: -floorWidth / 2, bottom }}
                >
                  <PrismSvg
                    width={floorWidth}
                    depth={floorDepth}
                    sideHeight={floorSideHeight}
                    palette={{
                      top: palette.top,
                      left: palette.left,
                      right: palette.right,
                      stroke: hexToRgba(palette.accent, 0.14)
                    }}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>

          <AnimatePresence>
            {roofPalette ? (
              <motion.div
                key={`roof-${displayedRoofType}-${animationEvent?.token ?? 0}`}
                initial={reducedMotion ? false : { y: 18, opacity: 0, scale: 0.92 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 190, damping: 12 }}
                className="absolute left-1/2"
                style={{
                  width: roofWidth,
                  marginLeft: -roofWidth / 2,
                  bottom: stackBottom + visibleFloors * floorSideHeight + 4
                }}
              >
                <PrismSvg
                  width={roofWidth}
                  depth={roofDepth}
                  sideHeight={roofSideHeight}
                  palette={{
                    top: roofPalette.top,
                    left: roofPalette.left,
                    right: roofPalette.right,
                    stroke: "rgba(255,255,255,0.88)"
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {hiddenFloorCount > 0 ? (
          <span className="rounded-full border border-white/80 bg-white/85 px-2 py-0.5 text-[10px] font-bold text-slate-600 backdrop-blur">
            +{hiddenFloorCount}층
          </span>
        ) : null}

        {height > 0 ? (
          <span className="rounded-full border border-white/80 bg-white/82 px-2 py-0.5 text-[10px] font-bold text-slate-700 backdrop-blur">
            {getFloorCountLabel(height, maxVisibleFloors ?? 6)}
          </span>
        ) : null}

        {displayedRoofType !== "none" ? (
          <span className={`rounded-full border border-white/80 bg-white/80 font-bold text-slate-700 backdrop-blur ${roofLabelClass}`}>
            지붕: {roofTypeLabel[displayedRoofType]}
          </span>
        ) : null}
      </motion.div>
    );
  }
};
