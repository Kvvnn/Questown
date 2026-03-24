"use client";

import dynamic from "next/dynamic";
import { KeyboardEvent, useEffect } from "react";
import { Button, Card } from "@/components/ui";
import { useQuestownStore } from "@/store/questown-store";

const TodayView = dynamic(() => import("@/components/today-view").then((mod) => mod.TodayView), {
  loading: () => (
    <Card role="status" aria-live="polite" className="text-sm text-slate-500">
      Today 화면 로딩 중...
    </Card>
  )
});

const MonthlyTownView = dynamic(() => import("@/components/monthly-town-view").then((mod) => mod.MonthlyTownView), {
  loading: () => (
    <Card role="status" aria-live="polite" className="text-sm text-slate-500">
      Town scene 로딩 중...
    </Card>
  )
});

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

  const focusTab = (nextTab: "today" | "town") => {
    requestAnimationFrame(() => {
      document.getElementById(`tab-${nextTab}`)?.focus();
    });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: "today" | "town") => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();

    if (event.key === "Home") {
      setTab("today");
      focusTab("today");
      return;
    }

    if (event.key === "End") {
      setTab("town");
      focusTab("town");
      return;
    }

    const nextTab = tab === "today" ? "town" : "today";
    setTab(nextTab);
    focusTab(nextTab);
  };

  return (
    <main id="main-content" className="mx-auto min-h-screen w-full max-w-xl space-y-4 px-4 py-6">
      <a
        href="#tab-panel"
        className="sr-only absolute left-2 top-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:not-sr-only"
      >
        본문으로 바로가기
      </a>

      <Card className="relative overflow-hidden bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500 text-white">
        <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-white/20 blur-xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-lg" />
        <h1 className="text-2xl font-black tracking-tight">🏙️ Questown</h1>
        <p className="mt-1 text-sm text-blue-100">할 일을 완료하고, 오늘의 건물을 성장시키세요.</p>
      </Card>

      <Card className="p-2">
        <div role="tablist" aria-label="Questown 화면 전환" className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          <Button
            role="tab"
            id="tab-today"
            aria-controls="panel-today"
            aria-selected={currentTab === "today"}
            tabIndex={currentTab === "today" ? 0 : -1}
            className={`min-h-11 ${currentTab === "today" ? "bg-quest-primary text-white" : "bg-transparent shadow-none"}`}
            onClick={() => setTab("today")}
            onKeyDown={(event) => handleTabKeyDown(event, "today")}
          >
            Today
          </Button>
          <Button
            role="tab"
            id="tab-town"
            aria-controls="panel-town"
            aria-selected={currentTab === "town"}
            tabIndex={currentTab === "town" ? 0 : -1}
            className={`min-h-11 ${currentTab === "town" ? "bg-quest-primary text-white" : "bg-transparent shadow-none"}`}
            onClick={() => setTab("town")}
            onKeyDown={(event) => handleTabKeyDown(event, "town")}
          >
            Town
          </Button>
        </div>
      </Card>

      <section
        id="tab-panel"
        role="tabpanel"
        aria-labelledby={currentTab === "today" ? "tab-today" : "tab-town"}
        className="outline-none"
      >
        {currentTab === "today" ? (
          <div id="panel-today" tabIndex={-1}>
            <TodayView />
          </div>
        ) : (
          <div id="panel-town" tabIndex={-1}>
            <MonthlyTownView />
          </div>
        )}
      </section>
    </main>
  );
}
