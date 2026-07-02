#!/bin/sh
# Copy custom gateway templates into place before envsubst runs.
# Mounting files via subPath into /etc/nginx/templates/gateway/ shadows other
# files in that directory on OpenShift. Instead, custom templates are mounted
# at /etc/nginx/custom-templates/ and copied here.
set -e
CUSTOM_DIR=/etc/nginx/custom-templates
GATEWAY_TMPL_DIR=/etc/nginx/templates/gateway

if [ -d "$CUSTOM_DIR" ]; then
    for f in "$CUSTOM_DIR"/*.template; do
        [ -f "$f" ] || continue
        cp "$f" "$GATEWAY_TMPL_DIR/$(basename "$f")"
    done
fi
