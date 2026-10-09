#!/bin/sh
# Run once at start (so a fresh deploy has a heartbeat), then on the schedule in crontab.
python pipeline/run_daily.py || echo "first run failed; supercronic keeps the schedule"
exec supercronic -passthrough-logs deploy/pipeline/crontab
