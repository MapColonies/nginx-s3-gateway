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
IMAGE="${NGINX_S3_GATEWAY_IMAGE:-nginxinc/nginx-s3-gateway:unprivileged-oss-20261014}"

failed=0
for test_file in "${REPO_ROOT}"/nginx-config/*.test.js; do
  name="$(basename "${test_file}")"
  echo "--- Running ${name} ---"
  docker run --rm -v "${REPO_ROOT}":/work:ro \
    -e S3_BUCKET_NAME=test-bucket -e S3_SERVER=s3.local -e S3_SERVER_PORT=443 \
    -e S3_SERVER_PROTO=https -e S3_REGION=us-east-1 -e S3_STYLE=virtual \
    -e AWS_SIGS_VERSION=4 -e ALLOW_DIRECTORY_LIST=true \
    -e S3_ACCESS_KEY_ID=test -e S3_SECRET_KEY=test \
    -e PROVIDE_INDEX_PAGE=false -e APPEND_SLASH_FOR_POSSIBLE_DIRECTORY=false \
    --entrypoint njs "${IMAGE}" "/work/nginx-config/${name}" || failed=1
done
exit "${failed}"
