"use client";

import dynamic from "next/dynamic";
import { KeyboardEvent, useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { TabType } from "@/domain/types";
import { useQuestownStore } from "@/store/questown-store";

const TodayView = dynamic(() => import("@/components/today-view").then((mod) => mod.TodayView), {
  loading: () => (
    <Card role="status" aria-live="polite" className="rounded-[28px] text-sm text-slate-500">
      홈 화면 로딩 중...
    </Card>
  )
});

const MonthlyTownView = dynamic(() => import("@/components/monthly-town-view").then((mod) => mod.MonthlyTownView), {
  loading: () => (
    <Card role="status" aria-live="polite" className="rounded-[28px] text-sm text-slate-500">
      타운 화면 로딩 중...
    </Card>
  )
});

const ManageView = dynamic(() => import("@/components/manage-view").then((mod) => mod.ManageView), {
  loading: () => (
    <Card role="status" aria-live="polite" className="rounded-[28px] text-sm text-slate-500">
      관리 화면 로딩 중...
    </Card>
  )
});

const tabs: Array<{ id: TabType; label: string }> = [
  { id: "today", label: "홈" },
  { id: "town", label: "타운" },
  { id: "manage", label: "관리" }
];

export default function HomePage() {
  const currentTab = useQuestownStore((state) => state.currentTab);
  const setTab = useQuestownStore((state) => state.setTab);
  const hydrateToday = useQuestownStore((state) => state.hydrateToday);
  const rolloverToToday = useQuestownStore((state) => state.rolloverToToday);
  const [loadedTabs, setLoadedTabs] = useState<Record<TabType, boolean>>(() => ({
    today: currentTab === "today",
    town: currentTab === "town",
    manage: currentTab === "manage"
  }));

  useEffect(() => {
    const syncToday = () => {
      rolloverToToday();
    };

    hydrateToday();

    const intervalId = window.setInterval(syncToday, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncToday();
      }
    };

    window.addEventListener("focus", syncToday);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncToday);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hydrateToday, rolloverToToday]);

  useEffect(() => {
    setLoadedTabs((prev) => (prev[currentTab] ? prev : { ...prev, [currentTab]: true }));
  }, [currentTab]);

  const activateTab = (nextTab: TabType) => {
    setLoadedTabs((prev) => (prev[nextTab] ? prev : { ...prev, [nextTab]: true }));
    setTab(nextTab);
  };

  const focusTabButton = (nextTab: TabType) => {
    requestAnimationFrame(() => {
      document.getElementById(`tab-${nextTab}`)?.focus();
    });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: TabType) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();

    if (event.key === "Home") {
      activateTab("today");
      focusTabButton("today");
      return;
    }

    if (event.key === "End") {
      activateTab("manage");
      focusTabButton("manage");
      return;
    }

    const currentIndex = tabs.findIndex((item) => item.id === tab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex].id;
    activateTab(nextTab);
    focusTabButton(nextTab);
  };

  return (
    <main
      id="main-content"
      className="mx-auto h-[100dvh] w-full max-w-[430px] overflow-hidden px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+12px)]"
    >
      <a
        href={currentTab === "today" ? "#panel-today" : currentTab === "town" ? "#panel-town" : "#panel-manage"}
        className="sr-only absolute left-2 top-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:not-sr-only"
      >
        본문으로 바로가기
      </a>

      <section className="flex h-full flex-col gap-3">
        <div className="min-h-0 flex-1">
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

          <div
            id="panel-manage"
            role="tabpanel"
            aria-labelledby="tab-manage"
            hidden={currentTab !== "manage"}
            tabIndex={-1}
            className="h-full"
          >
            {loadedTabs.manage ? <ManageView /> : null}
          </div>
        </div>

        <nav className="rounded-[30px] border border-white/80 bg-white/92 p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)] backdrop-blur-md">
          <div role="tablist" aria-label="Questown 하단 네비게이션" className="grid grid-cols-3 gap-2">
            {tabs.map((tab) => {
              const active = currentTab === tab.id;

              return (
                <Button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-controls={`panel-${tab.id}`}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  className={`min-h-[58px] rounded-[22px] border-0 px-3 ${
                    active ? "bg-quest-primary text-white shadow-[0_10px_24px_rgba(79,70,229,0.28)]" : "bg-transparent text-slate-500 shadow-none"
                  }`}
                  onClick={() => activateTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                >
                  <span className="flex flex-col items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-slate-300"}`} />
                    <span className="text-sm font-black">{tab.label}</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </nav>
      </section>
    </main>
  );
}
