"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type RewardToastTone = "info" | "success" | "epic";

export interface RewardToastItem {
  id: number;
  text: string;
  tone: RewardToastTone;
  helperText?: string;
}

const toneClass: Record<RewardToastTone, string> = {
  info: "from-sky-500 to-blue-500",
  success: "from-emerald-500 to-green-500",
  epic: "from-fuchsia-500 to-indigo-500"
};

export function RewardToasts({ toasts }: { toasts: RewardToastItem[] }) {
  const reducedMotion = !!useReducedMotion();
  const latestToast = toasts.at(-1);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-50 flex justify-center px-4"
    >
      <AnimatePresence initial={false}>
        {latestToast ? (
          <motion.div
            key={latestToast.id}
            initial={reducedMotion ? false : { y: 18, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: 10, opacity: 0, scale: 0.96 }}
            transition={reducedMotion ? { duration: 0.1 } : { type: "spring", stiffness: 310, damping: 25 }}
            className={`w-full max-w-[320px] rounded-[22px] border border-white/45 bg-gradient-to-r px-4 py-3 text-white shadow-[0_18px_34px_rgba(15,23,42,0.18)] ${toneClass[latestToast.tone]}`}
          >
            <p className="text-sm font-black">{latestToast.text}</p>
            {latestToast.helperText ? <p className="mt-1 text-xs font-semibold text-white/85">{latestToast.helperText}</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
