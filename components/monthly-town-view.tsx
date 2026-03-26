"use client";

import { KeyboardEvent, useCallback, useEffect, useMemo, useRef } from "react";
import { TownPhaserBoard, TownPhaserBoardHandle } from "@/components/town-phaser-board";
import { Button } from "@/components/ui";
import { roofTypeLabel } from "@/domain/building";
import { getDaysInMonth } from "@/domain/date";
import { getDominantQuestType, questTypeShortLabel } from "@/domain/quest";
import { createTownLayout } from "@/domain/town-map";
import { getPreferredTownDate, moveDateInMonth, TownDirection } from "@/domain/town-navigation";
import { DailyRecord } from "@/domain/types";
import { useQuestownStore } from "@/store/questown-store";

const directionByKey: Partial<Record<string, TownDirection>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "home",
  End: "end"
};

const districtAccent: Record<string, string> = {
  "Week 1": "bg-emerald-100 text-emerald-700",
  "Week 2": "bg-sky-100 text-sky-700",
  "Week 3": "bg-violet-100 text-violet-700",
  "Week 4": "bg-amber-100 text-amber-700",
  "Week 5": "bg-pink-100 text-pink-700",
  "Week 6": "bg-slate-100 text-slate-700"
};

const formatMonthTitle = (monthKey: string) => {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
};

const getTownDetailEmptyMessage = (date: string, currentDateKey: string) => {
  if (date === currentDateKey) return "오늘 퀘스트를 완료하면 여기에 새 건물이 올라와요.";
  if (date > currentDateKey) return "아직 오지 않은 날짜예요. 오늘을 쌓아 가면 이 부지도 열립니다.";
  return "이 날짜에는 아직 세워진 건물이 없어요.";
};

const getRecordPreview = (record: DailyRecord | undefined) => {
  if (!record) return [];

  return [...record.quests]
    .sort((a, b) => Number(a.completed) - Number(b.completed))
    .slice(0, 3);
};

export function MonthlyTownView() {
  const boardRef = useRef<TownPhaserBoardHandle | null>(null);
  const selectedMonth = useQuestownStore((state) => state.selectedMonth);
  const currentDateKey = useQuestownStore((state) => state.currentDateKey);
  const recordsByDate = useQuestownStore((state) => state.recordsByDate);
  const selectedDateInTown = useQuestownStore((state) => state.selectedDateInTown);
  const moveMonth = useQuestownStore((state) => state.moveMonth);
  const selectDateInTown = useQuestownStore((state) => state.selectDateInTown);

  const dayCount = getDaysInMonth(selectedMonth);
  const layout = useMemo(() => createTownLayout(selectedMonth, dayCount), [selectedMonth, dayCount]);
  const currentMonthKey = currentDateKey.slice(0, 7);
  const canMoveToNextMonth = selectedMonth < currentMonthKey;

  const activeSelectedDate = useMemo(
    () =>
      getPreferredTownDate({
        monthKey: selectedMonth,
        dayCount,
        currentDate: currentDateKey,
        selectedDate: selectedDateInTown,
        availableDates: Object.keys(recordsByDate)
      }),
    [currentDateKey, dayCount, recordsByDate, selectedDateInTown, selectedMonth]
  );

  useEffect(() => {
    if (selectedDateInTown === activeSelectedDate) return;
    selectDateInTown(activeSelectedDate);
  }, [activeSelectedDate, selectDateInTown, selectedDateInTown]);

  const selectedPlot = layout.plots.find((plot) => plot.date === activeSelectedDate);
  const selectedRecord = recordsByDate[activeSelectedDate];
  const selectedDominantType = getDominantQuestType(selectedRecord, "completed") ?? getDominantQuestType(selectedRecord, "total");
  const previewQuests = getRecordPreview(selectedRecord);

  const monthStats = useMemo(() => {
    return layout.plots.reduce(
      (summary, plot) => {
        const record = recordsByDate[plot.date];
        summary.builtLots += record && record.completedCount > 0 ? 1 : 0;
        summary.completed += record?.completedCount ?? 0;
        summary.total += record?.totalCount ?? 0;
        return summary;
      },
      { builtLots: 0, completed: 0, total: 0 }
    );
  }, [layout.plots, recordsByDate]);

  const moveSelection = useCallback(
    (direction: TownDirection) => {
      const nextDate = moveDateInMonth(activeSelectedDate, selectedMonth, dayCount, direction);
      selectDateInTown(nextDate);
      boardRef.current?.focusDate(nextDate);
    },
    [activeSelectedDate, dayCount, selectDateInTown, selectedMonth]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const direction = directionByKey[event.key];
      if (!direction) return;

      event.preventDefault();
      moveSelection(direction);
    },
    [moveSelection]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" id="town-panel-content">
      <header className="rounded-[30px] border border-white/80 bg-white/92 p-3 shadow-[0_18px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-400">Quest Town</p>
            <h2 className="truncate text-xl font-black tracking-tight text-slate-900">{formatMonthTitle(selectedMonth)}</h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="h-11 min-h-0 w-11 rounded-2xl border-0 bg-slate-100 px-0 py-0 text-lg text-slate-700 shadow-none"
              onClick={() => moveMonth(-1)}
              aria-label="이전 달 보기"
            >
              ‹
            </Button>
            <Button
              type="button"
              className="h-11 min-h-0 w-11 rounded-2xl border-0 bg-slate-100 px-0 py-0 text-lg text-slate-700 shadow-none disabled:opacity-40"
              onClick={() => moveMonth(1)}
              disabled={!canMoveToNextMonth}
              aria-label="다음 달 보기"
            >
              ›
            </Button>
          </div>
        </div>
      </header>

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,#dff5ff_0%,#d9f6ec_48%,#cdecd7_100%)] shadow-[0_24px_40px_rgba(15,23,42,0.12)]"
        role="region"
        aria-label="아이소메트릭 타운"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 bg-gradient-to-b from-white/40 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-28 bg-gradient-to-t from-[#b9e2c4]/65 to-transparent" />

        <TownPhaserBoard
          ref={boardRef}
          className="absolute inset-0"
          currentDateKey={currentDateKey}
          layout={layout}
          onSelect={selectDateInTown}
          recordsByDate={recordsByDate}
          selectedDate={activeSelectedDate}
        />

        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[70%] flex-wrap gap-2">
          <span className="rounded-full bg-white/92 px-3 py-1 text-[11px] font-black text-slate-700 shadow-sm">
            건물 {monthStats.builtLots}/{layout.plots.length}
          </span>
          <span className="rounded-full bg-slate-900/88 px-3 py-1 text-[11px] font-black text-white shadow-sm">
            완료 {monthStats.completed}
          </span>
        </div>

        <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
          <Button
            type="button"
            className="h-11 min-h-0 w-11 rounded-2xl border-0 bg-white/90 px-0 py-0 text-lg text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
            onClick={() => boardRef.current?.zoomIn()}
            aria-label="타운 확대"
          >
            +
          </Button>
          <Button
            type="button"
            className="h-11 min-h-0 w-11 rounded-2xl border-0 bg-white/90 px-0 py-0 text-[11px] font-black text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
            onClick={() => boardRef.current?.resetView()}
            aria-label="타운 위치 재설정"
          >
            중앙
          </Button>
          <Button
            type="button"
            className="h-11 min-h-0 w-11 rounded-2xl border-0 bg-white/90 px-0 py-0 text-lg text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
            onClick={() => boardRef.current?.zoomOut()}
            aria-label="타운 축소"
          >
            −
          </Button>
        </div>

        <div className="pointer-events-none absolute left-3 top-[68px] z-10">
          <span className="rounded-full bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-white/90">
            드래그로 이동, 탭해서 상세 보기
          </span>
        </div>

        <section className="absolute inset-x-0 bottom-0 z-20 rounded-t-[34px] border-t border-white/80 bg-white/94 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-4 shadow-[0_-16px_32px_rgba(15,23,42,0.12)] backdrop-blur-md">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {selectedPlot ? (
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-black ${districtAccent[selectedPlot.district] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    {selectedPlot.district}
                  </span>
                ) : null}
                {activeSelectedDate === currentDateKey ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">오늘</span>
                ) : null}
              </div>

              <h3 className="text-lg font-black tracking-tight text-slate-900">
                {selectedPlot ? `${selectedPlot.day}일 타운 빌딩` : "건물을 선택해 주세요"}
              </h3>
              <p className="text-sm text-slate-500">{activeSelectedDate}</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="h-11 min-h-0 rounded-2xl border-0 bg-slate-100 px-4 py-0 text-sm font-black text-slate-700 shadow-none"
                onClick={() => moveSelection("left")}
                aria-label="이전 날짜"
              >
                이전
              </Button>
              <Button
                type="button"
                className="h-11 min-h-0 rounded-2xl border-0 bg-slate-100 px-4 py-0 text-sm font-black text-slate-700 shadow-none"
                onClick={() => moveSelection("right")}
                aria-label="다음 날짜"
              >
                다음
              </Button>
            </div>
          </div>

          {!selectedRecord ? (
            <div className="mt-4 rounded-[26px] bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <p className="font-bold text-slate-800">아직 빈 부지예요.</p>
              <p className="mt-1 leading-relaxed">{getTownDetailEmptyMessage(activeSelectedDate, currentDateKey)}</p>
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-[22px] bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">완료</p>
                  <p className="mt-1 text-base font-black text-slate-900">
                    {selectedRecord.completedCount}/{selectedRecord.totalCount}
                  </p>
                </div>
                <div className="rounded-[22px] bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">지붕</p>
                  <p className="mt-1 text-base font-black text-slate-900">{roofTypeLabel[selectedRecord.roofType]}</p>
                </div>
                <div className="rounded-[22px] bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">중심</p>
                  <p className="mt-1 text-base font-black text-slate-900">
                    {selectedDominantType ? questTypeShortLabel[selectedDominantType] : "혼합"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {previewQuests.map((quest) => (
                  <div key={quest.id} className="flex items-center justify-between rounded-[20px] bg-slate-50 px-3 py-3">
                    <span className="truncate pr-3 text-sm font-semibold text-slate-700">{quest.title}</span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                        quest.completed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {quest.completed ? "완료" : "대기"}
                    </span>
                  </div>
                ))}

                {selectedRecord.quests.length > previewQuests.length ? (
                  <p className="px-1 text-xs font-semibold text-slate-500">
                    퀘스트 {selectedRecord.quests.length - previewQuests.length}개가 더 있어요.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
