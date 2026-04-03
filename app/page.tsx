"use client";

import React from "react";
import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAppEntryPayload } from "@/domain/app-entry";
import { RoutineNotificationBridge } from "@/components/routine-notification-bridge";
import { PwaBootstrap } from "@/components/pwa-bootstrap";
import { RoutineLauncher } from "@/components/routine-launcher";
import { Card } from "@/components/ui";
import { useRoutineGameStore } from "@/store/routine-game-store";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          className="mx-auto h-[100dvh] w-full max-w-[430px] overflow-hidden px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+12px)]"
        >
          <PwaBootstrap />
          <RoutineNotificationBridge />
          <Card role="status" aria-live="polite" className="rounded-[28px] bg-white/88 text-sm text-slate-500">
            Questown launcher 로딩 중...
          </Card>
        </main>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const hasHydrated = useRoutineGameStore((state) => state.hasHydrated);
  const hydrateGame = useRoutineGameStore((state) => state.hydrateGame);
  const consumeAppEntry = useRoutineGameStore((state) => state.consumeAppEntry);
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const appEntryPayload = useMemo(() => parseAppEntryPayload(new URLSearchParams(searchKey)), [searchKey]);

  useEffect(() => {
    if (!hasHydrated) return;
    hydrateGame();
  }, [hasHydrated, hydrateGame]);

  useEffect(() => {
    if (!hasHydrated || !appEntryPayload) return;
    consumeAppEntry(appEntryPayload);
    router.replace("/");
  }, [appEntryPayload, consumeAppEntry, hasHydrated, router]);

  return (
    <main
      id="main-content"
      className="mx-auto h-[100dvh] w-full max-w-[430px] overflow-hidden px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+12px)]"
    >
      <PwaBootstrap />
      <RoutineNotificationBridge />

      {hasHydrated ? (
        <RoutineLauncher />
      ) : (
        <Card role="status" aria-live="polite" className="rounded-[28px] bg-white/88 text-sm text-slate-500">
          Questown launcher 로딩 중...
        </Card>
      )}
    </main>
  );
}
