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
../scripts/render-example-config.sh   # one-time, re-run after helm/config changes
docker-compose up -d --build
```

The stack contains 3 containers:

1. **nginx-s3-gateway** — built from `../Dockerfile`, configured via env in `.env`.
2. **s3** — local S3 emulator (LocalStack).
3. **createBucketAndObjectsOnS3** — one-shot job that creates the bucket and seeds the
   objects from `minioData/` (optional).

The gateway is exposed on `http://localhost:8080`. Fetch a seeded object, e.g.:

```bash
curl http://localhost:8080/example.txt
```

Adjust bucket name, credentials and cache settings in `.env`.

### Rendering the nginx config files

In the real k8s Deployment, Helm renders `helm/config/nginx.conf.template`,
`default.conf.template`, and `log_format.conf` (resolving their `{{ }}` conditionals) and
mounts the result over the vendor's own copies. `docker-compose` has no Helm templating
step, so you must render the config files locally before starting the stack:

```bash
../scripts/render-example-config.sh
```

This produces `nginx.conf`, `default.conf.template`, and `log_format.conf` in this folder
(gitignored — they are not committed). The script needs Helm and the private `mclabels`
chart dependency (`helm/Chart.yaml`); it runs `helm dependency build` automatically.

Re-run the script whenever you change `helm/config/*.template`.
