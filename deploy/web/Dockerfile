# Static front end (spec 7.6): build the export, serve it with Caddy and security headers.
# Build context: repository root.

# 1. Published events: built from data/events/events.yaml; only sourced events (decision 12.15)
FROM python:3.12-slim@sha256:05cda9777409a9c3ffddd94a4c476b79f0769a0b4857f0c7ed9226b6800b0d6f AS data
WORKDIR /repo
COPY pipeline/requirements.txt pipeline/
RUN pip install --no-cache-dir -r pipeline/requirements.txt
COPY pipeline pipeline
COPY schemas schemas
COPY data data
COPY web/public/data web/public/data
RUN python pipeline/tools/build_events.py && python pipeline/validate.py

# 2. Static export
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY data /repo/data
# the methodology page reads the stress rules at build time
COPY pipeline/stress_config.yaml /repo/pipeline/stress_config.yaml
COPY web ./
COPY --from=data /repo/web/public/data/events.json public/data/events.json
RUN npm run build && node scripts/csp.mjs out > /repo/csp.caddy

# 3. Serve
FROM caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f
# Unprivileged user; the same uid owns the shared data volume in every image.
# The binary ships with a file capability for ports below 1024; we listen on 8080, and the
# container drops all capabilities, so remove it or the kernel refuses to run the binary.
RUN apk add --no-cache libcap && setcap -r /usr/bin/caddy && apk del libcap \
 && addgroup -S -g 10001 gridwatch && adduser -S -D -H -u 10001 -G gridwatch gridwatch \
 && mkdir -p /var/lib/gridwatch/data && chown -R 10001:10001 /var/lib/gridwatch
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/csp.caddy /etc/caddy/csp.caddy
COPY --from=build /repo/web/out /srv
ENV XDG_CONFIG_HOME=/tmp XDG_DATA_HOME=/tmp
USER 10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
