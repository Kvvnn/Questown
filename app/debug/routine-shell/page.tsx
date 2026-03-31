"use client";

import React from "react";
import { useEffect } from "react";
import { PwaBootstrap } from "@/components/pwa-bootstrap";
import { RoutineDevShell } from "@/components/routine-dev-shell";
import { Card } from "@/components/ui";
import { useRoutineGameStore } from "@/store/routine-game-store";

export default function RoutineShellDebugPage() {
  const hasHydrated = useRoutineGameStore((state) => state.hasHydrated);
  const hydrateGame = useRoutineGameStore((state) => state.hydrateGame);
  const setActiveView = useRoutineGameStore((state) => state.setActiveView);
  const returnToLauncher = useRoutineGameStore((state) => state.returnToLauncher);

  useEffect(() => {
    if (!hasHydrated) return;

    hydrateGame();
    setActiveView("debug");

    return () => {
      returnToLauncher();
    };
  }, [hasHydrated, hydrateGame, returnToLauncher, setActiveView]);

  return (
    <main
      id="debug-routine-shell"
      className="mx-auto h-[100dvh] w-full max-w-[430px] overflow-hidden px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+12px)]"
    >
      <PwaBootstrap />

      {hasHydrated ? (
        <RoutineDevShell />
      ) : (
        <Card role="status" aria-live="polite" className="rounded-[28px] bg-white/88 text-sm text-slate-500">
          Debug shell 로딩 중...
        </Card>
      )}
    </main>
  );
}
