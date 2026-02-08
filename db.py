from __future__ import annotations

import shutil
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, List, Optional

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "lc_tracker.db"
BACKUP_DIR = DATA_DIR / "backups"

DEFAULT_TAGS = [
    "Array",
    "DP",
    "Greedy",
    "HashMap",
    "Two Pointers",
    "Sliding Window",
    "Graph",
    "Tree",
    "Stack",
    "Binary Search",
]

IMPORTANCE_INTERVALS = {
    "Low": [4, 8, 15, 30, 60, 120, 180],
    "Medium": [2, 4, 7, 15, 30, 60, 90],
    "High": [1, 2, 4, 7, 15, 30, 60],
}


def _normalize_importance(value: str | None) -> str:
    if not value:
        return "Medium"
    lowered = value.strip().lower()
    if lowered in {"high", "critical", "crit"}:
        return "High"
    if lowered in {"low"}:
        return "Low"
    return "Medium"


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lc_num TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            tag_id INTEGER,
            frequency TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_attempt_at TEXT,
            last_review_at TEXT,
            snooze_until TEXT,
            review_count INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (tag_id) REFERENCES tags (id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS problem_tags (
            problem_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (problem_id, tag_id),
            FOREIGN KEY (problem_id) REFERENCES problems (id),
            FOREIGN KEY (tag_id) REFERENCES tags (id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            problem_id INTEGER NOT NULL,
            attempt_at TEXT NOT NULL,
            notes TEXT NOT NULL,
            FOREIGN KEY (problem_id) REFERENCES problems (id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS review_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            problem_id INTEGER NOT NULL,
            reviewed_at TEXT NOT NULL,
            grade TEXT,
            FOREIGN KEY (problem_id) REFERENCES problems (id)
        )
        """
    )
    conn.commit()

    cur.execute("PRAGMA table_info(problems)")
    columns = {row["name"] for row in cur.fetchall()}
    if "snooze_until" not in columns:
        cur.execute("ALTER TABLE problems ADD COLUMN snooze_until TEXT")
        conn.commit()

    cur.execute("UPDATE problems SET frequency = 'High' WHERE frequency = 'Critical'")
    conn.commit()

    for tag in DEFAULT_TAGS:
        cur.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag,))
    conn.commit()

    conn.close()


def backup_db(keep: int = 2) -> None:
    if not DB_PATH.exists():
        return
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"lc_tracker_{stamp}.db"
    shutil.copy2(DB_PATH, backup_path)

    backups = sorted(BACKUP_DIR.glob("lc_tracker_*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in backups[keep:]:
        old.unlink(missing_ok=True)


def _get_or_create_tag(conn: sqlite3.Connection, name: str) -> Optional[int]:
    tag = name.strip()
    if not tag:
        return None
    cur = conn.cursor()
    cur.execute("SELECT id FROM tags WHERE name = ?", (tag,))
    row = cur.fetchone()
    if row:
        return int(row[0])
    cur.execute("INSERT INTO tags (name) VALUES (?)", (tag,))
    return int(cur.lastrowid)


def get_tags() -> List[str]:
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT name FROM tags ORDER BY name COLLATE NOCASE")
    rows = [r[0] for r in cur.fetchall()]
    conn.close()
    return rows


def add_tag(name: str) -> None:
    conn = _connect()
    _get_or_create_tag(conn, name)
    conn.commit()
    conn.close()
    backup_db()


def rename_tag(old: str, new: str) -> bool:
    old = old.strip()
    new = new.strip()
    if not old or not new or old == new:
        return False
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT id FROM tags WHERE name = ?", (new,))
    if cur.fetchone():
        conn.close()
        return False
    cur.execute("UPDATE tags SET name = ? WHERE name = ?", (new, old))
    updated = cur.rowcount > 0
    conn.commit()
    conn.close()
    if updated:
        backup_db()
    return updated


def add_attempt(
    lc_num: str,
    title: str,
    tag_names: Iterable[str],
    frequency: str,
    notes: str,
    attempt_at: Optional[str] = None,
) -> None:
    attempt_at = attempt_at or date.today().isoformat()
    frequency = _normalize_importance(frequency)

    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT id FROM problems WHERE lc_num = ?", (lc_num.strip(),))
    row = cur.fetchone()
    cleaned_tags = [t.strip() for t in tag_names if t and t.strip()]
    tag_id = None
    if row:
        problem_id = int(row["id"])
        cur.execute(
            """
            UPDATE problems
            SET title = ?, tag_id = ?, frequency = ?, last_attempt_at = ?, last_review_at = ?, snooze_until = NULL
            WHERE id = ?
            """,
            (title.strip(), tag_id, frequency, attempt_at, attempt_at, problem_id),
        )
    else:
        cur.execute(
            """
            INSERT INTO problems (lc_num, title, tag_id, frequency, created_at, last_attempt_at, last_review_at, snooze_until)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (lc_num.strip(), title.strip(), tag_id, frequency, attempt_at, attempt_at, attempt_at, None),
        )
        problem_id = int(cur.lastrowid)

    if cleaned_tags:
        cur.execute("DELETE FROM problem_tags WHERE problem_id = ?", (problem_id,))
        for tag in cleaned_tags:
            tag_id = _get_or_create_tag(conn, tag)
            if tag_id is not None:
                cur.execute(
                    "INSERT OR IGNORE INTO problem_tags (problem_id, tag_id) VALUES (?, ?)",
                    (problem_id, tag_id),
                )

    cur.execute(
        "INSERT INTO attempts (problem_id, attempt_at, notes) VALUES (?, ?, ?)",
        (problem_id, attempt_at, notes.strip()),
    )

    conn.commit()
    conn.close()
    backup_db()


def mark_review(problem_id: int, grade: str = "good") -> None:
    today = date.today().isoformat()
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT review_count FROM problems WHERE id = ?", (int(problem_id),))
    row = cur.fetchone()
    if not row:
        conn.close()
        return
    current = int(row["review_count"] or 0)
    grade = (grade or "good").strip().lower()
    if grade == "again":
        new_count = 0
    elif grade == "easy":
        new_count = current + 2
    else:
        new_count = current + 1
    cur.execute(
        """
        UPDATE problems
        SET last_review_at = ?, review_count = ?, snooze_until = NULL
        WHERE id = ?
        """,
        (today, new_count, int(problem_id)),
    )
    cur.execute(
        "INSERT INTO review_logs (problem_id, reviewed_at, grade) VALUES (?, ?, ?)",
        (int(problem_id), today, grade),
    )
    conn.commit()
    conn.close()
    backup_db()


def snooze_problem(problem_id: int, until: str) -> None:
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        "UPDATE problems SET snooze_until = ? WHERE id = ?",
        (until, int(problem_id)),
    )
    conn.commit()
    conn.close()
    backup_db()


def get_problems(search: str = "", tags: List[str] | None = None) -> List[sqlite3.Row]:
    conn = _connect()
    cur = conn.cursor()
    query = """
        SELECT
            p.id,
            p.lc_num,
            p.title,
            p.frequency,
            p.created_at,
            p.last_attempt_at,
            p.last_review_at,
            p.snooze_until,
            p.review_count,
            GROUP_CONCAT(DISTINCT t.name) AS tags,
            COUNT(DISTINCT a.id) AS attempt_count
        FROM problems p
        LEFT JOIN problem_tags pt ON p.id = pt.problem_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        LEFT JOIN attempts a ON p.id = a.problem_id
    """
    params: List[str] = []
    conditions: List[str] = []
    if search.strip():
        like = f"%{search.strip()}%"
        conditions.append("(p.lc_num LIKE ? OR p.title LIKE ? OR t.name LIKE ?)")
        params.extend([like, like, like])
    if tags:
        tag_values = [t for t in tags if t and t != "All"]
        if tag_values:
            placeholders = ", ".join(["?"] * len(tag_values))
            conditions.append(
                "EXISTS (SELECT 1 FROM problem_tags pt2 "
                "JOIN tags t2 ON pt2.tag_id = t2.id "
                f"WHERE pt2.problem_id = p.id AND t2.name IN ({placeholders}))"
            )
            params.extend(tag_values)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " GROUP BY p.id ORDER BY p.last_attempt_at DESC"
    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()
    return rows


def get_problem_detail(problem_id: int) -> Optional[sqlite3.Row]:
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            p.id,
            p.lc_num,
            p.title,
            p.frequency,
            p.created_at,
            p.last_attempt_at,
            p.last_review_at,
            p.snooze_until,
            p.review_count,
            GROUP_CONCAT(DISTINCT t.name) AS tags
        FROM problems p
        LEFT JOIN problem_tags pt ON p.id = pt.problem_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        WHERE p.id = ?
        GROUP BY p.id
        """,
        (int(problem_id),),
    )
    row = cur.fetchone()
    conn.close()
    return row


def get_attempts(problem_id: int) -> List[sqlite3.Row]:
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, attempt_at, notes
        FROM attempts
        WHERE problem_id = ?
        ORDER BY attempt_at DESC
        """,
        (int(problem_id),),
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def get_due_reviews(limit: int = 3) -> List[sqlite3.Row]:
    problems = get_problems()
    today = date.today()
    due: List[tuple[sqlite3.Row, date]] = []

    for row in problems:
        snooze_until = row["snooze_until"]
        if snooze_until:
            try:
                snooze_date = datetime.strptime(snooze_until, "%Y-%m-%d").date()
            except ValueError:
                snooze_date = None
            if snooze_date and snooze_date > today:
                continue
        base_date_str = row["last_review_at"] or row["last_attempt_at"] or row["created_at"]
        try:
            base_date = datetime.strptime(base_date_str, "%Y-%m-%d").date()
        except ValueError:
            base_date = today

        importance = _normalize_importance(row["frequency"])
        intervals = IMPORTANCE_INTERVALS.get(importance, IMPORTANCE_INTERVALS["Medium"])
        stage = min(int(row["review_count"]), len(intervals) - 1)
        required_days = intervals[stage]
        delta_days = (today - base_date).days

        if delta_days >= required_days:
            due.append((row, base_date))

    due.sort(key=lambda item: item[1])
    limit = max(1, min(limit, 5))
    if due:
        return [row for row, _ in due[:limit]]
    return []


def _build_daily_trends(cur: sqlite3.Cursor, days: int) -> dict:
    today = date.today()
    start = today - timedelta(days=days - 1)
    keys = [start + timedelta(days=i) for i in range(days)]
    date_keys = [value.isoformat() for value in keys]
    labels = [value.strftime("%m-%d") for value in keys]

    cur.execute(
        """
        SELECT attempt_at AS day, COUNT(DISTINCT problem_id) AS count
        FROM attempts
        WHERE attempt_at >= ? AND attempt_at <= ?
        GROUP BY attempt_at
        """,
        (start.isoformat(), today.isoformat()),
    )
    attempt_counts = {row["day"]: int(row["count"] or 0) for row in cur.fetchall()}

    cur.execute(
        """
        SELECT reviewed_at AS day, COUNT(DISTINCT problem_id) AS count
        FROM review_logs
        WHERE reviewed_at >= ? AND reviewed_at <= ?
        GROUP BY reviewed_at
        """,
        (start.isoformat(), today.isoformat()),
    )
    review_counts = {row["day"]: int(row["count"] or 0) for row in cur.fetchall()}

    return {
        "labels": labels,
        "attempts": [attempt_counts.get(key, 0) for key in date_keys],
        "reviews": [review_counts.get(key, 0) for key in date_keys],
    }


def _build_monthly_trends(cur: sqlite3.Cursor, months: int) -> dict:
    today = date.today()
    start_month = today.month - (months - 1)
    start_year = today.year
    while start_month <= 0:
        start_month += 12
        start_year -= 1

    month_keys = []
    labels = []
    year = start_year
    month = start_month
    for _ in range(months):
        key = f"{year:04d}-{month:02d}"
        month_keys.append(key)
        labels.append(key)
        month += 1
        if month > 12:
            month = 1
            year += 1

    start_date = date(start_year, start_month, 1).isoformat()
    today_date = today.isoformat()

    cur.execute(
        """
        SELECT strftime('%Y-%m', attempt_at) AS month, COUNT(DISTINCT problem_id) AS count
        FROM attempts
        WHERE attempt_at >= ? AND attempt_at <= ?
        GROUP BY month
        """,
        (start_date, today_date),
    )
    attempt_counts = {row["month"]: int(row["count"] or 0) for row in cur.fetchall()}

    cur.execute(
        """
        SELECT strftime('%Y-%m', reviewed_at) AS month, COUNT(DISTINCT problem_id) AS count
        FROM review_logs
        WHERE reviewed_at >= ? AND reviewed_at <= ?
        GROUP BY month
        """,
        (start_date, today_date),
    )
    review_counts = {row["month"]: int(row["count"] or 0) for row in cur.fetchall()}

    return {
        "labels": labels,
        "attempts": [attempt_counts.get(key, 0) for key in month_keys],
        "reviews": [review_counts.get(key, 0) for key in month_keys],
    }


def get_dashboard_summary() -> dict:
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS count FROM problems")
    total_problems = int(cur.fetchone()["count"] or 0)
    cur.execute("SELECT COUNT(*) AS count FROM attempts")
    total_attempts = int(cur.fetchone()["count"] or 0)
    cur.execute("SELECT COALESCE(SUM(review_count), 0) AS count FROM problems")
    total_reviews = int(cur.fetchone()["count"] or 0)
    cur.execute("SELECT MAX(attempt_at) AS value FROM attempts")
    last_attempt_at = cur.fetchone()["value"]
    cur.execute("SELECT MAX(last_review_at) AS value FROM problems")
    last_review_at = cur.fetchone()["value"]
    cur.execute("SELECT COUNT(*) AS count FROM attempts WHERE attempt_at >= date('now', '-30 day')")
    attempts_30d = int(cur.fetchone()["count"] or 0)
    cur.execute("SELECT COUNT(DISTINCT attempt_at) AS count FROM attempts WHERE attempt_at >= date('now', '-30 day')")
    active_days_30d = int(cur.fetchone()["count"] or 0)
    cur.execute("SELECT COUNT(*) AS count FROM problems WHERE last_attempt_at >= date('now', '-30 day')")
    touched_30d = int(cur.fetchone()["count"] or 0)

    cur.execute("SELECT frequency, COUNT(*) AS count FROM problems GROUP BY frequency")
    importance_counts = {"Low": 0, "Medium": 0, "High": 0}
    for row in cur.fetchall():
        importance = _normalize_importance(row["frequency"])
        importance_counts[importance] = importance_counts.get(importance, 0) + int(row["count"] or 0)

    cur.execute(
        """
        SELECT t.name AS name, COUNT(DISTINCT pt.problem_id) AS count
        FROM tags t
        JOIN problem_tags pt ON t.id = pt.tag_id
        GROUP BY t.id
        ORDER BY count DESC, t.name COLLATE NOCASE ASC
        LIMIT 5
        """
    )
    top_tags = [{"name": row["name"], "count": int(row["count"] or 0)} for row in cur.fetchall()]

    cur.execute(
        """
        SELECT frequency, created_at, last_attempt_at, last_review_at, review_count, snooze_until
        FROM problems
        """
    )
    problem_rows = cur.fetchall()
    trends = {
        "week": _build_daily_trends(cur, 7),
        "month": _build_daily_trends(cur, 30),
        "year": _build_monthly_trends(cur, 12),
    }
    conn.close()

    today = date.today()
    due_now = 0
    due_soon = 0
    for row in problem_rows:
        snooze_until = row["snooze_until"]
        if snooze_until:
            try:
                snooze_date = datetime.strptime(snooze_until, "%Y-%m-%d").date()
            except ValueError:
                snooze_date = None
            if snooze_date and snooze_date > today:
                continue
        base_date_str = row["last_review_at"] or row["last_attempt_at"] or row["created_at"]
        try:
            base_date = datetime.strptime(base_date_str, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        importance = _normalize_importance(row["frequency"])
        intervals = IMPORTANCE_INTERVALS.get(importance, IMPORTANCE_INTERVALS["Medium"])
        stage = min(int(row["review_count"] or 0), len(intervals) - 1)
        required_days = intervals[stage]
        delta_days = (today - base_date).days
        if delta_days >= required_days:
            due_now += 1
        else:
            remaining = required_days - delta_days
            if remaining <= 7:
                due_soon += 1

    coverage_percent = int(round((touched_30d / total_problems) * 100)) if total_problems else 0

    return {
        "totals": {
            "problems": total_problems,
            "attempts": total_attempts,
            "reviews": total_reviews,
        },
        "due": {"now": due_now, "soon": due_soon},
        "activity": {
            "last_attempt_at": last_attempt_at,
            "last_review_at": last_review_at,
            "attempts_30d": attempts_30d,
            "active_days_30d": active_days_30d,
            "coverage_30d": {
                "count": touched_30d,
                "total": total_problems,
                "percent": coverage_percent,
            },
        },
        "importance": importance_counts,
        "top_tags": top_tags,
        "trends": trends,
    }


def update_attempt(attempt_id: int, notes: str) -> None:
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        "UPDATE attempts SET notes = ? WHERE id = ?",
        (notes.strip(), int(attempt_id)),
    )
    conn.commit()
    conn.close()
    backup_db()


def delete_attempt(attempt_id: int) -> None:
    conn = _connect()
    cur = conn.cursor()
    cur.execute("DELETE FROM attempts WHERE id = ?", (int(attempt_id),))
    conn.commit()
    conn.close()
    backup_db()


def delete_problem(problem_id: int) -> None:
    conn = _connect()
    cur = conn.cursor()
    cur.execute("DELETE FROM problem_tags WHERE problem_id = ?", (int(problem_id),))
    cur.execute("DELETE FROM attempts WHERE problem_id = ?", (int(problem_id),))
    cur.execute("DELETE FROM review_logs WHERE problem_id = ?", (int(problem_id),))
    cur.execute("DELETE FROM problems WHERE id = ?", (int(problem_id),))
    conn.commit()
    conn.close()
    backup_db()
