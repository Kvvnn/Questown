"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button, Card } from "@/components/ui";
import { getBuildingHeight, roofTypeLabel } from "@/domain/building";
import { getDaysInMonth } from "@/domain/date";
import { getFloorVisualStyle } from "@/domain/floor-style";
import { getDominantQuestType, questTypeOrder, questTypeShortLabel } from "@/domain/quest";
import { createTownLayout, TownLayout, TownPlot } from "@/domain/town-map";
import { getPreferredTownDate, moveDateInMonth, TownDirection } from "@/domain/town-navigation";
import { DailyRecord, QuestType } from "@/domain/types";
import { useQuestownStore } from "@/store/questown-store";

const weekdayLabel = ["일", "월", "화", "수", "목", "금", "토"];

const roofColor = {
  none: "border-b-slate-300",
  low: "border-b-orange-400",
  mid: "border-b-amber-500",
  high: "border-b-emerald-500"
} as const;

const districtAccent: Record<string, string> = {
  "Week 1": "bg-cyan-100 text-cyan-700",
  "Week 2": "bg-violet-100 text-violet-700",
  "Week 3": "bg-emerald-100 text-emerald-700",
  "Week 4": "bg-amber-100 text-amber-700",
  "Week 5": "bg-pink-100 text-pink-700",
  "Week 6": "bg-slate-100 text-slate-700"
};

const sceneryVisual: Record<"park" | "plaza" | "pond", { base: string; icon: string }> = {
  park: { base: "bg-emerald-200/80", icon: "🌳" },
  plaza: { base: "bg-slate-200/90", icon: "🪧" },
  pond: { base: "bg-cyan-200/80", icon: "💧" }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const directionByKey: Partial<Record<string, TownDirection>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "home",
  End: "end"
};

const getCameraTarget = (plot: TownPlot | undefined, layout: TownLayout, reducedMotion: boolean) => {
  if (!plot) return { x: 0, y: 0, scale: 1 };

  const scale = reducedMotion ? 1 : 1.12;
  const mapCenterX = layout.mapWidth / 2;
  const mapCenterY = layout.mapHeight / 2;
  const focusX = layout.padding + plot.col * layout.slot + layout.tile / 2;
  const focusY = layout.padding + plot.row * layout.slot + layout.tile / 2;

  return {
    x: clamp((mapCenterX - focusX) * scale, -layout.mapWidth * 0.26, layout.mapWidth * 0.26),
    y: clamp((mapCenterY - focusY) * scale, -layout.mapHeight * 0.22, layout.mapHeight * 0.22),
    scale
  };
};

const getTypeAccent = (type: QuestType | null) => {
  if (!type) {
    return {
      badgeClass: "bg-slate-100 text-slate-500",
      icon: "•"
    };
  }

  const visual = getFloorVisualStyle(type);
  return {
    badgeClass: visual.badgeClass,
    icon: visual.icon
  };
};

interface TownLotProps {
  plot: TownPlot;
  layout: TownLayout;
  record?: DailyRecord;
  selected: boolean;
  reducedMotion: boolean;
  onSelect: (date: string) => void;
  onNavigate: (currentDate: string, direction: TownDirection) => void;
}

const getLotAriaLabel = (plot: TownPlot, floors: number, record?: DailyRecord, dominantType?: QuestType | null) => {
  if (!record) {
    return `${plot.date} 건물, ${floors}층, 아직 기록 없음`;
  }

  const dominantLabel = dominantType ? `${questTypeShortLabel[dominantType]} 중심` : "타입 미정";
  const roofLabel = record.isFinalized ? roofTypeLabel[record.roofType] : roofTypeLabel.none;

  return `${plot.date} 건물, ${floors}층, 완료 ${record.completedCount}/${record.totalCount}, ${dominantLabel}, ${roofLabel}`;
};

const TownLot = memo(function TownLot({
  plot,
  layout,
  record,
  selected,
  reducedMotion,
  onSelect,
  onNavigate
}: TownLotProps) {
  const height = getBuildingHeight(record?.completedCount ?? 0);
  const floors = Math.min(height, 12);
  const roofType = record?.isFinalized ? record.roofType : "none";
  const dominantType = getDominantQuestType(record, "completed") ?? getDominantQuestType(record, "total");
  const typeAccent = getTypeAccent(dominantType);

  const facadeClass = dominantType
    ? `bg-gradient-to-b ${getFloorVisualStyle(dominantType).gradientClass} border-slate-300`
    : "bg-gradient-to-b from-slate-300 to-slate-200 border-slate-300";

  const bodyHeight = 20 + Math.min(height, 8) * 3;
  const windowRows = Math.max(1, Math.min(4, Math.ceil(bodyHeight / 12)));
  const windowColumns = dominantType === "main" ? 3 : 2;

  return (
    <button
      type="button"
      id={`town-lot-${plot.date}`}
      onClick={() => onSelect(plot.date)}
      onKeyDown={(event) => {
        const direction = directionByKey[event.key];
        if (!direction) return;

        event.preventDefault();
        onNavigate(plot.date, direction);
      }}
      aria-label={getLotAriaLabel(plot, floors, record, dominantType)}
      aria-pressed={selected}
      aria-current={selected ? "date" : undefined}
      className="group absolute text-left outline-none focus-visible:z-10"
      style={{
        left: layout.padding + plot.col * layout.slot,
        top: layout.padding + plot.row * layout.slot,
        width: layout.tile,
        height: layout.tile + 22
      }}
    >
      <motion.div
        animate={reducedMotion ? { y: 0, scale: 1 } : { y: selected ? -5 : 0, scale: selected ? 1.03 : 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 20 }}
        className={`relative flex h-[74px] w-full items-end justify-center rounded-xl border border-white/70 bg-gradient-to-b from-slate-50 to-slate-100 p-1 shadow group-focus-visible:ring-2 group-focus-visible:ring-quest-primary group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-sky-100 ${selected ? "ring-2 ring-quest-primary" : ""}`}
      >
        <div className="absolute bottom-1 h-2 w-[86%] rounded-full bg-slate-300/85" />

        <div className={`relative w-10 rounded-t-md border ${facadeClass}`} style={{ height: bodyHeight }}>
          <div
            className="absolute inset-x-1 bottom-1 top-1 grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${windowColumns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${windowRows}, minmax(0, 1fr))`
            }}
          >
            {Array.from({ length: windowColumns * windowRows }).map((_, index) => (
              <span key={index} className="rounded-[2px] bg-white/70" />
            ))}
          </div>
        </div>

        {roofType !== "none" ? (
          <div
            className={`absolute left-1/2 top-[8px] h-0 w-0 -translate-x-1/2 border-l-[12px] border-r-[12px] border-b-[10px] border-l-transparent border-r-transparent ${roofColor[roofType]}`}
          />
        ) : null}

        <span
          className={`absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${typeAccent.badgeClass}`}
          title={dominantType ? `${questTypeShortLabel[dominantType]} 중심` : "미정"}
        >
          {typeAccent.icon}
        </span>
      </motion.div>

      <div className="mt-1 flex items-center justify-between px-0.5 text-[10px] font-bold text-slate-600">
        <span>{plot.day}</span>
        <span>{floors}F</span>
      </div>
    </button>
  );
});

export function MonthlyTownView() {
  const selectedMonth = useQuestownStore((state) => state.selectedMonth);
  const currentDateKey = useQuestownStore((state) => state.currentDateKey);
  const recordsByDate = useQuestownStore((state) => state.recordsByDate);
  const selectedDateInTown = useQuestownStore((state) => state.selectedDateInTown);
  const moveMonth = useQuestownStore((state) => state.moveMonth);
  const selectDateInTown = useQuestownStore((state) => state.selectDateInTown);

  const dayCount = getDaysInMonth(selectedMonth);
  const layout = useMemo(() => createTownLayout(selectedMonth, dayCount), [selectedMonth, dayCount]);

  const [cameraNudge, setCameraNudge] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setCameraNudge({ x: 0, y: 0 });
  }, [selectedMonth]);

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

  const reducedMotion = !!useReducedMotion();
  const baseCamera = useMemo(() => getCameraTarget(selectedPlot, layout, reducedMotion), [layout, reducedMotion, selectedPlot]);
  const camera = useMemo(
    () => ({
      x: clamp(baseCamera.x + cameraNudge.x, -layout.mapWidth * 0.34, layout.mapWidth * 0.34),
      y: clamp(baseCamera.y + cameraNudge.y, -layout.mapHeight * 0.28, layout.mapHeight * 0.28),
      scale: baseCamera.scale
    }),
    [baseCamera, cameraNudge.x, cameraNudge.y, layout.mapHeight, layout.mapWidth]
  );

  const districtSummary = useMemo(() => {
    const byDistrict = new Map<string, { completed: number; total: number }>();

    layout.plots.forEach((plot) => {
      const base = byDistrict.get(plot.district) ?? { completed: 0, total: 0 };
      const record = recordsByDate[plot.date];
      base.completed += record?.completedCount ?? 0;
      base.total += record?.totalCount ?? 0;
      byDistrict.set(plot.district, base);
    });

    return layout.districts.map((district) => {
      const value = byDistrict.get(district.name) ?? { completed: 0, total: 0 };
      return {
        name: district.name,
        completed: value.completed,
        rate: value.total > 0 ? Math.round((value.completed / value.total) * 100) : 0
      };
    });
  }, [layout.districts, layout.plots, recordsByDate]);

  const nudgeCamera = (dx: number, dy: number) => {
    setCameraNudge((prev) => ({
      x: clamp(prev.x + dx, -120, 120),
      y: clamp(prev.y + dy, -90, 90)
    }));
  };

  const focusTownLot = useCallback((date: string) => {
    requestAnimationFrame(() => {
      document.getElementById(`town-lot-${date}`)?.focus();
    });
  }, []);

  const moveSelection = useCallback(
    (currentDate: string | undefined, direction: TownDirection, shouldFocusLot = false) => {
      const nextDate = moveDateInMonth(currentDate, selectedMonth, dayCount, direction);
      selectDateInTown(nextDate);

      if (shouldFocusLot) {
        focusTownLot(nextDate);
      }
    },
    [dayCount, focusTownLot, selectDateInTown, selectedMonth]
  );

  const handleMapKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;

      const direction = directionByKey[event.key];
      if (!direction) return;

      event.preventDefault();
      moveSelection(activeSelectedDate, direction, true);
    },
    [activeSelectedDate, moveSelection]
  );

  return (
    <div className="space-y-4" id="town-panel-content">
      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-center text-lg font-black tracking-tight sm:text-left">🏙️ {selectedMonth} Questown 거리</h2>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Button type="button" className="min-h-11 bg-slate-100" onClick={() => moveMonth(-1)} aria-label="이전 달 보기">
              이전 달
            </Button>
            <Button type="button" className="min-h-11 bg-slate-100" onClick={() => moveMonth(1)} aria-label="다음 달 보기">
              다음 달
            </Button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {districtSummary.map((district) => (
            <span
              key={district.name}
              className={`rounded-full px-3 py-1 text-xs font-bold ${districtAccent[district.name] ?? "bg-slate-100 text-slate-700"}`}
            >
              {district.name} · {district.completed}층 · {district.rate}%
            </span>
          ))}
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500">
          {weekdayLabel.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p id="town-map-help" className="text-xs text-slate-500">
            캘린더 배치 기반 타운입니다. 방향키로 날짜를 이동하고, 탐색 버튼으로 화면 중심을 조정할 수 있어요.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button type="button" className="min-h-8 bg-slate-100 px-2 py-1" onClick={() => nudgeCamera(-26, 0)} aria-label="맵 왼쪽">
              ◀
            </Button>
            <Button type="button" className="min-h-8 bg-slate-100 px-2 py-1" onClick={() => nudgeCamera(26, 0)} aria-label="맵 오른쪽">
              ▶
            </Button>
            <Button type="button" className="min-h-8 bg-slate-100 px-2 py-1" onClick={() => nudgeCamera(0, -20)} aria-label="맵 위쪽">
              ▲
            </Button>
            <Button type="button" className="min-h-8 bg-slate-100 px-2 py-1" onClick={() => nudgeCamera(0, 20)} aria-label="맵 아래쪽">
              ▼
            </Button>
            <Button type="button" className="min-h-8 bg-slate-100 px-2 py-1" onClick={() => setCameraNudge({ x: 0, y: 0 })}>
              중앙
            </Button>
          </div>
        </div>

        <div
          role="region"
          aria-label="월간 타운 맵"
          aria-describedby="town-map-help"
          tabIndex={0}
          onKeyDown={handleMapKeyDown}
          className="relative h-[420px] overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-b from-sky-100 via-cyan-50 to-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-quest-primary"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.65),transparent_45%),radial-gradient(circle_at_85%_18%,rgba(196,181,253,0.35),transparent_45%)]" />

          <motion.div
            className="absolute left-1/2 top-1/2"
            style={{
              width: layout.mapWidth,
              height: layout.mapHeight,
              marginLeft: -layout.mapWidth / 2,
              marginTop: -layout.mapHeight / 2
            }}
            animate={camera}
            transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 24 }}
          >
            {layout.districts.map((district) => {
              const top = layout.padding + district.rowStart * layout.slot - layout.gap / 2;
              const height = (district.rowEnd - district.rowStart + 1) * layout.slot + layout.gap;

              return (
                <div
                  key={district.name}
                  className={`pointer-events-none absolute left-2 right-2 rounded-2xl bg-gradient-to-r ${district.tintClass}`}
                  style={{ top, height }}
                >
                  <span className="absolute left-2 top-1 text-[10px] font-black uppercase tracking-wide text-slate-500/80">
                    {district.name}
                  </span>
                </div>
              );
            })}

            {layout.roadCols.map((col) => (
              <div
                key={`road-col-${col}`}
                className="pointer-events-none absolute top-0 bottom-0 w-[12px] rounded-full bg-slate-300/65"
                style={{
                  left: layout.padding + (col + 1) * layout.slot - layout.gap / 2 - 6,
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, rgba(255,255,255,0.75) 0 8px, transparent 8px 16px)"
                }}
              />
            ))}

            {layout.roadRows.map((row) => (
              <div
                key={`road-row-${row}`}
                className="pointer-events-none absolute left-0 right-0 h-[12px] rounded-full bg-slate-300/65"
                style={{
                  top: layout.padding + (row + 1) * layout.slot - layout.gap / 2 - 6,
                  backgroundImage:
                    "repeating-linear-gradient(to right, rgba(255,255,255,0.75) 0 8px, transparent 8px 16px)"
                }}
              />
            ))}

            {layout.scenery.map((tile) => {
              const visual = sceneryVisual[tile.kind];
              return (
                <div
                  key={tile.key}
                  className={`pointer-events-none absolute flex h-7 w-7 items-center justify-center rounded-xl text-[11px] ${visual.base}`}
                  style={{
                    left: layout.padding + tile.col * layout.slot + layout.tile / 2 - 14,
                    top: layout.padding + tile.row * layout.slot + layout.tile / 2 - 14
                  }}
                >
                  {visual.icon}
                </div>
              );
            })}

            {layout.plots.map((plot) => (
              <TownLot
                key={plot.date}
                plot={plot}
                layout={layout}
                record={recordsByDate[plot.date]}
                selected={activeSelectedDate === plot.date}
                reducedMotion={reducedMotion}
                onSelect={selectDateInTown}
                onNavigate={(currentDate, direction) => moveSelection(currentDate, direction, true)}
              />
            ))}
          </motion.div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-600">
          <div className="metric-pill flex items-center justify-center gap-1">🏢 빌딩 부지</div>
          <div className="metric-pill flex items-center justify-center gap-1">🛣️ 거리 그리드</div>
          <div className="metric-pill flex items-center justify-center gap-1">🔖 중심 퀘스트</div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-black">빌딩 상세</h3>

        {selectedPlot ? (
          <span
            className={`mb-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${districtAccent[selectedPlot.district] ?? "bg-slate-100 text-slate-700"}`}
          >
            {selectedPlot.district} · {selectedPlot.day}일
          </span>
        ) : null}

        {!activeSelectedDate ? (
          <p className="text-sm text-slate-500">타운에서 건물을 선택하면 상세를 보여줍니다.</p>
        ) : !selectedRecord ? (
          <div className="space-y-1 text-sm text-slate-600">
            <p>날짜: {activeSelectedDate}</p>
            <p>아직 기록이 없어요. 오늘 퀘스트를 완료해서 건물을 세워보세요.</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>날짜: {selectedRecord.date}</p>
            <p>
              완료: {selectedRecord.completedCount}/{selectedRecord.totalCount} (
              {Math.round(selectedRecord.completionRate * 100)}%)
            </p>
            <p>지붕: {roofTypeLabel[selectedRecord.roofType]}</p>
            <p>상태: {selectedRecord.isFinalized ? "마감됨" : "진행 중"}</p>

            <div className="grid grid-cols-3 gap-2">
              {questTypeOrder.map((type) => {
                const visual = getFloorVisualStyle(type);
                return (
                  <div key={type} className={`rounded-xl px-2 py-2 text-center text-xs font-bold ${visual.badgeClass}`}>
                    {questTypeShortLabel[type]} {selectedRecord.completedByType[type]}/{selectedRecord.totalByType[type]}
                  </div>
                );
              })}
            </div>

            <ul className="list-disc space-y-1 pl-4">
              {selectedRecord.quests.map((quest) => (
                <li key={quest.id}>
                  {quest.completed ? "✅" : "⬜"} [{questTypeShortLabel[quest.type]}] {quest.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
