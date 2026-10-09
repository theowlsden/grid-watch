#!/bin/sh
# On start, run once unless a forecast from the last 6 hours exists (a redeploy should not add
# issuances to the record), then follow the schedule in crontab.
python pipeline/run_daily.py --trigger scheduled --skip-if-fresh 6 || echo "start-up run failed; supercronic keeps the schedule"
exec supercronic -passthrough-logs deploy/pipeline/crontab
