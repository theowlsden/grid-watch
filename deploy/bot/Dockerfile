# Telegram news bot (spec 7.3, Phase 1b): Python standard library only, long polling, no public
# route. Talks to the CMS over the internal Docker network. Build context: repository root.
FROM python:3.12-slim@sha256:05cda9777409a9c3ffddd94a4c476b79f0769a0b4857f0c7ed9226b6800b0d6f
# same uid as the pipeline: both write the shared control volume (manual runs)
RUN groupadd -g 10001 gridwatch && useradd -u 10001 -g gridwatch -M -s /usr/sbin/nologin gridwatch \
 && mkdir -p /var/lib/gridwatch-control && chown 10001:10001 /var/lib/gridwatch-control
WORKDIR /app
COPY bot/gridwatch_bot gridwatch_bot
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 TZ=America/Curacao \
    CMS_INTERNAL_URL=http://cms:8090 GRIDWATCH_CONTROL_DIR=/var/lib/gridwatch-control
USER 10001
VOLUME /var/lib/gridwatch-control
# healthy while the polling loop is alive (it beats at least once a minute)
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --start-interval=5s --retries=3 \
  CMD python -c "import os,time,sys; sys.exit(0 if time.time()-float(open('/tmp/bot-heartbeat').read())<180 else 1)" || exit 1
CMD ["python", "-m", "gridwatch_bot"]
