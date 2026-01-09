# LeetCode Notes (Local)

A minimal, elegant local web app for tracking LeetCode solves, reflections, and review reminders. All data stays on your Mac with automatic backups.

## Why this exists
- Record every solve with structured metadata (LC #, title, tags, importance) and rich notes
- Revisit insights easily with a clean library view
- Get daily review prompts based on spaced repetition intervals

## Key features
- **Daily Review**: 1–3 items per day, completion state with progress feedback
- **Multi-tagging**: flexible tags with multi-select filters
- **Notes-first**: Markdown notes with live preview in Library
- **Edit & delete**: update or remove individual entries or an entire problem
- **Local & safe**: SQLite data store + automatic rolling backups

## Local setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python web_app.py
```
Then open `http://127.0.0.1:5123`.

## Data location
- Database: `data/lc_tracker.db` (local only)
- Backups: `data/backups/` (local only)

## Review logic (spaced repetition)
- **High**: 1, 2, 4, 7, 15, 30, 60 days
- **Medium**: 2, 4, 7, 15, 30, 60, 90 days

Only clicking “Mark Reviewed” increases review count.

## Project structure
```
lc_tracker/
  web_app.py
  db.py
  templates/
  static/
  data/
```
