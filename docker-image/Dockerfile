# Stage 1: Get the official S3 Gateway source
FROM nginxinc/nginx-s3-gateway:unprivileged-oss-20250825 AS gateway-source

# Stage 2: Build the final image using the NGINX unprivileged OTel base
FROM nginxinc/nginx-unprivileged:1.28.0-alpine3.21-otel

USER root

RUN apk add --no-cache bash

ENV OTEL_HOST=localhost
ENV OTEL_PORT=4317

# Copy configurations and scripts from the official gateway image
COPY --from=gateway-source /etc/nginx /etc/nginx
COPY --from=gateway-source /docker-entrypoint.d /docker-entrypoint.d

COPY nginx-config/auth.js /etc/nginx/
COPY nginx-config/status_site.conf /etc/nginx/conf.d/
COPY nginx-config/05-copy-custom-templates.sh /docker-entrypoint.d/
COPY nginx-config/06-set-computed-vars.envsh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/05-copy-custom-templates.sh
RUN chmod +x /docker-entrypoint.d/06-set-computed-vars.envsh

# Ensure the unprivileged nginx user owns the required directories
# RUN chown -R nginx:nginx /etc/nginx /var/cache/nginx /var/run /docker-entrypoint.d

# Remove upstream templates so the entrypoint skips template processing
# RUN rm -rf /etc/nginx/templates

# OpenShift runs as a random UID with supplemental GID 0,                                             
# so make dirs group-writable with root group        
# RUN chown -R nginx:nginx /etc/nginx /var/cache/nginx \
#     /var/run /docker-entrypoint.d && \                   
#     chmod -R g+rwX /etc/nginx /var/cache/nginx \
#     /var/run /docker-entrypoint.d

# Switch back to the unprivileged user
# USER nginx
