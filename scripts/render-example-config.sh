#!/usr/bin/env bash
# Renders helm/config/*.template (resolving Helm {{ }} conditionals) into example/'s
# nginx.conf / default.conf.template / log_format.conf. docker-compose has no Helm
# templating step of its own, so these are committed as pre-rendered static copies -
# this script is how they're produced and kept in sync.
#
# Run after changing helm/config/*.template.
# Run with --check to verify they're already in sync (exits nonzero on drift, for CI).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE_DIR="${REPO_ROOT}/example"
CHECK=false
[[ "${1:-}" == "--check" ]] && CHECK=true

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

helm dependency build "${REPO_ROOT}/helm" >/dev/null

helm template render "${REPO_ROOT}/helm" \
  --set s3.nginxWorkerProcesses=4 \
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

if $CHECK; then
  fail=0
  for f in nginx.conf default.conf.template log_format.conf; do
    if ! diff -u "${EXAMPLE_DIR}/${f}" "${TMP_DIR}/${f}"; then
      echo "DRIFT: example/${f} is out of date with helm/config/*.template - run scripts/render-example-config.sh" >&2
      fail=1
    fi
  done
  exit $fail
else
  cp "${TMP_DIR}/nginx.conf" "${TMP_DIR}/default.conf.template" "${TMP_DIR}/log_format.conf" "${EXAMPLE_DIR}/"
  echo "Regenerated example/{nginx.conf,default.conf.template,log_format.conf}"
fi
