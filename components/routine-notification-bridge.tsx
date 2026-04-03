"use client";

import { useEffect } from "react";
import { serializeAppEntryPayload } from "@/domain/app-entry";
import { getPendingNotificationCandidate, getTriggerEvaluatorResult } from "@/domain/routine-trigger-evaluator";
import { useRoutineGameStore } from "@/store/routine-game-store";

export function RoutineNotificationBridge() {
  const hasHydrated = useRoutineGameStore((state) => state.hasHydrated);
  const routinesById = useRoutineGameStore((state) => state.routinesById);
  const triggersByRoutineId = useRoutineGameStore((state) => state.triggersByRoutineId);
  const sessionsById = useRoutineGameStore((state) => state.sessionsById);
  const activeSessionId = useRoutineGameStore((state) => state.activeSessionId);
  const notificationPermission = useRoutineGameStore((state) => state.notificationPermission);
  const lastNotifiedTriggerWindowKey = useRoutineGameStore((state) => state.lastNotifiedTriggerWindowKey);
  const syncGameDay = useRoutineGameStore((state) => state.syncGameDay);
  const syncNotificationPermission = useRoutineGameStore((state) => state.syncNotificationPermission);
  const markTriggerWindowNotified = useRoutineGameStore((state) => state.markTriggerWindowNotified);

  useEffect(() => {
    if (!hasHydrated) return;

    const syncPermission = () => {
      if (typeof Notification === "undefined") {
        syncNotificationPermission("unsupported");
        return;
      }

      syncNotificationPermission(Notification.permission);
    };

    const runEvaluation = async () => {
      syncGameDay();
      syncPermission();

      if (typeof window === "undefined" || typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      if (!("serviceWorker" in navigator)) return;

      const evaluation = getTriggerEvaluatorResult({
        routinesById,
        triggersByRoutineId,
        sessionsById,
        activeSessionId,
        now: new Date()
      });
      const candidate = getPendingNotificationCandidate({
        evaluation,
        lastNotifiedTriggerWindowKey
      });

      if (!candidate) return;

      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(candidate.title, {
        body: candidate.body,
        tag: candidate.notificationWindowKey,
        data: {
          url: serializeAppEntryPayload({
            source: "notification",
            launchContext: candidate.launchContext
          })
        }
      });
      markTriggerWindowNotified(candidate.notificationWindowKey);
    };

    syncPermission();
    void runEvaluation();

    let minuteIntervalId: number | undefined;
    const minuteTimeoutId = window.setTimeout(() => {
      void runEvaluation();
      minuteIntervalId = window.setInterval(() => {
        void runEvaluation();
      }, 60_000);
    }, 60_000 - (Date.now() % 60_000));

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void runEvaluation();
    };

    const handleFocus = () => {
      void runEvaluation();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearTimeout(minuteTimeoutId);
      if (minuteIntervalId !== undefined) {
        window.clearInterval(minuteIntervalId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [
    activeSessionId,
    hasHydrated,
    lastNotifiedTriggerWindowKey,
    markTriggerWindowNotified,
    notificationPermission,
    routinesById,
    sessionsById,
    syncGameDay,
    syncNotificationPermission,
    triggersByRoutineId
  ]);

  return null;
}
