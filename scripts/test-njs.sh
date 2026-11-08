#!/usr/bin/env bash
# Runs nginx-config/*.test.js under the njs interpreter from the gateway source
# image - the only place /etc/nginx/include/s3gateway.js exists.
#
# Defaults to the public upstream image, the same one Dockerfile stage 1 copies
# /etc/nginx/include from, so this runs in CI and on a fork without a registry
# login. Keep the tag in step with the Dockerfile's gateway-source stage.
# Override with NGINX_S3_GATEWAY_IMAGE to test against the built MapColonies image.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${NGINX_S3_GATEWAY_IMAGE:-nginxinc/nginx-s3-gateway:unprivileged-oss-20250825}"

docker run --rm -v "${REPO_ROOT}":/work:ro \
  -e S3_BUCKET_NAME=test-bucket -e S3_SERVER=s3.local -e S3_SERVER_PORT=443 \
  -e S3_SERVER_PROTO=https -e S3_REGION=us-east-1 -e S3_STYLE=virtual \
  -e AWS_SIGS_VERSION=4 -e ALLOW_DIRECTORY_LIST=true \
  -e S3_ACCESS_KEY_ID=test -e S3_SECRET_KEY=test \
  -e S3_LISTING_MAX_KEYS=50 \
  -e PROVIDE_INDEX_PAGE=false -e APPEND_SLASH_FOR_POSSIBLE_DIRECTORY=false \
  --entrypoint njs "${IMAGE}" /work/nginx-config/listing_json.test.js
