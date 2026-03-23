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
      <Card className="bg-quest-primary text-white">
        <h1 className="text-2xl font-black">🏙️ Questown</h1>
        <p className="text-sm text-blue-100">할 일을 완료하고 오늘의 건물을 키워보세요.</p>
      </Card>

      <Card className="flex gap-2">
        <Button
          className={`flex-1 ${currentTab === "today" ? "bg-quest-primary text-white" : "bg-slate-100"}`}
          onClick={() => setTab("today")}
        >
          Today
        </Button>
        <Button
          className={`flex-1 ${currentTab === "town" ? "bg-quest-primary text-white" : "bg-slate-100"}`}
          onClick={() => setTab("town")}
        >
          Town
        </Button>
      </Card>

      {currentTab === "today" ? <TodayView /> : <MonthlyTownView />}
    </main>
  );
}
