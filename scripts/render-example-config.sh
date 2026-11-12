#!/usr/bin/env bash
# Renders helm/config/*.template (resolving Helm {{ }} conditionals) into example/'s
# nginx.conf / default.conf.template / log_format.conf. docker-compose has no Helm
# templating step of its own, so the output is gitignored and rendered on demand.
#
# Run before starting the example, and after changing helm/config/*.template.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE_DIR="${REPO_ROOT}/example"
if [[ $# -gt 0 ]]; then
  echo "Usage: $0" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

helm dependency build "${REPO_ROOT}/helm" >/dev/null

# image.tag is pinned to a placeholder instead of defaulting to v$Chart.AppVersion.
# log_format.conf embeds it as service.version, so without this every release
# bump re-renders example/ and the --check below fails on a version change that
# has nothing to do with the nginx config this script exists to keep in sync.
helm template render "${REPO_ROOT}/helm" \
  --set s3.nginxWorkerProcesses=4 \
  --set image.tag=v0.0.0-example \
  --show-only templates/custom-configmap.yaml \
  > "${TMP_DIR}/configmap.yaml"

python3 - "${TMP_DIR}/configmap.yaml" "${TMP_DIR}" <<'PYEOF'
import sys, yaml
docs = list(yaml.safe_load_all(open(sys.argv[1])))
doc = [d for d in docs if d][0]
data = doc["data"]
for name in ("default.conf.template", "nginx.conf.template", "log_format.conf"):
    with open(f"{sys.argv[2]}/{name}", "w") as f:
        f.write(data[name])
PYEOF

mv "${TMP_DIR}/nginx.conf.template" "${TMP_DIR}/nginx.conf"

cp "${TMP_DIR}/nginx.conf" "${TMP_DIR}/default.conf.template" "${TMP_DIR}/log_format.conf" "${EXAMPLE_DIR}/"
echo "Regenerated example/{nginx.conf,default.conf.template,log_format.conf}"
