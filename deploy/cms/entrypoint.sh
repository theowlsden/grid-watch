#!/bin/sh
# Starts PocketBase. All settings come from environment variables (Coolify); nothing secret
# is baked into the image.
#   SITE_ORIGIN            allowed CORS origin (the public site), e.g. https://grid.noirvisuals.studio
#   PB_ENCRYPTION_KEY      32 characters; encrypts stored settings such as S3 backup credentials
#   PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD   optional: create or update the admin on start
#   PB_ADMIN_IPS           optional: space-separated IPs/subnets allowed to use the admin API
set -eu

DIR=/pb/pb_data
ARGS="--dir=$DIR --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --hooksWatch=false"

if [ -z "${SITE_ORIGIN:-}" ]; then
  echo "SITE_ORIGIN is not set; refusing to start with CORS open to every origin" >&2
  exit 1
fi
if [ -n "${PB_ENCRYPTION_KEY:-}" ]; then
  ARGS="$ARGS --encryptionEnv=PB_ENCRYPTION_KEY"
fi

# Apply committed migrations before serving (also done by automigrate, kept explicit).
# shellcheck disable=SC2086
pocketbase migrate up $ARGS

if [ -n "${PB_SUPERUSER_EMAIL:-}" ] && [ -n "${PB_SUPERUSER_PASSWORD:-}" ]; then
  # shellcheck disable=SC2086
  pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" $ARGS >/dev/null
  echo "superuser ensured for $PB_SUPERUSER_EMAIL"
fi
if [ -n "${PB_ADMIN_IPS:-}" ]; then
  # shellcheck disable=SC2086
  pocketbase superuser ips $PB_ADMIN_IPS $ARGS >/dev/null
  echo "admin API restricted to: $PB_ADMIN_IPS"
fi

# shellcheck disable=SC2086
exec pocketbase serve --http=0.0.0.0:8090 --origins="$SITE_ORIGIN" $ARGS
