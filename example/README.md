# Example deployment with Docker Compose

The `example` folder holds a Docker Compose stack that runs the S3 gateway image in front
of a local [LocalStack](https://www.localstack.cloud/) S3 emulator — a quick way to try the
gateway locally. (This previously used MinIO, but MinIO's Docker Hub images now require a
paid login to pull.)

### Prerequisites

* Docker and Docker Compose installed.
* Access to the MapColonies nginx base image. Set `NGINX_BASE_IMAGE` in `.env` to the real
  `<registry>/common/nginx:<tag>` — the Dockerfile has no default and the build fails
  without it. That base image must have the `njs`, `xslt`, and `otel` nginx modules
  available for `load_module` (see `nginx.conf` below) - without them nginx won't start.

### Deployment steps

From the `example` folder:

```bash
docker-compose up -d --build
```

The stack contains 3 containers:

1. **nginx-s3-gateway** — built from `../Dockerfile`, configured via env in `.env`.
2. **minio** — local S3 emulator (LocalStack, despite the service name kept for compatibility
   with `.env`).
3. **createBucketAndObjectsOnS3** — one-shot job that creates the bucket and seeds the
   objects from `minioData/` (optional).

The gateway is exposed on `http://localhost:8080`. Fetch a seeded object, e.g.:

```bash
curl http://localhost:8080/example.txt
```

Adjust bucket name, credentials and cache settings in `.env`.

### Keeping `nginx.conf`, `default.conf.template`, `log_format.conf` in sync

In the real k8s Deployment, Helm renders `helm/config/nginx.conf.template`,
`default.conf.template`, and `log_format.conf` (resolving their `{{ }}` conditionals) and
mounts the result over the vendor's own copies - that's how the gateway's customizations
(OPA/readiness routes, njs/xslt/otel module loading, the JSON directory listing) actually
take effect. `docker-compose` has no Helm templating step, so this folder's `nginx.conf`,
`default.conf.template`, and `log_format.conf` are committed as pre-rendered, static
equivalents (Helm conditionals resolved for a plain default setup: OPA disabled, otel
tracing off but the module loaded). If you change `helm/config/*.template`, re-render these
to match, e.g.:

```bash
helm template test ../helm --set s3.nginxWorkerProcesses=4 \
  --show-only templates/custom-configmap.yaml
```

and copy the `default.conf.template` / `nginx.conf.template` / `log_format.conf` entries
out of that output into this folder (resolving any remaining `{{ }}` by hand if your
`--set` values don't cover every conditional). Note: `helm template` on this chart needs
the private `mclabels` dependency (`helm/Chart.yaml`) resolved first (`helm dependency
build`, or stub it out locally) - it isn't needed for the two files this example actually
uses, but `helm template` won't render anything until the dependency check passes.
