from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import requests


API_BASE = "https://api.todoist.com/api/v1"


@dataclass(frozen=True)
class TimeBucket:
    name: str
    start_hour: int
    end_hour: int


TIME_BUCKETS: List[TimeBucket] = [
    TimeBucket("새벽", 0, 5),
    TimeBucket("아침", 6, 10),
    TimeBucket("점심", 11, 13),
    TimeBucket("오후", 14, 17),
    TimeBucket("저녁", 18, 20),
    TimeBucket("밤", 21, 23),
]


def _iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_iso_to_local(iso_str: str, local_tz: str) -> datetime:
    """Parse Todoist ISO datetime and convert to local timezone."""
    # Todoist timestamps are usually ISO-8601 with trailing Z.
    if iso_str.endswith("Z"):
        iso_str = iso_str[:-1] + "+00:00"
    dt = datetime.fromisoformat(iso_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ZoneInfo(local_tz))


def _bucket_name_for_hour(hour: int) -> str:
    for bucket in TIME_BUCKETS:
        if bucket.start_hour <= hour <= bucket.end_hour:
            return bucket.name
    return "기타"


def _api_get(token: str, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    params = params or {}
    url = f"{API_BASE}{path}"
    resp = requests.get(
        url,
        params=params,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_paginated_results(token: str, path: str, limit: int = 200) -> List[Dict[str, Any]]:
    """Fetch endpoints that return {'results': [...], 'next_cursor': ...}."""
    all_rows: List[Dict[str, Any]] = []
    cursor: Optional[str] = None

    while True:
        params: Dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor

        payload = _api_get(token, path, params=params)
        rows = payload.get("results", [])
        all_rows.extend(rows)

        cursor = payload.get("next_cursor")
        if not cursor:
            break

    return all_rows


def fetch_completed_tasks_today(
    token: str,
    local_tz: str = "Asia/Seoul",
    include_project_and_labels: bool = True,
) -> List[Dict[str, Any]]:
    """
    Fetch today's completed tasks from Todoist, sorted by completion time.

    Returns a list of normalized rows:
      {
        'task_id': str,
        'content': str,
        'completed_at_local': datetime,
        'completed_at_local_str': 'YYYY-MM-DD HH:MM',
        'time_bucket': str,
        'project_id': str|None,
        'project_name': str|None,
        'labels': [str],
        'raw': {...}
      }
    """
    tz = ZoneInfo(local_tz)
    now_local = datetime.now(tz)
    day_start_local = datetime.combine(now_local.date(), time.min, tzinfo=tz)
    day_end_local = day_start_local + timedelta(days=1) - timedelta(microseconds=1)

    payload = _api_get(
        token,
        "/tasks/completed/by_completion_date",
        params={
            "since": _iso_z(day_start_local),
            "until": _iso_z(day_end_local),
            "limit": 200,
        },
    )

    raw_items: List[Dict[str, Any]] = payload.get("items", [])

    project_name_by_id: Dict[str, str] = {}
    label_name_by_id: Dict[str, str] = {}

    if include_project_and_labels:
        projects = _fetch_paginated_results(token, "/projects")
        labels = _fetch_paginated_results(token, "/labels")

        project_name_by_id = {str(p.get("id")): p.get("name", "") for p in projects}
        label_name_by_id = {str(l.get("id")): l.get("name", "") for l in labels}

    normalized: List[Dict[str, Any]] = []
    for item in raw_items:
        completed_at = item.get("completed_at")
        if not completed_at:
            continue

        local_dt = _parse_iso_to_local(completed_at, local_tz)

        label_ids = item.get("labels") or []
        label_names = [label_name_by_id.get(str(label_id), str(label_id)) for label_id in label_ids]

        project_id = item.get("project_id")
        project_name = project_name_by_id.get(str(project_id)) if project_id is not None else None

        normalized.append(
            {
                "task_id": item.get("id"),
                "content": item.get("content", ""),
                "completed_at_local": local_dt,
                "completed_at_local_str": local_dt.strftime("%Y-%m-%d %H:%M"),
                "time_bucket": _bucket_name_for_hour(local_dt.hour),
                "project_id": project_id,
                "project_name": project_name,
                "labels": label_names,
                "raw": item,
            }
        )

    normalized.sort(key=lambda r: r["completed_at_local"])
    return normalized


def group_completed_tasks_by_time_bucket(tasks: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {bucket.name: [] for bucket in TIME_BUCKETS}

    for task in tasks:
        bucket = task.get("time_bucket", "기타")
        grouped.setdefault(bucket, []).append(task)

    # Keep only non-empty groups in the output, preserving bucket order.
    ordered_non_empty: Dict[str, List[Dict[str, Any]]] = {}
    for bucket in TIME_BUCKETS:
        rows = grouped.get(bucket.name, [])
        if rows:
            ordered_non_empty[bucket.name] = rows
    if grouped.get("기타"):
        ordered_non_empty["기타"] = grouped["기타"]

    return ordered_non_empty


def _load_env_from_zshrc(var_name: str) -> Optional[str]:
    zshrc = Path("~/.zshrc").expanduser()
    if not zshrc.exists():
        return None

    pattern = re.compile(rf"^\s*export\s+{re.escape(var_name)}=(.*)\s*$")
    for line in zshrc.read_text(encoding="utf-8").splitlines():
        m = pattern.match(line)
        if not m:
            continue
        value = m.group(1).strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        return value
    return None


def build_today_completed_report(
    token: Optional[str] = None,
    local_tz: str = "Asia/Seoul",
) -> Dict[str, Any]:
    """
    High-level function that returns report-friendly output.

    Output shape:
    {
      'date_local': 'YYYY-MM-DD',
      'timezone': 'Asia/Seoul',
      'total_completed': int,
      'tasks': [...sorted...],
      'grouped': {
         '아침': [...],
         ...
      }
    }
    """
    token = token or os.getenv("TODOIST_TOKEN") or _load_env_from_zshrc("TODOIST_TOKEN")
    if not token:
        raise ValueError("TODOIST_TOKEN is missing. Set env var or add export TODOIST_TOKEN=... to ~/.zshrc")

    tasks = fetch_completed_tasks_today(token=token, local_tz=local_tz, include_project_and_labels=True)
    grouped = group_completed_tasks_by_time_bucket(tasks)

    today_local = datetime.now(ZoneInfo(local_tz)).date().isoformat()
    return {
        "date_local": today_local,
        "timezone": local_tz,
        "total_completed": len(tasks),
        "tasks": tasks,
        "grouped": grouped,
    }


def _print_report(report: Dict[str, Any]) -> None:
    print(f"오늘 완료한 태스크 ({report['date_local']} / {report['timezone']})")
    print(f"총 {report['total_completed']}개\n")

    grouped = report.get("grouped", {})
    if not grouped:
        print("- 오늘 완료한 태스크가 없습니다.")
        return

    for bucket, items in grouped.items():
        print(f"[{bucket}] ({len(items)}개)")
        for row in items:
            project = row.get("project_name") or "(프로젝트 없음)"
            labels = row.get("labels") or []
            label_text = ", ".join(labels) if labels else "-"
            print(
                f"- {row['completed_at_local_str']} | {row['content']} "
                f"| 프로젝트: {project} | 라벨: {label_text}"
            )
        print("")


if __name__ == "__main__":
    tz = os.getenv("LOCAL_TZ", "Asia/Seoul")
    report = build_today_completed_report(local_tz=tz)
    _print_report(report)
