FROM nginxinc/nginx-s3-gateway:unprivileged-oss-20250825

USER root

# # TODO: enable in otel version ENV OTEL_HOST=localhost
# # TODO: enable in otel version ENV OTEL_PORT=4317

COPY nginx-config/auth.js /etc/nginx/
COPY nginx-config/status_site.conf /etc/nginx/conf.d/
