# Example deployment with Docker Compose

The `example` folder holds a Docker Compose stack that runs the S3 gateway image in front
of a local [MinIO](https://min.io/) S3 server — a quick way to try the gateway locally.

### Prerequisites

* Docker and Docker Compose installed.
* Access to the MapColonies nginx base image. Set `NGINX_BASE_IMAGE` in `.env` to the real
  `<registry>/common/nginx:<tag>` — the Dockerfile has no default and the build fails
  without it.

### Deployment steps

From the `example` folder:

```bash
docker-compose up -d --build
```

The stack contains 3 containers:

1. **nginx-s3-gateway** — built from `../Dockerfile`, configured via env in `.env`.
2. **minio** — local S3 server.
3. **createBucketAndObjectsOnS3** — one-shot job that creates the bucket and seeds the
   objects from `minioData/` (optional).

The gateway is exposed on `http://localhost:8080`; the MinIO console on
`http://localhost:9001`. Fetch a seeded object, e.g.:

```bash
curl http://localhost:8080/example.txt
```

Adjust bucket name, credentials and cache settings in `.env`.
