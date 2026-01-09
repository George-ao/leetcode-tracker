# Smart LeetCode Tracker

A local LeetCode tracker that is easy to use and built for note-first review.

## Key features
- **Automatic review reminders**: daily reminder
- **Notes-first workflow**: Markdown notes supported
- **Local & safe**: everything stays on your machine with local backups
- **Multi-tag search**: filter by tags to find past insights fast

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
- **High Importance**: 1, 2, 4, 7, 15, 30, 60 days
- **Medium Importance**: 2, 4, 7, 15, 30, 60, 90 days

## Project structure
```
lc_tracker/
  web_app.py
  db.py
  templates/
  static/
  data/
```
