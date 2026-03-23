"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type RewardToastTone = "info" | "success" | "epic";

export interface RewardToastItem {
  id: number;
  text: string;
  tone: RewardToastTone;
}

const toneClass: Record<RewardToastTone, string> = {
  info: "from-sky-500 to-blue-500",
  success: "from-emerald-500 to-green-500",
  epic: "from-fuchsia-500 to-indigo-500"
};

export function RewardToasts({ toasts }: { toasts: RewardToastItem[] }) {
  const reducedMotion = !!useReducedMotion();

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      role="status"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={reducedMotion ? false : { x: 18, opacity: 0, scale: 0.95 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { x: 12, opacity: 0, scale: 0.95 }}
            transition={reducedMotion ? { duration: 0.1 } : { type: "spring", stiffness: 310, damping: 25 }}
            className={`rounded-2xl border border-white/40 bg-gradient-to-r px-4 py-3 text-sm font-semibold text-white shadow-xl ${toneClass[toast.tone]}`}
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
