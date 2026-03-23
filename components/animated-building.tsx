"use client";

import { motion, AnimatePresence } from "framer-motion";
import { RoofType } from "@/domain/types";

export interface AnimatedBuildingRenderer {
  render: (props: BuildingRenderProps) => React.ReactNode;
}

export interface BuildingRenderProps {
  height: number;
  roofType: RoofType;
  finalized?: boolean;
}

const roofColorMap: Record<Exclude<RoofType, "none">, string> = {
  low: "bg-orange-300",
  mid: "bg-amber-400",
  high: "bg-emerald-400"
};

export const CssFramerBuildingRenderer: AnimatedBuildingRenderer = {
  render: ({ height, roofType, finalized }) => (
    <div className="mx-auto flex w-36 flex-col items-center justify-end gap-1">
      <AnimatePresence>
        {finalized && roofType !== "none" ? (
          <motion.div
            key={`roof-${roofType}`}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={`h-0 w-0 border-l-[22px] border-r-[22px] border-b-[18px] border-l-transparent border-r-transparent ${roofType === "high" ? "border-b-emerald-500" : roofType === "mid" ? "border-b-amber-500" : "border-b-orange-400"}`}
          />
        ) : null}
      </AnimatePresence>

      <div className="flex w-full flex-col-reverse items-center gap-1">
        <AnimatePresence>
          {Array.from({ length: height }).map((_, idx) => (
            <motion.div
              key={`floor-${idx}`}
              initial={{ y: 16, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 250, damping: 16 }}
              className="h-6 w-20 rounded-md border-2 border-slate-200 bg-gradient-to-r from-blue-300 to-blue-400"
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="h-4 w-28 rounded-lg bg-slate-300" />
      {finalized && roofType !== "none" ? (
        <span className={`rounded-full px-2 py-1 text-xs font-semibold text-slate-800 ${roofColorMap[roofType]}`}>
          Roof: {roofType.toUpperCase()}
        </span>
      ) : null}
    </div>
  )
};
