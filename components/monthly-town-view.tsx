"use client";

import React, { KeyboardEvent, useCallback, useMemo, useState } from "react";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { Button, Card } from "@/components/ui";
import { addMonths } from "@/domain/date";
import { getRoofLabel } from "@/domain/game-building";
import { DailyBuilding, ReviewSummary, SurpriseQuest, TownMonth } from "@/domain/game-types";
import { DistrictProgress, TownLayout, TownMonthProgress } from "@/domain/town-map";
import { getPreferredTownDate, moveDateInMonth, TownDirection } from "@/domain/town-navigation";
import { RoofType as LegacyRoofType } from "@/domain/types";

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

const seasonThemeLabel: Record<TownMonth["seasonTheme"], string> = {
  spring: "봄 테마",
  summer: "여름 테마",
  autumn: "가을 테마",
  winter: "겨울 테마"
};

const monumentTierLabel = ["휴면", "씨앗", "기초", "성장", "완성"];

const formatMonthTitle = (monthKey: string) => {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
};

const getTownDetailEmptyMessage = (date: string, currentDateKey: string) => {
  if (date === currentDateKey) return "오늘 Clear+ 세션이 쌓이면 이 자리에 새 building이 올라옵니다.";
  if (date > currentDateKey) return "아직 오지 않은 날짜예요. 오늘을 쌓아 가면 이 타일도 열립니다.";
  return "이 날짜에는 아직 세워진 building이 없어요.";
};

const toRenderableRoofType = (roofType: DailyBuilding["roofType"]): LegacyRoofType => (roofType === "gold" ? "high" : roofType);

const getOrnamentLabels = ({
  ornamentIds,
  surpriseQuestsById
}: {
  ornamentIds: string[];
  surpriseQuestsById: Record<string, SurpriseQuest>;
}) =>
  ornamentIds.map((ornamentId) => surpriseQuestsById[ornamentId]?.title ?? ornamentId);

function FeaturedTownTile({
  plot,
  floorCount,
  roofType,
  ornamentCount,
  isSelected,
  isToday,
  onSelect
}: {
  plot: TownLayout["plots"][number];
  floorCount: number;
  roofType: DailyBuilding["roofType"];
  ornamentCount: number;
  isSelected: boolean;
  isToday: boolean;
  onSelect: (date: string) => void;
}) {
  const hasBuilding = floorCount > 0;

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

      <div className="mt-4 flex h-24 items-center justify-center rounded-[20px] bg-slate-50 px-2 py-2">
        {hasBuilding ? (
          <div className="scale-[0.62]">
            {CssFramerBuildingRenderer.render({
              height: floorCount,
              roofType: toRenderableRoofType(roofType),
              finalized: roofType !== "none",
              compact: true,
              reducedMotion: true,
              maxVisibleFloors: 5
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-slate-300 text-xl">+</span>
            <span className="text-[11px] font-semibold">빈 날짜</span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-base font-black text-slate-900">{hasBuilding ? `floor ${floorCount}` : "기록 없음"}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {hasBuilding
            ? `${getRoofLabel(roofType)}${ornamentCount > 0 ? ` · ornament ${ornamentCount}` : ""}`
            : "선택하면 상세를 볼 수 있어요"}
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
  plot: TownLayout["plots"][number];
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
      <p className="mt-1 text-xs font-semibold">floor {progress.completedMain}/{progress.targetMain}</p>
    </div>
  );
}

export function TownDetailOverlay({
  date,
  currentDateKey,
  plot,
  floorCount,
  roofType,
  ornamentIds,
  building,
  reviewSummary,
  districtProgress,
  districtRewardMessage,
  surpriseQuestsById,
  onClose
}: {
  date: string;
  currentDateKey: string;
  plot: TownLayout["plots"][number];
  floorCount: number;
  roofType: DailyBuilding["roofType"];
  ornamentIds: string[];
  building?: DailyBuilding;
  reviewSummary?: ReviewSummary;
  districtProgress: DistrictProgress | undefined;
  districtRewardMessage: string;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  onClose: () => void;
}) {
  const districtProgressRate =
    districtProgress && districtProgress.targetMain > 0
      ? Math.min(100, Math.round((districtProgress.completedMain / districtProgress.targetMain) * 100))
      : 0;
  const ornamentLabels = getOrnamentLabels({
    ornamentIds,
    surpriseQuestsById
  });

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

            {!building || floorCount === 0 ? (
              <Card className="mt-4 rounded-[26px] bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-black text-slate-900">{getTownDetailEmptyMessage(date, currentDateKey)}</p>
              </Card>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-[20px] bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Floors</p>
                    <p className="mt-1 text-base font-black text-slate-900">{floorCount}</p>
                  </div>
                  <div className="rounded-[20px] bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Roof</p>
                    <p className="mt-1 text-base font-black text-slate-900">{getRoofLabel(roofType)}</p>
                  </div>
                  <div className="rounded-[20px] bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Sessions</p>
                    <p className="mt-1 text-base font-black text-slate-900">{building.successfulSessionCount}</p>
                  </div>
                  <div className="rounded-[20px] bg-slate-50 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Score</p>
                    <p className="mt-1 text-base font-black text-slate-900">{building.totalScore}</p>
                  </div>
                </div>

                <Card className="mt-4 rounded-[26px] bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Review</p>
                  <h4 className="mt-2 text-base font-black text-slate-900">{reviewSummary?.headline ?? "아직 하루 리뷰 전입니다."}</h4>
                  {reviewSummary?.body ? <p className="mt-2 text-sm leading-6 text-slate-600">{reviewSummary.body}</p> : null}
                </Card>

                <Card className="mt-4 rounded-[26px] bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Ornaments</p>
                  {ornamentLabels.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ornamentLabels.map((label) => (
                        <span key={label} className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700">
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-500">없음</p>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface MonthlyTownViewProps {
  townMonth: TownMonth;
  layout: TownLayout;
  monthProgress: TownMonthProgress;
  currentGameDateKey: string;
  selectedDateKey: string;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  reviewSummariesById: Record<string, ReviewSummary>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  canMoveToNextMonth: boolean;
  onSelectDate: (dateKey: string) => void;
  onChangeMonth: (monthKey: string) => void;
  onClose: () => void;
  initialDetailOpen?: boolean;
}

export function MonthlyTownView({
  townMonth,
  layout,
  monthProgress,
  currentGameDateKey,
  selectedDateKey,
  dailyBuildingsByDate,
  reviewSummariesById,
  surpriseQuestsById,
  canMoveToNextMonth,
  onSelectDate,
  onChangeMonth,
  onClose,
  initialDetailOpen = false
}: MonthlyTownViewProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(initialDetailOpen);
  const snapshotByDate = useMemo(
    () => Object.fromEntries(townMonth.plotSnapshots.map((snapshot) => [snapshot.dateKey, snapshot])),
    [townMonth.plotSnapshots]
  );
  const activeSelectedDate = useMemo(
    () =>
      getPreferredTownDate({
        monthKey: townMonth.monthKey,
        dayCount: layout.plots.length,
        currentDate: townMonth.monthKey === currentGameDateKey.slice(0, 7) ? currentGameDateKey : undefined,
        selectedDate: selectedDateKey,
        availableDates: Object.keys(dailyBuildingsByDate)
      }),
    [currentGameDateKey, dailyBuildingsByDate, layout.plots.length, selectedDateKey, townMonth.monthKey]
  );
  const selectedPlot = layout.plots.find((plot) => plot.date === activeSelectedDate);
  const selectedSnapshot = activeSelectedDate ? snapshotByDate[activeSelectedDate] : undefined;
  const selectedBuilding = activeSelectedDate ? dailyBuildingsByDate[activeSelectedDate] : undefined;
  const selectedReviewSummary =
    selectedBuilding?.reviewSummaryId ? reviewSummariesById[selectedBuilding.reviewSummaryId] : undefined;
  const selectedDistrictProgress = selectedPlot ? monthProgress.districtProgressByName[selectedPlot.district] : undefined;
  const selectedDistrict = layout.districts.find((district) => district.name === selectedPlot?.district);
  const districtRewardMessage = selectedDistrictProgress
    ? selectedDistrictProgress.unlocked
      ? `${selectedDistrict?.rewardLabel ?? "랜드마크"}가 해금됐어요.`
      : selectedDistrictProgress.remainingMain > 0
        ? `이 구역에서 floor ${selectedDistrictProgress.remainingMain}개를 더 쌓으면 랜드마크가 열립니다.`
        : "이 구역 랜드마크 준비가 끝났어요."
    : "구역 정보를 불러오는 중이에요.";

  const districtRows = useMemo(
    () =>
      layout.districts.map((district) => {
        const plots = layout.plots.filter((plot) => plot.district === district.name).sort((a, b) => a.day - b.day);
        const featuredPlots = plots.filter(
          (plot) => Boolean(snapshotByDate[plot.date]) || plot.date === currentGameDateKey || plot.date === activeSelectedDate
        );
        const compactPlots = plots.filter((plot) => !featuredPlots.some((featured) => featured.date === plot.date));

        return {
          district,
          progress: monthProgress.districtProgressByName[district.name],
          featuredPlots,
          compactPlots
        };
      }),
    [activeSelectedDate, currentGameDateKey, layout.districts, layout.plots, monthProgress.districtProgressByName, snapshotByDate]
  );

  const moveSelection = useCallback(
    (direction: TownDirection) => {
      const nextDate = moveDateInMonth(activeSelectedDate, townMonth.monthKey, layout.plots.length, direction);
      onSelectDate(nextDate);
    },
    [activeSelectedDate, layout.plots.length, onSelectDate, townMonth.monthKey]
  );

  const openDetail = useCallback(
    (date: string) => {
      onSelectDate(date);
      setIsDetailOpen(true);
    },
    [onSelectDate]
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
            <h2 className="truncate text-xl font-black tracking-tight text-slate-900">{formatMonthTitle(townMonth.monthKey)}</h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="h-11 min-h-0 rounded-2xl border-0 bg-slate-100 px-4 py-0 text-sm font-black text-slate-700 shadow-none"
              onClick={() => onChangeMonth(addMonths(townMonth.monthKey, -1))}
            >
              이전 달
            </Button>
            <Button
              type="button"
              className="h-11 min-h-0 rounded-2xl border-0 bg-slate-100 px-4 py-0 text-sm font-black text-slate-700 shadow-none disabled:opacity-40"
              onClick={() => onChangeMonth(addMonths(townMonth.monthKey, 1))}
              disabled={!canMoveToNextMonth}
            >
              다음 달
            </Button>
            <Button
              type="button"
              className="h-11 min-h-0 rounded-2xl border-0 bg-slate-900 px-4 py-0 text-sm font-black text-white shadow-none"
              onClick={onClose}
            >
              닫기
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-[22px] bg-emerald-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600">해금</p>
            <p className="mt-1 text-lg font-black text-emerald-900">{monthProgress.coreUnlockedCount}/4</p>
          </div>
          <div className="rounded-[22px] bg-slate-900 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Floors</p>
            <p className="mt-1 text-lg font-black text-white">{townMonth.totalFloorCount}</p>
          </div>
          <div className="rounded-[22px] bg-amber-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-600">{seasonThemeLabel[townMonth.seasonTheme]}</p>
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
                      floor {progress.completedMain}/{progress.targetMain} · {progress.unlocked ? "랜드마크 해금" : "랜드마크 준비 중"}
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
                      <CompactTownSlot key={plot.date} plot={plot} isSelected={plot.date === activeSelectedDate} onSelect={openDetail} />
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  <DistrictLandmark progress={progress} rewardLabel={district.rewardLabel} />
                  {featuredPlots.map((plot) => {
                    const snapshot = snapshotByDate[plot.date];
                    return (
                      <FeaturedTownTile
                        key={plot.date}
                        plot={plot}
                        floorCount={snapshot?.floorCount ?? 0}
                        roofType={snapshot?.roofType ?? "none"}
                        ornamentCount={snapshot?.ornamentIds.length ?? 0}
                        isSelected={plot.date === activeSelectedDate}
                        isToday={plot.date === currentGameDateKey}
                        onSelect={openDetail}
                      />
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {isDetailOpen && selectedPlot ? (
        <TownDetailOverlay
          date={activeSelectedDate}
          currentDateKey={currentGameDateKey}
          plot={selectedPlot}
          floorCount={selectedSnapshot?.floorCount ?? 0}
          roofType={selectedSnapshot?.roofType ?? "none"}
          ornamentIds={selectedSnapshot?.ornamentIds ?? []}
          building={selectedBuilding}
          reviewSummary={selectedReviewSummary}
          districtProgress={selectedDistrictProgress}
          districtRewardMessage={districtRewardMessage}
          surpriseQuestsById={surpriseQuestsById}
          onClose={() => setIsDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}
