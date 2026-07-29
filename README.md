# nginx-s3-gateway (MapColonies)

An authenticating, caching gateway for read-only (`GET`/`HEAD`) requests to the S3 API,
built on the [MapColonies nginx base image](https://github.com/MapColonies/nginx) so it
inherits that image's OpenTelemetry runtime and shared OPA/JWT authentication instead of
re-implementing them.

## Why?

* Provide an authentication gateway using an alternative auth system to S3 (OPA/JWT).
* Cache frequently accessed S3 objects for lower latency and protection against S3 outages.
* Let internal services that can't authenticate against the S3 API reach S3 objects.
* Protect an S3 bucket from arbitrary public access and traversal.

## Image

The image is a 2-stage build:

1. **Stage 1** pulls the official `nginxinc/nginx-s3-gateway` image for the
   version-independent gateway pieces (njs, config templates, docker-entrypoint).
2. **Final stage** builds `FROM ${NGINX_BASE_IMAGE}` (the MapColonies nginx base) and
   copies those pieces in, adding the gateway auth extension (`nginx-config/s3_auth.js`)
   and the OpenShift arbitrary-UID permissions.

`NGINX_BASE_IMAGE` has **no default** — a bare `docker build` fails fast so the registry
host is never committed. Build with:

```bash
docker build \
  --build-arg NGINX_BASE_IMAGE=<registry>/common/nginx:<tag> \
  -t <prefix>/nginx-s3-gateway .
```

CI (`.github/workflows/build_and_push.yaml`) supplies the base image and tag from the
`ACR_URL` secret on release tags.

## Features

* **OpenTelemetry** — `ngx_otel_module` tracing, configured via the `opentelemetry` values
  block (`serviceName`, `exporterHost`/`exporterPort`, `samplerMethod`, `ratio`).
* **OPA auth** — combined auth flow (`/_combined_auth` + `/opa` locations, `auth_request`),
  re-using the base image's `opaAuth`/`jwtPayloadSub` njs. Gated by `authorization.enabled`.
* **Caching** — proxy cache tunables via the `PROXY_CACHE_*` env / `s3.cache*` values.

## Deploy (Helm)

```bash
cd helm
helm install proxy .
```

Configuration lives in `helm/values.yaml`. Key blocks: `authorization`, `opentelemetry`,
`image`, `s3`, `resources`, `route`/`ingress`.
