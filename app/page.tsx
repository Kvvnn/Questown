"use client";

import dynamic from "next/dynamic";
import { KeyboardEvent, useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { useQuestownStore } from "@/store/questown-store";

const TodayView = dynamic(() => import("@/components/today-view").then((mod) => mod.TodayView), {
  loading: () => (
    <Card role="status" aria-live="polite" className="text-sm text-slate-500">
      오늘 화면 로딩 중...
    </Card>
  )
});

const MonthlyTownView = dynamic(() => import("@/components/monthly-town-view").then((mod) => mod.MonthlyTownView), {
  loading: () => (
    <Card role="status" aria-live="polite" className="text-sm text-slate-500">
      타운 화면 로딩 중...
    </Card>
  )
});

export default function HomePage() {
  const currentTab = useQuestownStore((s) => s.currentTab);
  const setTab = useQuestownStore((s) => s.setTab);
  const hydrateToday = useQuestownStore((s) => s.hydrateToday);
  const rolloverToToday = useQuestownStore((s) => s.rolloverToToday);
  const [loadedTabs, setLoadedTabs] = useState(() => ({
    today: currentTab === "today",
    town: currentTab === "town"
  }));

  useEffect(() => {
    const syncToday = () => {
      rolloverToToday();
    };

    hydrateToday();

    const id = window.setInterval(syncToday, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncToday();
      }
    };

    window.addEventListener("focus", syncToday);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(id);
      window.removeEventListener("focus", syncToday);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hydrateToday, rolloverToToday]);

  useEffect(() => {
    setLoadedTabs((prev) => (prev[currentTab] ? prev : { ...prev, [currentTab]: true }));
  }, [currentTab]);

  const focusTab = (nextTab: "today" | "town") => {
    requestAnimationFrame(() => {
      document.getElementById(`tab-${nextTab}`)?.focus();
    });
  };

  const activateTab = (nextTab: "today" | "town") => {
    setLoadedTabs((prev) => (prev[nextTab] ? prev : { ...prev, [nextTab]: true }));
    setTab(nextTab);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: "today" | "town") => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();

    if (event.key === "Home") {
      activateTab("today");
      focusTab("today");
      return;
    }

    if (event.key === "End") {
      activateTab("town");
      focusTab("town");
      return;
    }

    const nextTab = tab === "today" ? "town" : "today";
    activateTab(nextTab);
    focusTab(nextTab);
  };

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-3 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+12px)]"
    >
      <a
        href={currentTab === "today" ? "#panel-today" : "#panel-town"}
        className="sr-only absolute left-2 top-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:not-sr-only"
      >
        본문으로 바로가기
      </a>

      <div className="sticky top-[calc(env(safe-area-inset-top)+8px)] z-30 space-y-3 pb-1">
        <Card className="relative overflow-hidden bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500 p-3 text-white shadow-[0_18px_38px_rgba(37,99,235,0.26)]">
          <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-white/20 blur-xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-lg" />

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-blue-100/90">Questown</p>
              <h1 className="mt-1 text-xl font-black tracking-tight">오늘을 쌓는 타운</h1>
              <p className="mt-1 text-xs text-blue-100">핵심 실행은 위로, 정리와 설정은 뒤로 보내는 앱형 흐름입니다.</p>
            </div>

            <div className="rounded-2xl border border-white/20 bg-white/15 px-3 py-2 text-right text-[11px] font-semibold text-blue-50">
              <p>현재 화면</p>
              <p className="mt-1 text-sm font-black text-white">{currentTab === "today" ? "오늘" : "타운"}</p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Questown 화면 전환"
            className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/20 bg-white/10 p-1"
          >
            <Button
              type="button"
              role="tab"
              id="tab-today"
              aria-controls="panel-today"
              aria-selected={currentTab === "today"}
              tabIndex={currentTab === "today" ? 0 : -1}
              className={`min-h-11 border-0 ${
                currentTab === "today" ? "bg-white text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.15)]" : "bg-transparent text-white shadow-none"
              }`}
              onClick={() => activateTab("today")}
              onKeyDown={(event) => handleTabKeyDown(event, "today")}
            >
              오늘
            </Button>
            <Button
              type="button"
              role="tab"
              id="tab-town"
              aria-controls="panel-town"
              aria-selected={currentTab === "town"}
              tabIndex={currentTab === "town" ? 0 : -1}
              className={`min-h-11 border-0 ${
                currentTab === "town" ? "bg-white text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.15)]" : "bg-transparent text-white shadow-none"
              }`}
              onClick={() => activateTab("town")}
              onKeyDown={(event) => handleTabKeyDown(event, "town")}
            >
              타운
            </Button>
          </div>
        </Card>
      </div>

      <section id="tab-panels" className="min-h-0 flex-1 outline-none">
        <div
          id="panel-today"
          role="tabpanel"
          aria-labelledby="tab-today"
          hidden={currentTab !== "today"}
          tabIndex={-1}
          className="h-full"
        >
          {loadedTabs.today ? <TodayView /> : null}
        </div>
        <div
          id="panel-town"
          role="tabpanel"
          aria-labelledby="tab-town"
          hidden={currentTab !== "town"}
          tabIndex={-1}
          className="h-full"
        >
          {loadedTabs.town ? <MonthlyTownView /> : null}
        </div>
      </section>
    </main>
  );
}
