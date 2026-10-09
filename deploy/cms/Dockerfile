# PocketBase CMS for news, sites and island (spec 7.3, 7.4). Build context: repository root.
# Version pinned; read the release notes before upgrading (PocketBase is pre-1.0).

FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8 AS fetch
ARG PB_VERSION=0.40.5
# checksums from the release's checksums.txt; the build picks the VPS architecture
ARG PB_SHA256_AMD64=1dbea1b01eb3dfe64953513859d01e759c96650c4e3264fa4eecd54b769382e4
ARG PB_SHA256_ARM64=570baa1c45d2fb92fc0073582b945ca0ece03cbf9837ccabf49a222f99dd02e3
ARG TARGETARCH
RUN case "${TARGETARCH:-amd64}" in \
      amd64) SUM="$PB_SHA256_AMD64" ;; \
      arm64) SUM="$PB_SHA256_ARM64" ;; \
      *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && apk add --no-cache unzip \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH:-amd64}.zip" \
 && echo "${SUM}  /tmp/pb.zip" | sha256sum -c - \
 && unzip -q /tmp/pb.zip pocketbase -d /usr/local/bin

FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8
RUN apk add --no-cache ca-certificates tzdata \
 && addgroup -S -g 10002 pocketbase && adduser -S -D -H -u 10002 -G pocketbase pocketbase \
 && mkdir -p /pb/pb_data && chown 10002:10002 /pb/pb_data
COPY --from=fetch /usr/local/bin/pocketbase /usr/local/bin/pocketbase
COPY cms/pb_migrations /pb/pb_migrations
COPY cms/pb_hooks /pb/pb_hooks
# seed for the first start: sites and island start identical to the static fallback
COPY data/sites.snapshot.json /pb/seed/sites.snapshot.json
COPY deploy/cms/entrypoint.sh /usr/local/bin/entrypoint.sh
USER 10002
WORKDIR /pb
VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --start-interval=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
