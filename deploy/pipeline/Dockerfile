# Daily pipeline (spec 7.6): runs on a schedule with supercronic and writes to the shared
# data volume that the web container serves under /data. Build context: repository root.

FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8 AS fetch
ARG SUPERCRONIC_VERSION=v0.2.49
# sha256 of the release binaries (verified against the SHA-1 sums in the release notes)
ARG SUPERCRONIC_SHA256_AMD64=a53ae236602c7338aba3fbaff40bda6300eae3b9fedb8261eb06cfe3724430c1
ARG SUPERCRONIC_SHA256_ARM64=02aa0cb229ba09050cba6638059dadb9eedc2276632ea43d6a57a2f8c1629dd5
ARG TARGETARCH
RUN case "${TARGETARCH:-amd64}" in \
      amd64) SUM="$SUPERCRONIC_SHA256_AMD64" ;; \
      arm64) SUM="$SUPERCRONIC_SHA256_ARM64" ;; \
      *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && wget -q -O /supercronic "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH:-amd64}" \
 && echo "${SUM}  /supercronic" | sha256sum -c - \
 && chmod 0755 /supercronic

FROM python:3.12-slim@sha256:05cda9777409a9c3ffddd94a4c476b79f0769a0b4857f0c7ed9226b6800b0d6f
COPY --from=fetch /supercronic /usr/local/bin/supercronic
RUN groupadd -g 10001 gridwatch && useradd -u 10001 -g gridwatch -M -s /usr/sbin/nologin gridwatch \
 && mkdir -p /var/lib/gridwatch/data && chown -R 10001:10001 /var/lib/gridwatch

WORKDIR /app
COPY pipeline/requirements.txt pipeline/
RUN pip install --no-cache-dir -r pipeline/requirements.txt
COPY pipeline pipeline
COPY schemas schemas
COPY data data
COPY deploy/pipeline/crontab deploy/pipeline/start.sh deploy/pipeline/

ENV GRIDWATCH_DATA_DIR=/var/lib/gridwatch \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=America/Curacao
USER 10001
VOLUME /var/lib/gridwatch
# healthy when the last run succeeded within 36 hours (spec 7.2)
HEALTHCHECK --interval=5m --timeout=10s --start-period=2m --retries=2 \
  CMD python pipeline/healthcheck.py || exit 1
CMD ["sh", "deploy/pipeline/start.sh"]
