"use client";

import { KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { getDisplayedRoofType, roofTypeLabel } from "@/domain/building";
import { getDaysInMonth } from "@/domain/date";
import { getFloorVisualStyle } from "@/domain/floor-style";
import { getDominantQuestType, questTypeShortLabel } from "@/domain/quest";
import { createTownLayout, DistrictProgress, getTownMonthProgress, TownPlot } from "@/domain/town-map";
import { getPreferredTownDate, moveDateInMonth, TownDirection } from "@/domain/town-navigation";
import { DailyRecord, RoofType } from "@/domain/types";
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
  주거지: "bg-emerald-100 text-emerald-700",
  상점가: "bg-sky-100 text-sky-700",
  문화지구: "bg-violet-100 text-violet-700",
  "랜드마크 지구": "bg-amber-100 text-amber-700",
  "축제 확장지": "bg-pink-100 text-pink-700",
  "아카이브/오버플로우": "bg-slate-100 text-slate-700"
};

const monumentTierLabel = ["휴면", "씨앗", "기초", "성장", "완성"];

const formatMonthTitle = (monthKey: string) => {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
};

const getTownDetailEmptyMessage = (date: string, currentDateKey: string) => {
  if (date === currentDateKey) return "오늘 퀘스트를 완료하면 이 자리에 새 건물이 올라와요.";
  if (date > currentDateKey) return "아직 오지 않은 날짜예요. 오늘을 쌓아 가면 이 타일도 열립니다.";
  return "이 날짜에는 아직 세워진 건물이 없어요.";
};

const getRecordPreview = (record: DailyRecord | undefined) => {
  if (!record) return [];

  return [...record.quests]
    .sort((a, b) => Number(a.completed) - Number(b.completed))
    .slice(0, 4);
};

const getRoofBadge = (record: DailyRecord | undefined): RoofType => {
  if (!record) return "none";
  return getDisplayedRoofType(record.completedCount, record.roofType, record.isFinalized);
};

const getVisibleFloors = (record: DailyRecord | undefined) => Math.max(0, Math.min(record?.completedCount ?? 0, 5));

function FeaturedTownTile({
  plot,
  record,
  isSelected,
  isToday,
  onSelect
}: {
  plot: TownPlot;
  record: DailyRecord | undefined;
  isSelected: boolean;
  isToday: boolean;
  onSelect: (date: string) => void;
}) {
  const dominantType = getDominantQuestType(record, "completed") ?? getDominantQuestType(record, "total");
  const visual = dominantType ? getFloorVisualStyle(dominantType) : undefined;
  const visibleFloors = getVisibleFloors(record);
  const roof = getRoofBadge(record);
  const hasRecord = Boolean(record);
  const completionLabel = record ? `${record.completedCount}/${record.totalCount}` : "기록 없음";

  return (
    <button
      type="button"
      onClick={() => onSelect(plot.date)}
      className={`w-[154px] shrink-0 rounded-[28px] border px-4 py-4 text-left transition ${
        isSelected
          ? "border-indigo-400 bg-indigo-50 shadow-[0_18px_34px_rgba(99,102,241,0.18)]"
          : "border-white/80 bg-white/92 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
      }`}
      aria-pressed={isSelected}
      aria-label={`${plot.day}일 상세 타일 선택`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black text-slate-700">{plot.day}일</span>
        <div className="flex items-center gap-1">
          {isToday ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">오늘</span> : null}
          {isSelected ? <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">선택</span> : null}
        </div>
      </div>

      <div className="mt-4 flex h-24 items-end justify-center gap-1.5 rounded-[20px] bg-slate-50 px-3 py-3">
        {hasRecord ? (
          <>
            {Array.from({ length: visibleFloors }, (_, index) => (
              <span
                key={`${plot.date}-floor-${index}`}
                className={`w-4 rounded-t-md bg-gradient-to-t ${visual?.gradientClass ?? "from-slate-300 to-slate-200"}`}
                style={{ height: `${24 + index * 9}px` }}
              />
            ))}
            {roof !== "none" ? (
              <span className="mb-[58px] ml-1 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">
                {roofTypeLabel[roof]}
              </span>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-slate-300 text-xl">+</span>
            <span className="text-[11px] font-semibold">빈 날짜</span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-base font-black text-slate-900">{completionLabel}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {dominantType ? `${visual?.icon ?? "🏗️"} ${questTypeShortLabel[dominantType]}` : "선택하면 상세를 볼 수 있어요"}
        </p>
      </div>
    </button>
  );
}

function CompactTownSlot({
  plot,
  isSelected,
  onSelect
}: {
  plot: TownPlot;
  isSelected: boolean;
  onSelect: (date: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(plot.date)}
      className={`min-h-[42px] shrink-0 rounded-full px-3 text-xs font-black transition ${
        isSelected ? "bg-indigo-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.26)]" : "bg-slate-100 text-slate-500"
      }`}
      aria-pressed={isSelected}
      aria-label={`${plot.day}일 간략 슬롯 선택`}
    >
      {plot.day}
    </button>
  );
}

function DistrictLandmark({
  progress,
  rewardLabel
}: {
  progress: DistrictProgress;
  rewardLabel: string;
}) {
  return (
    <div
      className={`w-[154px] shrink-0 rounded-[28px] border-2 border-dashed px-4 py-4 ${
        progress.unlocked ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white/74 text-slate-500"
      }`}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.18em]">Landmark</p>
      <div
        className={`mt-4 flex h-24 items-center justify-center rounded-[20px] text-3xl ${
          progress.unlocked ? "bg-amber-100" : "bg-slate-100"
        }`}
        aria-hidden="true"
      >
        {progress.unlocked ? "🏆" : "🔒"}
      </div>
      <p className="mt-4 text-sm font-black">{rewardLabel}</p>
      <p className="mt-1 text-xs font-semibold">main {progress.completedMain}/{progress.targetMain}</p>
    </div>
  );
}

function TownDetailOverlay({
  date,
  currentDateKey,
  plot,
  record,
  districtProgress,
  districtRewardMessage,
  onClose
}: {
  date: string;
  currentDateKey: string;
  plot: TownPlot;
  record: DailyRecord | undefined;
  districtProgress: DistrictProgress | undefined;
  districtRewardMessage: string;
  onClose: () => void;
}) {
  const dominantType = getDominantQuestType(record, "completed") ?? getDominantQuestType(record, "total");
  const districtProgressRate =
    districtProgress && districtProgress.targetMain > 0
      ? Math.min(100, Math.round((districtProgress.completedMain / districtProgress.targetMain) * 100))
      : 0;
  const sortedQuests = record
    ? [...record.quests].sort((a, b) => Number(a.completed) - Number(b.completed))
    : [];

  return (
    <div className="fixed inset-0 z-[80] flex justify-center bg-slate-950/60 backdrop-blur-sm">
      <div className="h-[100dvh] w-full max-w-[430px] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="flex h-full flex-col overflow-hidden rounded-[36px] border border-white/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_48%,#eff7ff_100%)] shadow-[0_28px_56px_rgba(15,23,42,0.22)]">
          <header className="border-b border-slate-100 px-5 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-black ${districtAccent[plot.district] ?? "bg-slate-100 text-slate-700"}`}>
                    {plot.district}
                  </span>
                  {date === currentDateKey ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">오늘</span>
                  ) : null}
                </div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Town Detail</p>
                <h3 className="mt-2 text-[28px] font-black leading-none text-slate-900">{plot.day}일 기록</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">{date}</p>
              </div>

              <Button
                type="button"
                className="min-h-[44px] rounded-[18px] border-0 bg-slate-100 px-4 py-0 text-sm font-black text-slate-700 shadow-none"
                onClick={onClose}
              >
                닫기
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
            <Card className="rounded-[26px] bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">District Progress</p>
                  <p className="mt-1 text-sm font-black text-slate-900">
                    {districtProgress?.completedMain ?? 0}/{districtProgress?.targetMain ?? 0}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-black ${
                    districtProgress?.unlocked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {districtProgress?.unlocked ? "랜드마크 해금" : "랜드마크 준비 중"}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${districtProgressRate}%` }} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-600">{districtRewardMessage}</p>
            </Card>

            {!record ? (
              <Card className="mt-4 rounded-[26px] bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-black text-slate-900">아직 기록이 없어요.</p>
                <p className="mt-2 leading-relaxed text-slate-500">{getTownDetailEmptyMessage(date, currentDateKey)}</p>
              </Card>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <div className="rounded-[20px] bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">완료</p>
                    <p className="mt-1 text-base font-black text-slate-900">
                      {record.completedCount}/{record.totalCount}
                    </p>
                  </div>
                  <div className="rounded-[20px] bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">완료율</p>
                    <p className="mt-1 text-base font-black text-slate-900">{Math.round(record.completionRate * 100)}%</p>
                  </div>
                  <div className="rounded-[20px] bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">지붕</p>
                    <p className="mt-1 text-base font-black text-slate-900">{roofTypeLabel[getRoofBadge(record)]}</p>
                  </div>
                  <div className="rounded-[20px] bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">중심</p>
                    <p className="mt-1 text-base font-black text-slate-900">
                      {dominantType ? questTypeShortLabel[dominantType] : "혼합"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {sortedQuests.map((quest) => (
                    <div key={quest.id} className="flex items-center justify-between rounded-[20px] bg-slate-50 px-3 py-3">
                      <div className="min-w-0 pr-3">
                        <p className="truncate text-sm font-semibold text-slate-800">{quest.title}</p>
                        <p className="mt-1 text-[11px] font-black text-slate-500">{questTypeShortLabel[quest.type]}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                          quest.completed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {quest.completed ? "완료" : "진행 중"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonthlyTownView() {
  const selectedMonth = useQuestownStore((state) => state.selectedMonth);
  const currentDateKey = useQuestownStore((state) => state.currentDateKey);
  const recordsByDate = useQuestownStore((state) => state.recordsByDate);
  const weeklyMainTarget = useQuestownStore((state) => state.weeklyMainTarget);
  const selectedDateInTown = useQuestownStore((state) => state.selectedDateInTown);
  const moveMonth = useQuestownStore((state) => state.moveMonth);
  const selectDateInTown = useQuestownStore((state) => state.selectDateInTown);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const dayCount = getDaysInMonth(selectedMonth);
  const layout = useMemo(() => createTownLayout(selectedMonth, dayCount), [selectedMonth, dayCount]);
  const currentMonthKey = currentDateKey.slice(0, 7);
  const canMoveToNextMonth = selectedMonth < currentMonthKey;
  const monthProgress = useMemo(
    () => getTownMonthProgress(layout, recordsByDate, weeklyMainTarget),
    [layout, recordsByDate, weeklyMainTarget]
  );

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
  const selectedDistrictProgress = selectedPlot ? monthProgress.districtProgressByName[selectedPlot.district] : undefined;
  const selectedDistrict = layout.districts.find((district) => district.name === selectedPlot?.district);
  const districtRewardMessage = selectedDistrictProgress
    ? selectedDistrictProgress.unlocked
      ? `${selectedDistrict?.rewardLabel ?? "랜드마크"}가 해금됐어요.`
      : selectedDistrictProgress.remainingMain > 0
        ? `이 구역에서 main 퀘스트 ${selectedDistrictProgress.remainingMain}개 더 완료하면 랜드마크가 열립니다.`
        : "이 구역 랜드마크 준비가 끝났어요."
    : "구역 정보를 불러오는 중이에요.";

  const districtRows = useMemo(
    () =>
      layout.districts.map((district) => {
        const plots = layout.plots.filter((plot) => plot.district === district.name).sort((a, b) => a.day - b.day);
        const featuredPlots = plots.filter(
          (plot) => Boolean(recordsByDate[plot.date]) || plot.date === currentDateKey || plot.date === activeSelectedDate
        );
        const compactPlots = plots.filter((plot) => !featuredPlots.some((featured) => featured.date === plot.date));

        return {
          district,
          progress: monthProgress.districtProgressByName[district.name],
          featuredPlots,
          compactPlots
        };
      }),
    [activeSelectedDate, currentDateKey, layout.districts, layout.plots, monthProgress.districtProgressByName, recordsByDate]
  );

  const moveSelection = useCallback(
    (direction: TownDirection) => {
      const nextDate = moveDateInMonth(activeSelectedDate, selectedMonth, dayCount, direction);
      selectDateInTown(nextDate);
    },
    [activeSelectedDate, dayCount, selectDateInTown, selectedMonth]
  );

  const openDetail = useCallback(
    (date: string) => {
      selectDateInTown(date);
      setIsDetailOpen(true);
    },
    [selectDateInTown]
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
      <header className="rounded-[30px] border border-white/80 bg-white/92 p-4 shadow-[0_18px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
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

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-[22px] bg-emerald-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600">해금</p>
            <p className="mt-1 text-lg font-black text-emerald-900">{monthProgress.coreUnlockedCount}/4</p>
          </div>
          <div className="rounded-[22px] bg-slate-900 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Main</p>
            <p className="mt-1 text-lg font-black text-white">{monthProgress.monthlyMainCompleted}</p>
          </div>
          <div className="rounded-[22px] bg-amber-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-600">Monument</p>
            <p className="mt-1 text-lg font-black text-amber-900">{monumentTierLabel[monthProgress.monumentTier]}</p>
          </div>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-[34px] border border-white/80 bg-[linear-gradient(180deg,#f7fcff_0%,#eef8ff_36%,#effbf3_100%)] p-3 shadow-[0_24px_40px_rgba(15,23,42,0.12)]"
        role="region"
        aria-label="월간 타운 스트립"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="mb-3 rounded-[24px] bg-white/82 px-4 py-3">
          <p className="text-sm font-black text-slate-900">기록이 있는 날짜를 크게, 빈 날짜는 간결하게 보여 줍니다.</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            빈 날짜를 눌러도 바로 큰 상세 타일로 승격되며, 선택 정보는 아래 카드에서 확인할 수 있어요.
          </p>
        </div>

        <div className="space-y-3">
          {districtRows.map(({ district, progress, featuredPlots, compactPlots }) => {
            const progressRate = progress.targetMain > 0 ? Math.min(100, Math.round((progress.completedMain / progress.targetMain) * 100)) : 0;

            return (
              <Card key={district.name} className="rounded-[28px] bg-white/82 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-[11px] font-black ${districtAccent[district.name] ?? "bg-slate-100 text-slate-700"}`}>
                        {district.name}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">
                        {district.isCore ? "핵심 구역" : "확장 구역"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-600">
                      main {progress.completedMain}/{progress.targetMain} · {progress.unlocked ? "랜드마크 해금" : "랜드마크 준비 중"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-black ${
                      progress.unlocked ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {progress.unlocked ? "OPEN" : `${progress.remainingMain}개 남음`}
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${progressRate}%` }} />
                </div>

                {compactPlots.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2 rounded-[22px] bg-slate-50 px-3 py-3">
                    {compactPlots.map((plot) => (
                      <CompactTownSlot
                        key={plot.date}
                        plot={plot}
                        isSelected={plot.date === activeSelectedDate}
                        onSelect={openDetail}
                      />
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {featuredPlots.map((plot) => (
                    <FeaturedTownTile
                      key={plot.date}
                      plot={plot}
                      record={recordsByDate[plot.date]}
                      isSelected={plot.date === activeSelectedDate}
                      isToday={plot.date === currentDateKey}
                      onSelect={openDetail}
                    />
                  ))}
                  <DistrictLandmark progress={progress} rewardLabel={district.rewardLabel} />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {isDetailOpen && selectedPlot ? (
        <TownDetailOverlay
          date={activeSelectedDate}
          currentDateKey={currentDateKey}
          plot={selectedPlot}
          record={selectedRecord}
          districtProgress={selectedDistrictProgress}
          districtRewardMessage={districtRewardMessage}
          onClose={() => setIsDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}
