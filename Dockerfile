# MapColonies S3 gateway image — built on the MapColonies nginx base.
ARG NGINX_BASE_IMAGE

# Stage 1: the official S3 Gateway source (version-independent gateway pieces).
FROM nginxinc/nginx-s3-gateway:unprivileged-oss-20250825 AS gateway-source

# Stage 2: build the final image on the MapColonies nginx base.
FROM ${NGINX_BASE_IMAGE}

USER root

# The MapColonies nginx base is Alpine; the gateway entrypoint needs bash.
RUN apk add --no-cache bash

COPY --from=gateway-source /etc/nginx/include /etc/nginx/include
COPY --from=gateway-source /etc/nginx/templates /etc/nginx/templates
COPY --from=gateway-source /etc/nginx/conf.d /etc/nginx/conf.d
COPY --from=gateway-source /docker-entrypoint.d /docker-entrypoint.d

# Use the gateway's own entrypoint
COPY --from=gateway-source /docker-entrypoint.sh /docker-entrypoint.sh

# ENV defaults the gateway image carries but the base does not
ENV DIRECTORY_LISTING_PATH_PREFIX= \
    STRIP_LEADING_DIRECTORY_PATH= \
    PREFIX_LEADING_DIRECTORY_PATH= \
    PROXY_CACHE_MAX_SIZE=10g \
    PROXY_CACHE_INACTIVE=60m \
    PROXY_CACHE_SLICE_SIZE=1m \
    PROXY_CACHE_VALID_OK=1h \
    PROXY_CACHE_VALID_NOTFOUND=1m \
    PROXY_CACHE_VALID_FORBIDDEN=30s

# Gateway-specific auth extension
COPY nginx-config/s3_auth.js /etc/nginx/

RUN chmod +x /docker-entrypoint.sh && \
    chmod -R g+rwX /etc/nginx /var/cache/nginx /docker-entrypoint.d /docker-entrypoint.sh

# Run unprivileged (uid 101 = nginx in the base image).
USER 101
