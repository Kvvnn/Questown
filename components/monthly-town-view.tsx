"use client";

import { motion } from "framer-motion";
import { Button, Card } from "@/components/ui";
import { getBuildingHeight } from "@/domain/building";
import { getDaysInMonth } from "@/domain/date";
import { useQuestownStore } from "@/store/questown-store";

const roofColor = {
  none: "bg-slate-300",
  low: "bg-orange-400",
  mid: "bg-amber-500",
  high: "bg-emerald-500"
} as const;

const districtName = ["Harbor", "Central", "Garden", "Hill", "Sky"];

function TownBuilding({ height, roofType, selected }: { height: number; roofType: keyof typeof roofColor; selected: boolean }) {
  const style = height >= 7 ? "from-indigo-400 to-blue-500" : height >= 4 ? "from-cyan-300 to-blue-400" : "from-blue-200 to-blue-300";

  return (
    <motion.div
      animate={{ y: selected ? -2 : 0, scale: selected ? 1.02 : 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      className={`relative flex h-20 w-full flex-col items-center justify-end rounded-2xl bg-gradient-to-b from-sky-100 to-emerald-100 p-1 ${selected ? "ring-2 ring-quest-primary" : ""}`}
    >
      <div className="absolute bottom-1 h-2 w-[90%] rounded-full bg-emerald-300/80" />

      <div className="flex flex-col-reverse items-center gap-[2px] pb-2">
        {Array.from({ length: Math.min(height, 7) }).map((_, i) => (
          <div key={i} className={`h-2 w-6 rounded-sm bg-gradient-to-r ${style}`} />
        ))}
      </div>

      <div className={`absolute top-1 right-1 h-2 w-3 rounded-sm ${roofColor[roofType]}`} />
      {roofType === "high" ? <div className="absolute top-1 left-1 text-[10px]">✨</div> : null}
    </motion.div>
  );
}

export function MonthlyTownView() {
  const selectedMonth = useQuestownStore((s) => s.selectedMonth);
  const recordsByDate = useQuestownStore((s) => s.recordsByDate);
  const selectedDateInTown = useQuestownStore((s) => s.selectedDateInTown);
  const moveMonth = useQuestownStore((s) => s.moveMonth);
  const selectDateInTown = useQuestownStore((s) => s.selectDateInTown);

  const dayCount = getDaysInMonth(selectedMonth);
  const selectedRecord = selectedDateInTown ? recordsByDate[selectedDateInTown] : undefined;

  const weeks = Array.from({ length: Math.ceil(dayCount / 7) }, (_, row) => {
    const start = row * 7 + 1;
    return Array.from({ length: 7 }, (_, col) => start + col).filter((d) => d <= dayCount);
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Button className="min-h-11 bg-slate-200" onClick={() => moveMonth(-1)}>
            이전 달
          </Button>
          <h2 className="text-lg font-bold">🏘️ {selectedMonth} Questown</h2>
          <Button className="min-h-11 bg-slate-200" onClick={() => moveMonth(1)}>
            다음 달
          </Button>
        </div>

        <div className="rounded-3xl bg-gradient-to-b from-sky-100 via-sky-50 to-emerald-100 p-3">
          <div className="space-y-3">
            {weeks.map((days, weekIdx) => (
              <div key={weekIdx} className="space-y-2 rounded-2xl bg-white/70 p-2 backdrop-blur">
                <div className="text-xs font-bold text-slate-500">{districtName[weekIdx] ?? `District ${weekIdx + 1}`}</div>
                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 7 }).map((_, slot) => {
                    const day = days[slot];
                    if (!day) return <div key={slot} className="h-20 rounded-2xl bg-white/40" />;

                    const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
                    const rec = recordsByDate[date];
                    const height = getBuildingHeight(rec?.completedCount ?? 0);
                    const roofType = (rec?.roofType ?? "none") as keyof typeof roofColor;
                    const selected = selectedDateInTown === date;

                    return (
                      <button
                        key={date}
                        onClick={() => selectDateInTown(date)}
                        aria-label={`${date} 상세 보기`}
                        className="text-left"
                      >
                        <TownBuilding height={height} roofType={roofType} selected={selected} />
                        <div className="mt-1 flex items-center justify-between px-1 text-[10px] font-semibold text-slate-600">
                          <span>{day}일</span>
                          <span>{height}F</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold">빌딩 상세</h3>
        {!selectedRecord ? (
          <p className="text-sm text-slate-500">Town에서 건물을 선택하면 기록을 보여줍니다.</p>
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
              {selectedRecord.todos.map((t) => (
                <li key={t.id}>
                  {t.completed ? "✅" : "⬜"} {t.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
