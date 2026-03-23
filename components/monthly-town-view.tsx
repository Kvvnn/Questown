"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import type { KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button, Card } from "@/components/ui";
import { getBuildingHeight } from "@/domain/building";
import { getDaysInMonth } from "@/domain/date";
import { createTownLayout, TownLayout, TownPlot } from "@/domain/town-map";
import { moveDateInMonth, TownDirection } from "@/domain/town-navigation";
import { DailyRecord } from "@/domain/types";
import { useQuestownStore } from "@/store/questown-store";

const roofColor = {
  none: "border-b-slate-300",
  low: "border-b-orange-400",
  mid: "border-b-amber-500",
  high: "border-b-emerald-500"
} as const;

const districtAccent: Record<string, string> = {
  Harbor: "bg-cyan-100 text-cyan-700",
  Market: "bg-violet-100 text-violet-700",
  Garden: "bg-emerald-100 text-emerald-700",
  Hill: "bg-amber-100 text-amber-700",
  Central: "bg-slate-100 text-slate-700"
};

const sceneryVisual: Record<"park" | "plaza" | "pond", { base: string; icon: string }> = {
  park: { base: "bg-emerald-200/80", icon: "🌳" },
  plaza: { base: "bg-slate-200/90", icon: "⛲" },
  pond: { base: "bg-cyan-200/80", icon: "💧" }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getCameraTarget = (plot: TownPlot | undefined, layout: TownLayout, reducedMotion: boolean) => {
  if (!plot) return { x: 0, y: 0, scale: 1 };

  const scale = reducedMotion ? 1 : 1.14;
  const mapCenterX = layout.mapWidth / 2;
  const mapCenterY = layout.mapHeight / 2;
  const focusX = layout.padding + plot.col * layout.slot + layout.tile / 2;
  const focusY = layout.padding + plot.row * layout.slot + layout.tile / 2;

  return {
    x: clamp((mapCenterX - focusX) * scale, -layout.mapWidth * 0.28, layout.mapWidth * 0.28),
    y: clamp((mapCenterY - focusY) * scale, -layout.mapHeight * 0.22, layout.mapHeight * 0.22),
    scale
  };
};

interface TownLotProps {
  plot: TownPlot;
  layout: TownLayout;
  record?: DailyRecord;
  selected: boolean;
  reducedMotion: boolean;
  onSelect: (date: string) => void;
}

const TownLot = memo(function TownLot({ plot, layout, record, selected, reducedMotion, onSelect }: TownLotProps) {
  const height = getBuildingHeight(record?.completedCount ?? 0);
  const floors = Math.min(height, 7);
  const roofType = record?.isFinalized ? record.roofType : "none";

  const buildingPalette =
    height >= 8
      ? "from-indigo-500 to-blue-500"
      : height >= 5
        ? "from-cyan-400 to-blue-400"
        : height >= 2
          ? "from-sky-300 to-cyan-300"
          : "from-slate-300 to-slate-200";

  return (
    <button
      onClick={() => onSelect(plot.date)}
      aria-label={`${plot.date} 빌딩 선택`}
      aria-pressed={selected}
      className="absolute text-left"
      style={{
        left: layout.padding + plot.col * layout.slot,
        top: layout.padding + plot.row * layout.slot,
        width: layout.tile,
        height: layout.tile + 16
      }}
    >
      <motion.div
        animate={reducedMotion ? { y: 0, scale: 1 } : { y: selected ? -6 : 0, scale: selected ? 1.06 : 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className={`relative flex h-11 w-11 flex-col items-center justify-end rounded-2xl border border-white/70 bg-gradient-to-b from-sky-100 to-emerald-100 p-1 shadow ${selected ? "ring-2 ring-quest-primary" : ""}`}
      >
        <div className="absolute bottom-1 h-2 w-[88%] rounded-full bg-emerald-300/80" />

        <div className="z-10 flex flex-col-reverse items-center gap-[2px] pb-[6px]">
          {floors === 0 ? <div className="h-1.5 w-6 rounded-full bg-slate-300" /> : null}
          {Array.from({ length: floors }).map((_, idx) => (
            <div key={idx} className={`relative h-[5px] w-6 rounded-sm bg-gradient-to-r ${buildingPalette}`}>
              <span className="absolute left-1 top-[1px] h-[2px] w-[2px] rounded-full bg-white/70" />
              <span className="absolute right-1 top-[1px] h-[2px] w-[2px] rounded-full bg-white/60" />
            </div>
          ))}
        </div>

        {roofType !== "none" ? (
          <div
            className={`absolute left-1/2 top-[3px] h-0 w-0 -translate-x-1/2 border-l-[10px] border-r-[10px] border-b-[8px] border-l-transparent border-r-transparent ${roofColor[roofType]}`}
          />
        ) : null}

        {roofType === "high" ? <span className="absolute left-[4px] top-[4px] text-[10px]">✨</span> : null}
      </motion.div>

      <div className="mt-1 flex items-center justify-between px-0.5 text-[10px] font-bold text-slate-600">
        <span>{plot.day}</span>
        <span>{height}F</span>
      </div>
    </button>
  );
});

export function MonthlyTownView() {
  const selectedMonth = useQuestownStore((s) => s.selectedMonth);
  const currentDateKey = useQuestownStore((s) => s.currentDateKey);
  const recordsByDate = useQuestownStore((s) => s.recordsByDate);
  const selectedDateInTown = useQuestownStore((s) => s.selectedDateInTown);
  const moveMonth = useQuestownStore((s) => s.moveMonth);
  const selectDateInTown = useQuestownStore((s) => s.selectDateInTown);

  const dayCount = getDaysInMonth(selectedMonth);
  const layout = useMemo(() => createTownLayout(selectedMonth, dayCount), [selectedMonth, dayCount]);

  useEffect(() => {
    const validSelection =
      selectedDateInTown && selectedDateInTown.startsWith(selectedMonth) && layout.plots.some((plot) => plot.date === selectedDateInTown);

    if (validSelection) return;

    const preferred =
      layout.plots.find((plot) => plot.date === currentDateKey)?.date ??
      layout.plots.find((plot) => recordsByDate[plot.date])?.date ??
      layout.plots[0]?.date;

    if (preferred) selectDateInTown(preferred);
  }, [currentDateKey, layout.plots, recordsByDate, selectDateInTown, selectedDateInTown, selectedMonth]);

  const selectedPlot = layout.plots.find((plot) => plot.date === selectedDateInTown);
  const selectedRecord = selectedDateInTown ? recordsByDate[selectedDateInTown] : undefined;

  const reducedMotion = !!useReducedMotion();
  const camera = useMemo(() => getCameraTarget(selectedPlot, layout, reducedMotion), [layout, reducedMotion, selectedPlot]);

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

  const handleMapKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const directionByKey: Record<string, TownDirection> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
        Home: "home",
        End: "end"
      };

      const direction = directionByKey[event.key];
      if (!direction) return;

      event.preventDefault();
      const nextDate = moveDateInMonth(selectedDateInTown, selectedMonth, dayCount, direction);
      selectDateInTown(nextDate);
    },
    [dayCount, selectDateInTown, selectedDateInTown, selectedMonth]
  );

  return (
    <div className="space-y-4" id="town-panel-content">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Button className="min-h-11 bg-slate-100" onClick={() => moveMonth(-1)} aria-label="이전 달 보기">
            이전 달
          </Button>
          <h2 className="text-lg font-black tracking-tight">🗺️ {selectedMonth} Questown Scene</h2>
          <Button className="min-h-11 bg-slate-100" onClick={() => moveMonth(1)} aria-label="다음 달 보기">
            다음 달
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {districtSummary.map((district) => (
            <span
              key={district.name}
              className={`rounded-full px-3 py-1 text-xs font-bold ${districtAccent[district.name] ?? districtAccent.Central}`}
            >
              {district.name} · {district.completed}층 · {district.rate}%
            </span>
          ))}
        </div>

        <p id="town-map-help" className="mb-2 text-xs text-slate-500">
          키보드로도 이동할 수 있어요: ← → ↑ ↓, Home, End
        </p>

        <div
          role="region"
          aria-label="월간 타운 맵"
          aria-describedby="town-map-help"
          tabIndex={0}
          onKeyDown={handleMapKeyDown}
          className="relative h-[390px] overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-b from-sky-100 via-cyan-50 to-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-quest-primary"
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
                className="pointer-events-none absolute top-0 bottom-0 w-[16px] rounded-full bg-slate-300/60"
                style={{
                  left: layout.padding + col * layout.slot + layout.tile / 2 - 8,
                  backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.7) 0 8px, transparent 8px 18px)"
                }}
              />
            ))}

            {layout.roadRows.map((row) => (
              <div
                key={`road-row-${row}`}
                className="pointer-events-none absolute left-0 right-0 h-[16px] rounded-full bg-slate-300/60"
                style={{
                  top: layout.padding + row * layout.slot + layout.tile / 2 - 8,
                  backgroundImage: "repeating-linear-gradient(to right, rgba(255,255,255,0.7) 0 8px, transparent 8px 18px)"
                }}
              />
            ))}

            {layout.scenery.map((tile) => {
              const visual = sceneryVisual[tile.kind];
              return (
                <div
                  key={tile.key}
                  className={`pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-xl text-[10px] ${visual.base}`}
                  style={{
                    left: layout.padding + tile.col * layout.slot + layout.tile / 2 - 12,
                    top: layout.padding + tile.row * layout.slot + layout.tile / 2 - 12
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
                selected={selectedDateInTown === plot.date}
                reducedMotion={reducedMotion}
                onSelect={selectDateInTown}
              />
            ))}
          </motion.div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-600">
          <div className="metric-pill flex items-center justify-center gap-1">🛣️ Road</div>
          <div className="metric-pill flex items-center justify-center gap-1">🌳 Park / Plaza</div>
          <div className="metric-pill flex items-center justify-center gap-1">✨ High Roof Bonus</div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-black">빌딩 상세</h3>

        {selectedPlot ? (
          <span
            className={`mb-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${districtAccent[selectedPlot.district] ?? districtAccent.Central}`}
          >
            {selectedPlot.district} · Day {selectedPlot.day}
          </span>
        ) : null}

        {!selectedDateInTown ? (
          <p className="text-sm text-slate-500">Town에서 빌딩을 선택하면 상세를 보여줍니다.</p>
        ) : !selectedRecord ? (
          <div className="space-y-1 text-sm text-slate-600">
            <p>날짜: {selectedDateInTown}</p>
            <p>아직 기록이 없어요. 오늘 Todo를 완료해서 건물을 세워보세요.</p>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p>날짜: {selectedRecord.date}</p>
            <p>
              완료: {selectedRecord.completedCount}/{selectedRecord.totalCount} (
              {Math.round(selectedRecord.completionRate * 100)}%)
            </p>
            <p>지붕: {selectedRecord.roofType}</p>
            <p>상태: {selectedRecord.isFinalized ? "마감됨" : "진행 중"}</p>
            <ul className="list-disc space-y-1 pl-4">
              {selectedRecord.todos.map((todo) => (
                <li key={todo.id}>
                  {todo.completed ? "✅" : "⬜"} {todo.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
