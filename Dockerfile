# MapColonies S3 gateway image.
#
# Built directly on the official nginx-s3-gateway image (this is the version
# upgrade). The stock image already ships the gateway njs, the config templates
# and the docker-entrypoint that derives S3_UPSTREAM, DNS_RESOLVERS,
# CORS_ALLOWED_ORIGIN, LIMIT_METHODS_TO and S3_HOST_HEADER, so only the
# MapColonies bits are added on top: a few ENV defaults and the OpenShift
# arbitrary-UID permissions. (The Debian-based stock image already ships bash.)
FROM nginxinc/nginx-s3-gateway:unprivileged-oss-20250825

USER root

# ENV defaults the stock image does not carry. The three leading-dir / listing
# vars must exist (even empty) or envsubst leaves the literal ${VAR} in the
# rendered config and nginx fails to start with "unknown variable".
ENV DIRECTORY_LISTING_PATH_PREFIX= \
    STRIP_LEADING_DIRECTORY_PATH= \
    PREFIX_LEADING_DIRECTORY_PATH= \
    PROXY_CACHE_MAX_SIZE=10g \
    PROXY_CACHE_INACTIVE=60m \
    PROXY_CACHE_SLICE_SIZE=1m \
    PROXY_CACHE_VALID_OK=1h \
    PROXY_CACHE_VALID_NOTFOUND=1m \
    PROXY_CACHE_VALID_FORBIDDEN=30s

# OpenShift runs the container as an arbitrary UID in the root (0) supplemental
# group. Make the dirs the entrypoint and nginx write to group-writable so the
# image works regardless of the assigned UID.
RUN chmod -R g+rwX /etc/nginx /var/cache/nginx /docker-entrypoint.d

# Run unprivileged (uid 101 = nginx in the base image).
USER 101
