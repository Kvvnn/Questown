"use client";

import { Button, Card } from "@/components/ui";
import { getBuildingHeight } from "@/domain/building";
import { getDaysInMonth } from "@/domain/date";
import { useQuestownStore } from "@/store/questown-store";

const roofDotColor = {
  none: "bg-slate-300",
  low: "bg-orange-400",
  mid: "bg-amber-500",
  high: "bg-emerald-500"
} as const;

export function MonthlyTownView() {
  const selectedMonth = useQuestownStore((s) => s.selectedMonth);
  const recordsByDate = useQuestownStore((s) => s.recordsByDate);
  const selectedDateInTown = useQuestownStore((s) => s.selectedDateInTown);
  const moveMonth = useQuestownStore((s) => s.moveMonth);
  const selectDateInTown = useQuestownStore((s) => s.selectDateInTown);

  const dayCount = getDaysInMonth(selectedMonth);
  const selectedRecord = selectedDateInTown ? recordsByDate[selectedDateInTown] : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Button className="min-h-11 bg-slate-200" onClick={() => moveMonth(-1)} aria-label="이전 달 보기">
            이전 달
          </Button>
          <h2 className="text-lg font-bold">{selectedMonth} Town</h2>
          <Button className="min-h-11 bg-slate-200" onClick={() => moveMonth(1)} aria-label="다음 달 보기">
            다음 달
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => {
            const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
            const record = recordsByDate[date];
            const h = getBuildingHeight(record?.completedCount ?? 0);

            return (
              <button
                key={date}
                onClick={() => selectDateInTown(date)}
                aria-label={`${date} 상세 보기, ${h}층, 지붕 ${record?.roofType ?? "none"}`}
                className="min-h-16 rounded-2xl border-2 border-slate-100 bg-white p-2 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">{day}일</div>
                  <div className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{h}F</div>
                </div>
                <div className="mt-2 flex h-10 items-end gap-[2px]">
                  {Array.from({ length: Math.min(h, 6) }).map((_, idx) => (
                    <div key={idx} className="h-2 w-2 rounded-sm bg-blue-400" />
                  ))}
                </div>
                <div className={`mt-1 h-2 w-full rounded-full ${roofDotColor[record?.roofType ?? "none"]}`} />
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold">날짜 상세</h3>
        {!selectedRecord ? (
          <p className="text-sm text-slate-500">날짜를 선택하면 todo 요약을 보여줍니다.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>날짜: {selectedRecord.date}</p>
            <p>
              완료: {selectedRecord.completedCount}/{selectedRecord.totalCount} (
              {Math.round(selectedRecord.completionRate * 100)}%)
            </p>
            <p>지붕: {selectedRecord.roofType}</p>
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
