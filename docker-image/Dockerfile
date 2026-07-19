# Stage 1: Get the official S3 Gateway source
FROM nginxinc/nginx-s3-gateway:unprivileged-oss-20250825 AS gateway-source

# Stage 2: Build the final image on the NGINX unprivileged OTel base
FROM nginxinc/nginx-unprivileged:1.29.8-alpine3.23-otel

USER root

RUN apk add --no-cache bash

ENV OTEL_HOST=localhost
ENV OTEL_PORT=4317

# Bring over ONLY the version-independent gateway pieces from the official image:
#   - include/    njs scripts (s3gateway.js, awssig*, utils, listing.xsl)
#   - templates/  config templates rendered by the entrypoint's envsubst step
#   - conf.d/     gateway config fragments
#   - docker-entrypoint.d/  gateway env checks + template rendering hooks
# The base image's own nginx binary, /etc/nginx/modules and /etc/nginx/nginx.conf
# are kept as-is, so the otel/js/xslt modules the Helm nginx.conf loads stay in
# place.
COPY --from=gateway-source /etc/nginx/include /etc/nginx/include
COPY --from=gateway-source /etc/nginx/templates /etc/nginx/templates
COPY --from=gateway-source /etc/nginx/conf.d /etc/nginx/conf.d
COPY --from=gateway-source /docker-entrypoint.d /docker-entrypoint.d
COPY --from=gateway-source /docker-entrypoint.sh /docker-entrypoint.sh

# ENV defaults the gateway image carries but the OTel base does not. The gateway
# entrypoint/templates read these; helm or runtime env overrides any of them.
# (CORS_ENABLED / CORS_ALLOW_PRIVATE_NETWORK_ACCESS are omitted: the gateway
# entrypoint always exports them, so a default here would be dead weight.)
ENV DIRECTORY_LISTING_PATH_PREFIX= \
    STRIP_LEADING_DIRECTORY_PATH= \
    PREFIX_LEADING_DIRECTORY_PATH= \
    PROXY_CACHE_MAX_SIZE=10g \
    PROXY_CACHE_INACTIVE=60m \
    PROXY_CACHE_SLICE_SIZE=1m \
    PROXY_CACHE_VALID_OK=1h \
    PROXY_CACHE_VALID_NOTFOUND=1m \
    PROXY_CACHE_VALID_FORBIDDEN=30s

# MapColonies customizations
COPY nginx-config/auth.js /etc/nginx/
COPY nginx-config/status_site.conf /etc/nginx/conf.d/
COPY nginx-config/05-copy-custom-templates.sh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/05-copy-custom-templates.sh /docker-entrypoint.sh

# OpenShift runs containers as an arbitrary UID in the root (0) supplemental
# group. Make the directories the entrypoint and nginx write to group-writable
# so the image works regardless of the assigned UID.
RUN chmod -R g+rwX /etc/nginx /var/cache/nginx /docker-entrypoint.d /docker-entrypoint.sh

# Run unprivileged (uid 101 = nginx in the base image).
USER 101
