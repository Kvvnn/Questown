from __future__ import annotations

import argparse
import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from todoist_completed_today import TIME_BUCKETS, build_today_completed_report


@dataclass
class TimeBucketSummary:
    bucket: str
    task_count: int
    task_titles: List[str]


@dataclass
class WorkTypeSummary:
    work_type: str
    count: int


@dataclass
class DailyReviewData:
    date_local: str
    timezone: str
    total_completed: int
    most_productive_bucket: Optional[str]
    bucket_summaries: List[TimeBucketSummary]
    work_type_summaries: List[WorkTypeSummary]
    task_rows: List[Dict[str, Any]]
    review_lines: List[str]


DEFAULT_KEYWORD_MAP: Dict[str, List[str]] = {
    "기획/정리": ["기획", "정리", "계획", "리뷰", "정돈", "분류", "문서", "회의", "회고"],
    "제작/개발": ["제작", "편집", "개발", "구현", "코딩", "빌드", "촬영", "디자인", "수정"],
    "운영/커뮤니케이션": ["연락", "응답", "공유", "전달", "업로드", "배포", "협업"],
    "학습/리서치": ["학습", "리서치", "조사", "공부", "탐색", "분석"],
    "기타": [],
}


def classify_work_type(task: Dict[str, Any], keyword_map: Dict[str, List[str]] = DEFAULT_KEYWORD_MAP) -> str:
    content = (task.get("content") or "").lower()
    labels = [str(x).lower() for x in (task.get("labels") or [])]
    project_name = str(task.get("project_name") or "").lower()

    text = " ".join([content, project_name, " ".join(labels)])

    for work_type, keywords in keyword_map.items():
        if work_type == "기타":
            continue
        if any(keyword.lower() in text for keyword in keywords):
            return work_type
    return "기타"


def summarize_time_buckets(tasks: List[Dict[str, Any]]) -> List[TimeBucketSummary]:
    grouped: Dict[str, List[Dict[str, Any]]] = {bucket.name: [] for bucket in TIME_BUCKETS}
    for task in tasks:
        grouped.setdefault(task["time_bucket"], []).append(task)

    summaries: List[TimeBucketSummary] = []
    for bucket in TIME_BUCKETS:
        rows = grouped.get(bucket.name, [])
        if not rows:
            continue
        summaries.append(
            TimeBucketSummary(
                bucket=bucket.name,
                task_count=len(rows),
                task_titles=[row.get("content", "") for row in rows],
            )
        )

    other_rows = grouped.get("기타", [])
    if other_rows:
        summaries.append(
            TimeBucketSummary(
                bucket="기타",
                task_count=len(other_rows),
                task_titles=[row.get("content", "") for row in other_rows],
            )
        )

    return summaries


def summarize_work_types(tasks: List[Dict[str, Any]]) -> List[WorkTypeSummary]:
    counts: Dict[str, int] = {}
    for task in tasks:
        wtype = classify_work_type(task)
        counts[wtype] = counts.get(wtype, 0) + 1

    sorted_items = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    return [WorkTypeSummary(work_type=k, count=v) for k, v in sorted_items]


def most_productive_bucket(bucket_summaries: List[TimeBucketSummary]) -> Optional[str]:
    if not bucket_summaries:
        return None
    best = max(bucket_summaries, key=lambda x: x.task_count)
    return best.bucket


def build_review_lines(
    date_local: str,
    total_completed: int,
    bucket_summaries: List[TimeBucketSummary],
    work_type_summaries: List[WorkTypeSummary],
) -> List[str]:
    if total_completed == 0:
        return [
            f"{date_local}에는 완료한 Todoist 태스크가 없었습니다.",
            "내일은 핵심 태스크 1~2개를 먼저 끝내는 방식으로 출발해보세요.",
        ]

    bucket_focus = most_productive_bucket(bucket_summaries)
    top_work = work_type_summaries[0].work_type if work_type_summaries else "기타"

    # 시간대 흐름 문장
    flow_fragments: List[str] = []
    for summary in bucket_summaries:
        if summary.task_count == 0:
            continue
        flow_fragments.append(f"{summary.bucket}에 {summary.task_count}개")

    flow_text = ", ".join(flow_fragments)

    lines = [
        f"오늘은 {flow_text} 태스크를 완료했습니다.",
        f"총 {total_completed}개의 태스크를 완료했습니다.",
        f"가장 생산적인 시간대는 {bucket_focus}이었고, 주요 작업 성격은 {top_work}였습니다.",
    ]

    if len(work_type_summaries) > 1:
        second = work_type_summaries[1]
        lines.append(f"그다음으로는 {second.work_type} 작업({second.count}개)이 많았습니다.")

    return lines


def build_daily_review_data(local_tz: str = "Asia/Seoul") -> DailyReviewData:
    report = build_today_completed_report(local_tz=local_tz)
    tasks = report["tasks"]

    bucket_summaries = summarize_time_buckets(tasks)
    work_type_summaries = summarize_work_types(tasks)
    lines = build_review_lines(
        date_local=report["date_local"],
        total_completed=report["total_completed"],
        bucket_summaries=bucket_summaries,
        work_type_summaries=work_type_summaries,
    )

    return DailyReviewData(
        date_local=report["date_local"],
        timezone=report["timezone"],
        total_completed=report["total_completed"],
        most_productive_bucket=most_productive_bucket(bucket_summaries),
        bucket_summaries=bucket_summaries,
        work_type_summaries=work_type_summaries,
        task_rows=tasks,
        review_lines=lines,
    )


def save_review_outputs(data: DailyReviewData, output_dir: str = "reports") -> Tuple[Path, Path]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / f"todoist_review_{data.date_local}.json"
    md_path = out_dir / f"todoist_review_{data.date_local}.md"

    payload = asdict(data)
    # datetime 객체를 문자열로 보정
    for row in payload.get("task_rows", []):
        dt_obj = row.get("completed_at_local")
        if dt_obj is not None:
            row["completed_at_local"] = str(dt_obj)

    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    md_lines = [
        f"# Todoist Daily Review - {data.date_local}",
        "",
        *[f"- {line}" for line in data.review_lines],
        "",
        "## 시간대별 요약",
    ]

    for summary in data.bucket_summaries:
        md_lines.append(f"- **{summary.bucket}**: {summary.task_count}개")

    md_lines.extend(["", "## 작업 유형 요약"])
    for summary in data.work_type_summaries:
        md_lines.append(f"- **{summary.work_type}**: {summary.count}개")

    md_lines.extend(["", "## 완료 태스크 상세"])
    for row in data.task_rows:
        project_name = row.get("project_name") or "(프로젝트 없음)"
        labels = ", ".join(row.get("labels") or []) or "-"
        md_lines.append(
            f"- {row.get('completed_at_local_str')} | {row.get('time_bucket')} | {row.get('content')} "
            f"| 프로젝트: {project_name} | 라벨: {labels}"
        )

    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    return json_path, md_path


def setup_logger(log_file: str = "logs/todoist_nightly_review.log") -> logging.Logger:
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("todoist_nightly_review")
    logger.setLevel(logging.INFO)

    if not logger.handlers:
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


def run_with_retry(local_tz: str, max_retries: int = 2, backoff_seconds: int = 5) -> DailyReviewData:
    logger = setup_logger()
    last_error: Optional[Exception] = None

    for attempt in range(0, max_retries + 1):
        try:
            logger.info("Nightly review attempt=%s started", attempt + 1)
            data = build_daily_review_data(local_tz=local_tz)
            json_path, md_path = save_review_outputs(data)
            logger.info(
                "Nightly review succeeded: total_completed=%s json=%s md=%s",
                data.total_completed,
                json_path,
                md_path,
            )
            return data
        except Exception as exc:
            last_error = exc
            logger.exception("Nightly review failed at attempt=%s: %s", attempt + 1, exc)
            if attempt < max_retries:
                time.sleep(backoff_seconds * (attempt + 1))

    raise RuntimeError(f"Nightly review failed after retries: {last_error}")


def cron_candidates(script_path: str) -> Dict[str, str]:
    return {
        "local_cron": f"0 22 * * * /usr/bin/env zsh -lc 'source ~/.zshrc && python3 {script_path} >> logs/todoist_nightly_review_cron.log 2>&1'",
        "openclaw_cron": "Use OpenClaw cron.add (isolated agentTurn) to run nightly review and announce summary",
        "worker": "Run as a long-lived worker (systemd/launchd) and trigger at 22:00 via scheduler library",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Todoist nightly review")
    parser.add_argument("--local-tz", default=os.getenv("LOCAL_TZ", "Asia/Seoul"))
    parser.add_argument("--max-retries", type=int, default=2)
    parser.add_argument("--backoff-seconds", type=int, default=5)
    parser.add_argument("--show-cron-candidates", action="store_true")
    args = parser.parse_args()

    if args.show_cron_candidates:
        script_path = str(Path(__file__).resolve())
        print(json.dumps(cron_candidates(script_path), ensure_ascii=False, indent=2))
        return

    data = run_with_retry(
        local_tz=args.local_tz,
        max_retries=args.max_retries,
        backoff_seconds=args.backoff_seconds,
    )

    print(f"[{data.date_local}] nightly review generated")
    for line in data.review_lines:
        print(f"- {line}")


if __name__ == "__main__":
    main()
