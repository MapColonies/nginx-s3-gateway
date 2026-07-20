# MapColonies S3 gateway image — built on the MapColonies nginx base.
#
# The base (MapColonies/nginx) already provides the OTel-enabled nginx runtime,
# the OTEL_HOST/OTEL_PORT env, the status_site.conf stub-status endpoint and the
# shared OPA/JWT auth core (/etc/nginx/auth.js -> opaAuth, jwtPayloadSub).
# Reusing it keeps those in one place instead of re-authoring them here. Only the
# version-independent gateway pieces are layered on top from the official image.
#
# The base must be an nginx 1.29.x-otel build published by MapColonies/nginx
# (published there as <registry>/common/nginx:v<release>, the release carrying
# nginx 1.29.8). The full reference — including the private registry host — is
# supplied at build time so it is never committed here: CI passes
# --build-arg NGINX_BASE_IMAGE=${ACR_URL}/common/nginx:<tag> (see
# .github/workflows/build_and_push.yaml); local builds pass their own replica.
# There is intentionally no default, so a bare `docker build` fails fast rather
# than silently building on the wrong base.
ARG NGINX_BASE_IMAGE

# Stage 1: the official S3 Gateway source (version-independent gateway pieces).
FROM nginxinc/nginx-s3-gateway:unprivileged-oss-20250825 AS gateway-source

# Stage 2: build the final image on the MapColonies nginx base.
FROM ${NGINX_BASE_IMAGE}

USER root

# The MapColonies nginx base is Alpine; the gateway entrypoint needs bash.
RUN apk add --no-cache bash

# Bring over ONLY the version-independent gateway pieces from the official image:
#   - include/    njs scripts (s3gateway.js, awssig*, utils, listing.xsl)
#   - templates/  config templates rendered by the entrypoint's envsubst step
#   - conf.d/     gateway config fragments (merges over the base's conf.d,
#                 leaving the inherited status_site.conf in place)
#   - docker-entrypoint.d/  gateway env checks + template rendering hooks
# The base image's own nginx binary, /etc/nginx/modules and /etc/nginx/nginx.conf
# stay in place, so the otel/js/xslt modules the Helm nginx.conf loads remain
# available and the inherited /etc/nginx/auth.js (shared OPA core) is untouched.
COPY --from=gateway-source /etc/nginx/include /etc/nginx/include
COPY --from=gateway-source /etc/nginx/templates /etc/nginx/templates
COPY --from=gateway-source /etc/nginx/conf.d /etc/nginx/conf.d
COPY --from=gateway-source /docker-entrypoint.d /docker-entrypoint.d

# Use the gateway's own entrypoint (replacing the base image's simpler one). It
# derives the variables the config templates depend on before running
# /docker-entrypoint.d/*: S3_UPSTREAM and DNS_RESOLVERS, CORS_ALLOWED_ORIGIN /
# CORS_ALLOW_PRIVATE_NETWORK_ACCESS, LIMIT_METHODS_TO and S3_HOST_HEADER. Without
# it these render empty and nginx fails to start.
COPY --from=gateway-source /docker-entrypoint.sh /docker-entrypoint.sh

# ENV defaults the gateway image carries but the base does not. The three
# leading-dir / listing vars must exist (even empty) or envsubst leaves the
# literal ${VAR} in the rendered config and nginx fails to start.
ENV DIRECTORY_LISTING_PATH_PREFIX= \
    STRIP_LEADING_DIRECTORY_PATH= \
    PREFIX_LEADING_DIRECTORY_PATH= \
    PROXY_CACHE_MAX_SIZE=10g \
    PROXY_CACHE_INACTIVE=60m \
    PROXY_CACHE_SLICE_SIZE=1m \
    PROXY_CACHE_VALID_OK=1h \
    PROXY_CACHE_VALID_NOTFOUND=1m \
    PROXY_CACHE_VALID_FORBIDDEN=30s

# Gateway-specific auth extension. auth.js and status_site.conf are inherited
# from the base image; only combinedAuth (which calls /aws/credentials/retrieve,
# a location that only exists in the gateway config) is added here as a thin
# module that re-exports the inherited base members.
COPY nginx-config/s3_auth.js /etc/nginx/

RUN chmod +x /docker-entrypoint.sh

# OpenShift runs the container as an arbitrary UID in the root (0) supplemental
# group. Make the dirs the entrypoint and nginx write to group-writable so the
# image works regardless of the assigned UID.
RUN chmod -R g+rwX /etc/nginx /var/cache/nginx /docker-entrypoint.d /docker-entrypoint.sh

# Run unprivileged (uid 101 = nginx in the base image).
USER 101
