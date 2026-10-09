#!/bin/sh
# Starts PocketBase. All settings come from environment variables (Coolify); nothing secret
# is baked into the image.
#   SITE_ORIGIN            allowed CORS origin (the public site), e.g. https://grid.noirvisuals.studio
#   PB_ENCRYPTION_KEY      exactly 32 characters; encrypts stored settings such as S3 credentials
#   PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD   optional: create or update the admin on start
#   PB_ADMIN_IPS           optional: space-separated IPs/subnets allowed to use the admin API
#   PB_BOT_EMAIL / PB_BOT_PASSWORD               optional: the Telegram bot's account (pb_hooks)
#
# A setting the CMS cannot run without is reported clearly and the container stays up but
# unhealthy (no crash loop), so Coolify shows "unhealthy" and the log says what to fix.
# Optional steps that fail are logged as warnings and the CMS starts anyway.
set -u

DIR=/pb/pb_data
log() { echo "[grid-watch cms] $*"; }

fatal() {
  log "CMS NOT STARTED: $*"
  log "Fix the environment variable in Coolify and redeploy. This message repeats every 5 minutes."
  while true; do
    sleep 300
    log "CMS NOT STARTED: $*"
  done
}

# ---------- check the settings ----------
SITE_ORIGIN="${SITE_ORIGIN:-}"
SITE_ORIGIN="${SITE_ORIGIN%/}" # tolerate a trailing slash
if [ -z "$SITE_ORIGIN" ]; then
  fatal "SITE_ORIGIN is empty. Set it to the site's address, e.g. https://grid.noirvisuals.studio (CORS stays closed otherwise)."
fi
case "$SITE_ORIGIN" in
  http://*/* | https://*/*) fatal "SITE_ORIGIN must be only scheme and host, without a path: got '$SITE_ORIGIN'." ;;
  http://* | https://*) ;;
  *) fatal "SITE_ORIGIN must start with https:// (got '$SITE_ORIGIN')." ;;
esac

ARGS="--dir=$DIR --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --hooksWatch=false"
if [ -n "${PB_ENCRYPTION_KEY:-}" ]; then
  if [ "${#PB_ENCRYPTION_KEY}" -ne 32 ]; then
    fatal "PB_ENCRYPTION_KEY must be exactly 32 characters (it has ${#PB_ENCRYPTION_KEY}). Generate one with: openssl rand -hex 16"
  fi
  ARGS="$ARGS --encryptionEnv=PB_ENCRYPTION_KEY"
else
  log "warning: PB_ENCRYPTION_KEY is not set; stored settings (such as backup credentials) are not encrypted"
fi

# ---------- prepare ----------
# shellcheck disable=SC2086
if ! pocketbase migrate up $ARGS; then
  fatal "applying the database migrations failed (see the lines above)."
fi

if [ -n "${PB_SUPERUSER_EMAIL:-}" ] || [ -n "${PB_SUPERUSER_PASSWORD:-}" ]; then
  if [ -z "${PB_SUPERUSER_EMAIL:-}" ] || [ -z "${PB_SUPERUSER_PASSWORD:-}" ]; then
    log "warning: set both PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD; superuser not changed"
  elif [ "${#PB_SUPERUSER_PASSWORD}" -lt 10 ]; then
    log "warning: PB_SUPERUSER_PASSWORD is shorter than 10 characters; superuser not changed (use a long unique password)"
  else
    # shellcheck disable=SC2086
    if pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" $ARGS >/tmp/su.log 2>&1; then
      log "superuser ensured for $PB_SUPERUSER_EMAIL"
    else
      log "warning: superuser not changed: $(tail -n 1 /tmp/su.log)"
    fi
    rm -f /tmp/su.log
  fi
fi

if [ -n "${PB_ADMIN_IPS:-}" ]; then
  # shellcheck disable=SC2086
  if pocketbase superuser ips $PB_ADMIN_IPS $ARGS >/tmp/ips.log 2>&1; then
    log "admin API restricted to: $PB_ADMIN_IPS"
  else
    log "warning: PB_ADMIN_IPS not applied: $(tail -n 1 /tmp/ips.log)"
  fi
  rm -f /tmp/ips.log
fi

log "starting PocketBase on :8090, CORS origin $SITE_ORIGIN"
# shellcheck disable=SC2086
exec pocketbase serve --http=0.0.0.0:8090 --origins="$SITE_ORIGIN" $ARGS
