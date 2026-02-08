from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List

from flask import Flask, jsonify, render_template, request
from markdown import markdown as md_to_html

from db import (
    add_attempt,
    add_tag,
    delete_attempt,
    delete_problem,
    get_attempts,
    get_due_reviews,
    get_dashboard_summary,
    get_problem_detail,
    get_problems,
    get_tags,
    init_db,
    mark_review,
    rename_tag,
    snooze_problem,
    update_attempt,
)

app = Flask(__name__, static_folder="static", template_folder="templates")

IMPORTANCE_ALIASES = {
    "critical": "High",
    "crit": "High",
}


def _days_since(value: str | None) -> int | None:
    if not value:
        return None
    try:
        base = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None
    return (date.today() - base).days


def _normalize_importance(value: str | None) -> str:
    if not value:
        return "Medium"
    lowered = value.strip().lower()
    if lowered in {"high", "low", "medium"}:
        return lowered.title()
    if lowered in IMPORTANCE_ALIASES:
        return IMPORTANCE_ALIASES[lowered]
    return "Medium"


def _problem_payload(row) -> Dict[str, Any]:
    tags = []
    if row["tags"]:
        tags = [t.strip() for t in row["tags"].split(",") if t.strip()]
    return {
        "id": row["id"],
        "lc_num": row["lc_num"],
        "title": row["title"],
        "tags": tags,
        "importance": _normalize_importance(row["frequency"]),
        "created_at": row["created_at"],
        "last_attempt_at": row["last_attempt_at"],
        "last_review_at": row["last_review_at"],
        "snooze_until": row["snooze_until"],
        "review_count": row["review_count"],
        "attempt_count": row["attempt_count"],
        "days_since": _days_since(row["last_attempt_at"]),
    }


def _attempt_payload(row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "attempt_at": row["attempt_at"],
        "notes": row["notes"],
        "notes_html": md_to_html(row["notes"], extensions=["extra", "sane_lists"]),
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/tags")
def api_tags():
    return jsonify({"tags": get_tags()})


@app.post("/api/tags")
def api_add_tag():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Name required"}), 400
    add_tag(name)
    return jsonify({"ok": True})


@app.post("/api/tags/rename")
def api_rename_tag():
    data = request.get_json(force=True)
    old = (data.get("old") or "").strip()
    new = (data.get("new") or "").strip()
    if not old or not new:
        return jsonify({"ok": False, "error": "Invalid tag"}), 400
    ok = rename_tag(old, new)
    return jsonify({"ok": ok})


@app.get("/api/problems")
def api_problems():
    search = request.args.get("search", "")
    tags = request.args.get("tags", "")
    tag_list = [t for t in tags.split(",") if t.strip()]
    rows = get_problems(search, tag_list)
    return jsonify({"problems": [_problem_payload(r) for r in rows]})


@app.get("/api/problems/<int:problem_id>")
def api_problem_detail(problem_id: int):
    row = get_problem_detail(problem_id)
    if not row:
        return jsonify({"error": "Not found"}), 404
    detail = {
        "id": row["id"],
        "lc_num": row["lc_num"],
        "title": row["title"],
        "tags": [t.strip() for t in (row["tags"] or "").split(",") if t.strip()],
        "importance": _normalize_importance(row["frequency"]),
        "review_count": row["review_count"],
        "days_since": _days_since(row["last_attempt_at"]),
    }
    attempts = get_attempts(problem_id)
    return jsonify({"detail": detail, "attempts": [_attempt_payload(a) for a in attempts]})


@app.get("/api/reviews")
def api_reviews():
    limit = int(request.args.get("limit", 3))
    rows = get_due_reviews(limit)
    return jsonify({"reviews": [_problem_payload(r) for r in rows]})


@app.get("/api/dashboard")
def api_dashboard():
    return jsonify(get_dashboard_summary())


@app.post("/api/reviews/<int:problem_id>")
def api_mark_review(problem_id: int):
    data = request.get_json(silent=True) or {}
    grade = (data.get("grade") or "good").strip()
    mark_review(problem_id, grade)
    return jsonify({"ok": True})


@app.post("/api/reviews/<int:problem_id>/snooze")
def api_snooze_review(problem_id: int):
    data = request.get_json(force=True)
    until = (data.get("until") or "").strip()
    if not until:
        return jsonify({"ok": False, "error": "Date required"}), 400
    try:
        datetime.strptime(until, "%Y-%m-%d")
    except ValueError:
        return jsonify({"ok": False, "error": "Invalid date"}), 400
    snooze_problem(problem_id, until)
    return jsonify({"ok": True})


@app.post("/api/attempts")
def api_add_attempt():
    data = request.get_json(force=True)
    lc_num = (data.get("lc_num") or "").strip()
    title = (data.get("title") or "").strip()
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = [tags]
    importance = _normalize_importance(data.get("importance"))
    notes = (data.get("notes") or "").strip()
    if not lc_num or not title or not notes:
        return jsonify({"ok": False, "error": "Missing required fields"}), 400
    add_attempt(lc_num, title, tags, importance, notes, attempt_at=date.today().isoformat())
    return jsonify({"ok": True})


@app.patch("/api/attempts/<int:attempt_id>")
def api_update_attempt(attempt_id: int):
    data = request.get_json(force=True)
    notes = (data.get("notes") or "").strip()
    if not notes:
        return jsonify({"ok": False, "error": "Notes required"}), 400
    update_attempt(attempt_id, notes)
    return jsonify({"ok": True})


@app.delete("/api/attempts/<int:attempt_id>")
def api_delete_attempt(attempt_id: int):
    delete_attempt(attempt_id)
    return jsonify({"ok": True})


@app.delete("/api/problems/<int:problem_id>")
def api_delete_problem(problem_id: int):
    delete_problem(problem_id)
    return jsonify({"ok": True})


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5123, debug=True)
