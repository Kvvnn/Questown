"use client";

import { useEffect } from "react";
import { MonthlyTownView } from "@/components/monthly-town-view";
import { TodayView } from "@/components/today-view";
import { Button, Card } from "@/components/ui";
import { useQuestownStore } from "@/store/questown-store";

export default function HomePage() {
  const currentTab = useQuestownStore((s) => s.currentTab);
  const setTab = useQuestownStore((s) => s.setTab);
  const hydrateToday = useQuestownStore((s) => s.hydrateToday);
  const rolloverToToday = useQuestownStore((s) => s.rolloverToToday);

  useEffect(() => {
    hydrateToday();

    const id = setInterval(() => {
      rolloverToToday();
    }, 60_000);

    return () => clearInterval(id);
  }, [hydrateToday, rolloverToToday]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl space-y-4 px-4 py-6">
      <Card className="relative overflow-hidden bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500 text-white">
        <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-white/20 blur-xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-lg" />
        <h1 className="text-2xl font-black tracking-tight">🏙️ Questown</h1>
        <p className="mt-1 text-sm text-blue-100">할 일을 완료하고, 오늘의 건물을 성장시키세요.</p>
      </Card>

      <Card className="p-2">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          <Button
            className={`min-h-11 ${currentTab === "today" ? "bg-quest-primary text-white" : "bg-transparent shadow-none"}`}
            onClick={() => setTab("today")}
          >
            Today
          </Button>
          <Button
            className={`min-h-11 ${currentTab === "town" ? "bg-quest-primary text-white" : "bg-transparent shadow-none"}`}
            onClick={() => setTab("town")}
          >
            Town
          </Button>
        </div>
      </Card>

      {currentTab === "today" ? <TodayView /> : <MonthlyTownView />}
    </main>
  );
}
