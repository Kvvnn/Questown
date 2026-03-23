"use client";

import { FormEvent, useMemo, useState } from "react";
import { CssFramerBuildingRenderer } from "@/components/animated-building";
import { Button, Card } from "@/components/ui";
import { useQuestownStore, useTodayBuildingHeight, useTodayRecord } from "@/store/questown-store";

const cheers = ["좋아, 1층 완성!", "오늘 town이 자라고 있어요", "지붕까지 거의 다 왔어요"];

export function TodayView() {
  const record = useTodayRecord();
  const height = useTodayBuildingHeight();
  const [input, setInput] = useState("");

  const addTodo = useQuestownStore((s) => s.addTodo);
  const toggleTodo = useQuestownStore((s) => s.toggleTodo);
  const deleteTodo = useQuestownStore((s) => s.deleteTodo);
  const finalizeCurrentDay = useQuestownStore((s) => s.finalizeCurrentDay);
  const goNextDayForDev = useQuestownStore((s) => s.goNextDayForDev);

  const percent = Math.round(record.completionRate * 100);
  const feedback = useMemo(() => {
    if (record.completedCount === 0) return "첫 층을 올려볼까요?";
    return cheers[record.completedCount % cheers.length];
  }, [record.completedCount]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    addTodo(input);
    setInput("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Today · {record.date}</h2>
          <span className="rounded-full bg-quest-grass px-3 py-1 text-sm font-semibold">{feedback}</span>
        </div>
        {CssFramerBuildingRenderer.render({
          height,
          roofType: record.roofType,
          finalized: record.isFinalized
        })}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-2xl bg-slate-100 p-2">완료 {record.completedCount}</div>
          <div className="rounded-2xl bg-slate-100 p-2">전체 {record.totalCount}</div>
          <div className="rounded-2xl bg-slate-100 p-2">완료율 {percent}%</div>
        </div>
        <div className="mt-2 text-center text-xs font-semibold text-slate-600">
          지붕 상태: {record.isFinalized ? record.roofType.toUpperCase() : "마감 전 (NONE)"}
        </div>
        <div className="mt-3 flex gap-2">
          <Button className="min-h-11 flex-1 bg-quest-primary text-white" onClick={finalizeCurrentDay}>
            오늘 마감
          </Button>
          <Button className="min-h-11 flex-1 bg-quest-accent text-slate-900" onClick={goNextDayForDev}>
            다음 날로 넘기기
          </Button>
        </div>
      </Card>

      <Card>
        <form onSubmit={onSubmit} className="mb-3 flex gap-2">
          <input
            aria-label="새 할 일 입력"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="할 일을 입력하세요"
            className="min-h-11 flex-1 rounded-2xl border-2 border-slate-200 px-3 py-2 outline-none focus:border-quest-primary"
          />
          <Button type="submit" className="min-h-11 bg-quest-primary text-white">
            추가
          </Button>
        </form>

        <ul className="space-y-2">
          {record.todos.map((todo) => (
            <li key={todo.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2">
              <input
                aria-label={`${todo.text} 완료 여부`}
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id)}
                className="h-6 w-6"
              />
              <span className={`flex-1 ${todo.completed ? "text-slate-400 line-through" : ""}`}>{todo.text}</span>
              <Button
                aria-label={`${todo.text} 삭제`}
                className="min-h-11 bg-quest-danger px-3 py-2 text-white"
                onClick={() => deleteTodo(todo.id)}
              >
                삭제
              </Button>
            </li>
          ))}
          {record.todos.length === 0 ? <li className="text-sm text-slate-500">오늘 할 일을 추가해 주세요.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
