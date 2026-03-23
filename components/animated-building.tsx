"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QuestAnimationEvent } from "@/domain/animation";
import { getFloorVisualStyle } from "@/domain/floor-style";
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
}

const roofColorMap: Record<Exclude<RoofType, "none">, string> = {
  low: "border-b-orange-400",
  mid: "border-b-amber-500",
  high: "border-b-emerald-500"
};

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

const fallbackQuestType = (index: number): QuestType => {
  const order: QuestType[] = ["daily", "main", "sub"];
  return order[index % order.length];
};

export const CssFramerBuildingRenderer: AnimatedBuildingRenderer = {
  render: ({
    height,
    roofType,
    finalized,
    animationEvent,
    reducedMotion = false,
    completedQuestTypes = []
  }) => {
    const eventType = animationEvent?.type;
    const showBurst =
      !reducedMotion &&
      eventType !== "idle" &&
      eventType !== undefined &&
      (eventType === "goal-reached" || eventType === "day-finalized" || eventType === "streak-up");

    const floorTypes = Array.from({ length: height }).map((_, idx) => completedQuestTypes[idx] ?? fallbackQuestType(idx));

    return (
      <motion.div
        className="relative mx-auto flex w-44 flex-col items-center justify-end gap-1"
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
              className="pointer-events-none absolute top-10 left-1/2"
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

        <AnimatePresence>
          {finalized && roofType !== "none" ? (
            <motion.div
              key={`roof-${roofType}-${animationEvent?.token ?? 0}`}
              initial={reducedMotion ? false : { y: 18, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 190, damping: 12 }}
              className={`h-0 w-0 border-l-[26px] border-r-[26px] border-b-[20px] border-l-transparent border-r-transparent ${roofColorMap[roofType]}`}
            />
          ) : null}
        </AnimatePresence>

        <div className="flex w-full flex-col-reverse items-center gap-1">
          <AnimatePresence>
            {floorTypes.map((floorType, idx) => {
              const floorVisual = getFloorVisualStyle(floorType);
              const isTopFloor = idx === floorTypes.length - 1;

              return (
                <motion.div
                  key={`floor-${idx}`}
                  initial={reducedMotion ? false : { y: 16, opacity: 0, scale: 0.92 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{
                    type: "spring",
                    stiffness: 280,
                    damping: 18,
                    delay: reducedMotion ? 0 : idx * 0.03
                  }}
                  className={`relative h-6 w-24 overflow-hidden rounded-md border-2 border-white/80 bg-gradient-to-r ${floorVisual.gradientClass} ${isTopFloor && eventType === "quest-complete" ? "ring-2 ring-cyan-200" : ""}`}
                >
                  <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span className="absolute right-2 top-1 h-1.5 w-1.5 rounded-full bg-white/60" />
                  <span className="absolute bottom-0 right-1 text-[9px] opacity-90">{floorVisual.icon}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="h-4 w-32 rounded-xl bg-slate-300/90 shadow-inner" />
        {finalized && roofType !== "none" ? (
          <span className="rounded-full border border-white/80 bg-white/80 px-2 py-1 text-xs font-bold text-slate-700 backdrop-blur">
            Roof: {roofType.toUpperCase()}
          </span>
        ) : null}
      </motion.div>
    );
  }
};
