# nginx-s3-gateway Openshift Compatible Image

Configuring `nginxinc/nginx-s3-gateway` image to act as an authenticating and caching gateway for read-only requests (GET/HEAD) to the S3 API.

## Application Architecture Overview

![Application Architecture Overview](Nginx-S3.png)

## Why?

* Providing an authentication gateway using an alternative authentication system to S3
* Caching frequently accessed S3 objects for lower latency delivery and protection against S3 outages
* For internal/micro services that can't authenticate against the S3 API (e.g. don't have libraries available) the gateway can provide a means to accessing S3 objects without authentication
* Compressing objects (gzip, brotli) from gateway to end user
* Protecting S3 bucket from arbitrary public access and traversal
* Rate limiting S3 objects
* Protecting a S3 bucket with a WAF
* Serving static assets from a S3 bucket alongside a dynamic application endpoints all in a single RESTful directory structure

# Build

The image is assembled in a multi-stage `docker-image/Dockerfile`:

1. **Gateway source stage** — pulls the official `nginxinc/nginx-s3-gateway`
   image (`unprivileged-oss-20250825`) purely as a source of the S3 gateway
   configuration: the njs scripts (`include/`), config templates (`templates/`)
   and the entrypoint hooks (`docker-entrypoint.d/`).

2. **Final image** — built on `nginxinc/nginx-unprivileged:1.28.0-alpine3.21-otel`,
   which provides the nginx 1.28.0 binary together with matching OpenTelemetry,
   njs and xslt modules. The gateway configuration from stage 1 is copied in
   **without** its compiled modules or `nginx.conf`, so the OTel base's own
   ABI-matched 1.28.0 modules are used. (The gateway image ships nginx 1.29.0,
   whose `.so` modules are not binary-compatible with the 1.28.0 runtime.)

3. **MapColonies customizations** — `auth.js` (OPA/JWT authorization),
   `status_site.conf` (stub-status endpoint) and two entrypoint hooks
   (`05-copy-custom-templates.sh`, `06-set-computed-vars.envsh`) are layered on
   top. Runtime directories are made group-writable so the image runs under
   OpenShift's arbitrary UID.

> **Note:** Lua/Redis response caching (OpenResty `srcache` + `lua-resty-redis`)
> is not compiled into this image yet — re-adding it is tracked as a follow-up.

## Building the Docker Image

To build the Docker image:

```bash
cd docker-image
docker image build -t <prefix>/nginx-s3-gateway:v1.0.0 .
```

```bash
docker image push <prefix>/nginx-s3-gateway:v1.0.0
```

## Running the Container

To run a container:

```bash
docker container run -d --rm --name nginx-s3-gateway \
  --network host \
  -e S3_BUCKET_NAME=<bucket> \
  -e S3_SERVER=127.0.0.1 \
  -e S3_SERVER_PORT=9000 \
  -e S3_SERVER_PROTO=http \
  -e S3_REGION=us-east-1 \
  -e S3_STYLE=path \
  -e ALLOW_DIRECTORY_LIST=true \
  -e AWS_SIGS_VERSION=4 \
  -e AWS_ACCESS_KEY_ID=<user> \
  -e AWS_SECRET_ACCESS_KEY=<password> \
  -e CORS_ENABLED=true \
  -e NGINX_WORKER_PROCESSES=4 \
  -e PROXY_CACHE_MAX_SIZE=10g \
  -e PROXY_CACHE_INACTIVE=60m \
  -e PROXY_CACHE_VALID_OK=1h \
  -e PROXY_CACHE_VALID_NOTFOUND=1m \
  -e PROXY_CACHE_VALID_FORBIDDEN=30s \
  <prefix>/nginx-s3-gateway
```

This command will expose NGINX, providing access to the S3 gateway.

## Customization

Feel free to customize the NGINX configuration files (`nginx.conf` and `default.conf`) and environment variables to suit your specific requirements.

## Testing

The image is built and smoke-tested locally (module load / njs) before release; the Helm chart is validated with `helm template`.

## Install

```bash
  cd helm
  helm install proxy .
```

## Future Considerations

* Re-add Lua/Redis response caching (OpenResty `srcache` + `lua-resty-redis`) built against the 1.28.0 runtime.
* When Redis is (re)introduced: requests fall back directly to S3 when Redis is down or slow.