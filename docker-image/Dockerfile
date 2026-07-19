# Stage 1: Get the official S3 Gateway source (config, njs scripts, templates,
# entrypoint hooks). NOTE: this image ships nginx 1.29.0, so we must NOT reuse
# its compiled modules (/etc/nginx/modules) or its nginx binary.
FROM nginxinc/nginx-s3-gateway:unprivileged-oss-20250825 AS gateway-source

# Stage 2: Build the final image on the NGINX unprivileged OTel base. This
# provides the nginx 1.28.0 binary together with matching 1.28.0 modules
# (otel, njs/js, xslt) that the Helm nginx.conf loads.
FROM nginxinc/nginx-unprivileged:1.28.0-alpine3.21-otel

USER root

RUN apk add --no-cache bash

ENV OTEL_HOST=localhost
ENV OTEL_PORT=4317

# Bring over ONLY the version-independent gateway pieces from the official image:
#   - include/    njs scripts (s3gateway.js, awssig*, utils, listing.xsl)
#   - templates/  config templates rendered by the entrypoint's envsubst step
#   - conf.d/     gateway config fragments
#   - docker-entrypoint.d/  gateway env checks + template rendering hooks
# We deliberately skip /etc/nginx/modules and /etc/nginx/nginx.conf so the OTel
# base's own nginx 1.28.0 binary and its ABI-matched 1.28.0 modules stay in
# place (the gateway image's 1.29.0 .so files would fail to load here).
COPY --from=gateway-source /etc/nginx/include /etc/nginx/include
COPY --from=gateway-source /etc/nginx/templates /etc/nginx/templates
COPY --from=gateway-source /etc/nginx/conf.d /etc/nginx/conf.d
COPY --from=gateway-source /docker-entrypoint.d /docker-entrypoint.d

# MapColonies customizations
COPY nginx-config/auth.js /etc/nginx/
COPY nginx-config/status_site.conf /etc/nginx/conf.d/
COPY nginx-config/05-copy-custom-templates.sh /docker-entrypoint.d/
COPY nginx-config/06-set-computed-vars.envsh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/05-copy-custom-templates.sh \
             /docker-entrypoint.d/06-set-computed-vars.envsh

# OpenShift runs containers as an arbitrary UID in the root (0) supplemental
# group. Make the directories the entrypoint and nginx write to group-writable
# so the image works regardless of the assigned UID.
RUN chmod -R g+rwX /etc/nginx /var/cache/nginx /docker-entrypoint.d

# Run unprivileged (uid 101 = nginx in the base image).
USER 101
