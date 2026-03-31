"use client";

import dynamic from "next/dynamic";
import { KeyboardEvent, useEffect, useState } from "react";
import { PwaBootstrap } from "@/components/pwa-bootstrap";
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
  const hasHydrated = useQuestownStore((state) => state.hasHydrated);
  const currentTab = useQuestownStore((state) => state.currentTab);
  const setTab = useQuestownStore((state) => state.setTab);
  const recoveryNotice = useQuestownStore((state) => state.recoveryNotice);
  const storageNotice = useQuestownStore((state) => state.storageNotice);
  const clearRecoveryNotice = useQuestownStore((state) => state.clearRecoveryNotice);
  const clearStorageNotice = useQuestownStore((state) => state.clearStorageNotice);
  const hydrateToday = useQuestownStore((state) => state.hydrateToday);
  const rolloverToToday = useQuestownStore((state) => state.rolloverToToday);
  const [isClientReady, setIsClientReady] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Record<TabType, boolean>>(() => ({
    today: true,
    town: false,
    manage: false
  }));
  const uiReady = isClientReady && hasHydrated;
  const visibleTab = uiReady ? currentTab : "today";

  useEffect(() => {
    setIsClientReady(true);
  }, []);

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
    if (!uiReady) return;

    setLoadedTabs((prev) => (prev[currentTab] ? prev : { ...prev, [currentTab]: true }));
  }, [currentTab, uiReady]);

  useEffect(() => {
    if (!recoveryNotice) return undefined;

    const timeout = window.setTimeout(() => {
      clearRecoveryNotice();
    }, 5200);

    return () => window.clearTimeout(timeout);
  }, [clearRecoveryNotice, recoveryNotice]);

  useEffect(() => {
    if (!storageNotice) return undefined;

    const timeout = window.setTimeout(() => {
      clearStorageNotice();
    }, 5200);

    return () => window.clearTimeout(timeout);
  }, [clearStorageNotice, storageNotice]);

  const activateTab = (nextTab: TabType) => {
    if (!uiReady) return;
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
      <PwaBootstrap />

      <a
        href={visibleTab === "today" ? "#panel-today" : visibleTab === "town" ? "#panel-town" : "#panel-manage"}
        className="sr-only absolute left-2 top-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:not-sr-only"
      >
        본문으로 바로가기
      </a>

      {uiReady && (recoveryNotice || storageNotice) ? (
        <div className="absolute left-3 right-3 top-[calc(env(safe-area-inset-top)+12px)] z-40 flex flex-col gap-2">
          {recoveryNotice ? (
            <div className="rounded-[22px] border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm font-semibold text-amber-900 shadow-[0_16px_28px_rgba(15,23,42,0.14)] backdrop-blur-md">
              <div className="flex items-start justify-between gap-3">
                <p>{recoveryNotice}</p>
                <button
                  type="button"
                  onClick={clearRecoveryNotice}
                  className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-xs font-black text-amber-900"
                  aria-label="복구 안내 닫기"
                >
                  닫기
                </button>
              </div>
            </div>
          ) : null}

          {storageNotice ? (
            <div className="rounded-[22px] border border-rose-200 bg-rose-50/95 px-4 py-3 text-sm font-semibold text-rose-900 shadow-[0_16px_28px_rgba(15,23,42,0.14)] backdrop-blur-md">
              <div className="flex items-start justify-between gap-3">
                <p>{storageNotice}</p>
                <button
                  type="button"
                  onClick={clearStorageNotice}
                  className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-xs font-black text-rose-900"
                  aria-label="저장소 안내 닫기"
                >
                  닫기
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="flex h-full flex-col gap-3">
        <div className="min-h-0 flex-1">
          <div
            id="panel-today"
            role="tabpanel"
            aria-labelledby="tab-today"
            hidden={visibleTab !== "today"}
            tabIndex={-1}
            className="h-full"
          >
            {loadedTabs.today && uiReady ? (
              <TodayView />
            ) : (
              <Card role="status" aria-live="polite" className="rounded-[28px] text-sm text-slate-500">
                홈 화면 로딩 중...
              </Card>
            )}
          </div>

          <div
            id="panel-town"
            role="tabpanel"
            aria-labelledby="tab-town"
            hidden={visibleTab !== "town"}
            tabIndex={-1}
            className="h-full"
          >
            {loadedTabs.town && uiReady ? (
              <MonthlyTownView />
            ) : (
              <Card role="status" aria-live="polite" className="rounded-[28px] text-sm text-slate-500">
                타운 화면 로딩 중...
              </Card>
            )}
          </div>

          <div
            id="panel-manage"
            role="tabpanel"
            aria-labelledby="tab-manage"
            hidden={visibleTab !== "manage"}
            tabIndex={-1}
            className="h-full"
          >
            {loadedTabs.manage && uiReady ? (
              <ManageView />
            ) : (
              <Card role="status" aria-live="polite" className="rounded-[28px] text-sm text-slate-500">
                관리 화면 로딩 중...
              </Card>
            )}
          </div>
        </div>

        <nav className="rounded-[30px] border border-white/80 bg-white/92 p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)] backdrop-blur-md">
          <div role="tablist" aria-label="Questown 하단 네비게이션" className="grid grid-cols-3 gap-2">
            {tabs.map((tab) => {
              const active = visibleTab === tab.id;

              return (
                <Button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-controls={`panel-${tab.id}`}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  disabled={!uiReady}
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
