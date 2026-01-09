# Smart LeetCode Tracker

A local LeetCode tracker that starts in seconds and keeps your reviews effortless.

## Key features
- **Automatic review reminders**: daily reminder
- **Notes-first workflow**: Markdown notes supported
- **Local & safe**: everything stays on your machine with local backups
- **Multi-tag search**: filter by tags to find past insights fast

## How to Use
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python web_app.py

# One-click launch on macOS (Automator)
# 1) Open Automator → New Document → Application
# 2) Add “Run Shell Script” action (Shell: /bin/zsh)
# 3) Paste this script and replace with your local path:
#    #!/bin/zsh
#    cd /path/to/lc_tracker
#    source .venv/bin/activate
#    python web_app.py &
#    sleep 1
#    open http://127.0.0.1:5123
# 4) Save as “LeetCode tracker.app”
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
