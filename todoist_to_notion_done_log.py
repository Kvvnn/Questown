from __future__ import annotations

import argparse
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

from todoist_completed_today import build_today_completed_report


NOTION_VERSION = "2022-06-28"
NOTION_API_BASE = "https://api.notion.com/v1"
DEFAULT_DB_URL = "https://www.notion.so/kkvvnn/Daily-Done-Log-30ec513e441680b0b9f6cbc65225ff06?source=copy_link"


@dataclass
class SyncResult:
    date_local: str
    total_tasks: int
    created: int
    skipped_duplicate: int
    errors: int


def extract_notion_id(url_or_id: str) -> str:
    raw = (url_or_id or "").strip()
    if re.fullmatch(r"[0-9a-fA-F]{32}", raw):
        return raw
    if re.fullmatch(r"[0-9a-fA-F\-]{36}", raw):
        return raw.replace("-", "")
    m = re.search(r"([0-9a-fA-F]{32})", raw)
    if not m:
        raise ValueError(f"Notion ID not found in: {url_or_id}")
    return m.group(1)


def setup_logger(log_file: str = "logs/todoist_notion_sync.log") -> logging.Logger:
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("todoist_notion_sync")
    logger.setLevel(logging.INFO)

    if not logger.handlers:
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        logger.addHandler(fh)

    return logger


def notion_headers(notion_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {notion_key}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def notion_get_database(notion_key: str, database_id: str) -> Dict[str, Any]:
    resp = requests.get(
        f"{NOTION_API_BASE}/databases/{database_id}",
        headers=notion_headers(notion_key),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def choose_title_property(properties: Dict[str, Any]) -> Optional[str]:
    for name, meta in properties.items():
        if meta.get("type") == "title":
            return name
    return None


def choose_property(properties: Dict[str, Any], candidate_names: List[str], allowed_types: List[str]) -> Optional[str]:
    lowered = {k.lower(): k for k in properties.keys()}
    for cand in candidate_names:
        real = lowered.get(cand.lower())
        if real and properties[real].get("type") in allowed_types:
            return real

    for name, meta in properties.items():
        if meta.get("type") in allowed_types:
            return name

    return None


def build_property_plan(properties: Dict[str, Any]) -> Dict[str, Optional[str]]:
    return {
        "title": choose_title_property(properties),
        "task_id": choose_property(properties, ["Task ID", "Todoist ID", "TaskId", "todoist_id"], ["rich_text", "number", "title"]),
        "completed_at": choose_property(properties, ["Completed At", "완료시각", "완료 일시", "Done At", "Date"], ["date", "rich_text"]),
        "time_bucket": choose_property(properties, ["Time Bucket", "시간대", "Bucket"], ["select", "rich_text"]),
        "project": choose_property(properties, ["Project", "프로젝트"], ["rich_text", "select"]),
        "labels": choose_property(properties, ["Labels", "라벨", "Tags"], ["multi_select", "rich_text"]),
        "review_date": choose_property(properties, ["Review Date", "리뷰일", "Date"], ["date", "rich_text"]),
    }


def query_existing_by_task_id(
    notion_key: str,
    database_id: str,
    task_id_property: str,
    task_id: str,
    prop_type: str,
) -> bool:
    if prop_type not in {"rich_text", "number", "title"}:
        return False

    if prop_type == "number":
        try:
            value = int(task_id)
        except ValueError:
            return False
        filter_payload = {"property": task_id_property, "number": {"equals": value}}
    elif prop_type == "title":
        filter_payload = {"property": task_id_property, "title": {"equals": task_id}}
    else:
        filter_payload = {"property": task_id_property, "rich_text": {"equals": task_id}}

    resp = requests.post(
        f"{NOTION_API_BASE}/databases/{database_id}/query",
        headers=notion_headers(notion_key),
        json={"filter": filter_payload, "page_size": 1},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return bool(data.get("results"))


def _set_title(value: str) -> Dict[str, Any]:
    return {"title": [{"text": {"content": value[:2000]}}]}


def _set_rich_text(value: str) -> Dict[str, Any]:
    return {"rich_text": [{"text": {"content": value[:2000]}}]}


def _set_date(value: str) -> Dict[str, Any]:
    return {"date": {"start": value}}


def _set_select(value: str) -> Dict[str, Any]:
    return {"select": {"name": value[:100]}}


def _set_multi_select(values: List[str]) -> Dict[str, Any]:
    return {"multi_select": [{"name": v[:100]} for v in values[:20]]}


def build_notion_page_properties(
    task: Dict[str, Any],
    date_local: str,
    property_plan: Dict[str, Optional[str]],
    schema: Dict[str, Any],
) -> Dict[str, Any]:
    properties: Dict[str, Any] = {}

    def ptype(prop_name: Optional[str]) -> Optional[str]:
        if not prop_name:
            return None
        return schema.get(prop_name, {}).get("type")

    title_name = property_plan.get("title")
    if title_name:
        properties[title_name] = _set_title(task.get("content") or "(제목 없음)")

    task_id_name = property_plan.get("task_id")
    task_id_type = ptype(task_id_name)
    task_id = str(task.get("task_id") or "")
    if task_id_name and task_id:
        if task_id_type == "number":
            try:
                properties[task_id_name] = {"number": int(task_id)}
            except ValueError:
                pass
        elif task_id_type == "title":
            properties[task_id_name] = _set_title(task_id)
        elif task_id_type == "rich_text":
            properties[task_id_name] = _set_rich_text(task_id)

    completed_name = property_plan.get("completed_at")
    completed_type = ptype(completed_name)
    completed_iso = task.get("completed_at_local")
    completed_str = task.get("completed_at_local_str") or ""
    if completed_name:
        if completed_type == "date" and completed_iso:
            # already stringified datetime in source object can be parsed back
            try:
                dt = datetime.fromisoformat(str(completed_iso).replace("Z", "+00:00"))
                properties[completed_name] = _set_date(dt.isoformat())
            except Exception:
                properties[completed_name] = _set_rich_text(completed_str)
        elif completed_type == "rich_text":
            properties[completed_name] = _set_rich_text(completed_str)

    bucket_name = property_plan.get("time_bucket")
    bucket_type = ptype(bucket_name)
    bucket_value = task.get("time_bucket") or "기타"
    if bucket_name:
        if bucket_type == "select":
            properties[bucket_name] = _set_select(bucket_value)
        elif bucket_type == "rich_text":
            properties[bucket_name] = _set_rich_text(bucket_value)

    project_name_prop = property_plan.get("project")
    project_type = ptype(project_name_prop)
    project_value = task.get("project_name") or ""
    if project_name_prop and project_value:
        if project_type == "select":
            properties[project_name_prop] = _set_select(project_value)
        elif project_type == "rich_text":
            properties[project_name_prop] = _set_rich_text(project_value)

    labels_name = property_plan.get("labels")
    labels_type = ptype(labels_name)
    labels_value = task.get("labels") or []
    if labels_name and labels_value:
        if labels_type == "multi_select":
            properties[labels_name] = _set_multi_select([str(x) for x in labels_value])
        elif labels_type == "rich_text":
            properties[labels_name] = _set_rich_text(", ".join(str(x) for x in labels_value))

    review_name = property_plan.get("review_date")
    review_type = ptype(review_name)
    if review_name:
        if review_type == "date":
            properties[review_name] = _set_date(date_local)
        elif review_type == "rich_text":
            properties[review_name] = _set_rich_text(date_local)

    return properties


def create_notion_page(notion_key: str, database_id: str, properties: Dict[str, Any]) -> None:
    payload = {"parent": {"database_id": database_id}, "properties": properties}
    resp = requests.post(
        f"{NOTION_API_BASE}/pages",
        headers=notion_headers(notion_key),
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()


def sync_todoist_done_to_notion(local_tz: str = "Asia/Seoul", notion_db: Optional[str] = None) -> SyncResult:
    logger = setup_logger()
    notion_key = os.getenv("NOTION_API_KEY")
    if not notion_key and Path("~/.config/notion/api_key").expanduser().exists():
        notion_key = Path("~/.config/notion/api_key").expanduser().read_text(encoding="utf-8").strip()

    if not notion_key:
        raise RuntimeError("NOTION_API_KEY is missing.")

    db_source = notion_db or os.getenv("NOTION_DATABASE_ID") or DEFAULT_DB_URL
    database_id = extract_notion_id(db_source)

    report = build_today_completed_report(local_tz=local_tz)
    tasks = report["tasks"]
    date_local = report["date_local"]

    logger.info("Start Notion sync: date=%s tasks=%s db=%s", date_local, len(tasks), database_id)

    database = notion_get_database(notion_key, database_id)
    schema = database.get("properties", {})
    plan = build_property_plan(schema)

    if not plan.get("title"):
        raise RuntimeError("Target Notion DB has no title property.")

    created = 0
    skipped = 0
    errors = 0

    task_id_prop = plan.get("task_id")
    task_id_type = schema.get(task_id_prop, {}).get("type") if task_id_prop else None

    for task in tasks:
        try:
            task_id = str(task.get("task_id") or "")
            if task_id_prop and task_id:
                exists = query_existing_by_task_id(
                    notion_key=notion_key,
                    database_id=database_id,
                    task_id_property=task_id_prop,
                    task_id=task_id,
                    prop_type=task_id_type or "",
                )
                if exists:
                    skipped += 1
                    continue

            props = build_notion_page_properties(
                task=task,
                date_local=date_local,
                property_plan=plan,
                schema=schema,
            )
            create_notion_page(notion_key, database_id, props)
            created += 1
        except Exception as exc:
            errors += 1
            logger.exception("Failed syncing task_id=%s: %s", task.get("task_id"), exc)

    logger.info(
        "Notion sync done: date=%s total=%s created=%s skipped=%s errors=%s",
        date_local,
        len(tasks),
        created,
        skipped,
        errors,
    )

    return SyncResult(
        date_local=date_local,
        total_tasks=len(tasks),
        created=created,
        skipped_duplicate=skipped,
        errors=errors,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Todoist completed tasks to Notion DB")
    parser.add_argument("--local-tz", default=os.getenv("LOCAL_TZ", "Asia/Seoul"))
    parser.add_argument("--notion-db", default=os.getenv("NOTION_DATABASE_ID"))
    args = parser.parse_args()

    result = sync_todoist_done_to_notion(local_tz=args.local_tz, notion_db=args.notion_db)
    print(
        f"[{result.date_local}] total={result.total_tasks} created={result.created} "
        f"skipped={result.skipped_duplicate} errors={result.errors}"
    )


if __name__ == "__main__":
    main()
