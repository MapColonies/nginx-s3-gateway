package envoy.authz

import input.attributes.request.http as http_request
import input.parsed_query as query_params

default allow = false

jwt_token = token {
  token := io.jwt.decode(query_params.token[0])
}

{{- if .Values.authentication.opa.customHeaderName }}
jwt_token = token {
  token := io.jwt.decode(http_request.headers[{{ .Values.authentication.opa.customHeaderName | lower | quote }}])
}
{{- end }}

payload = payload {
  [_, payload, _] := jwt_token
}

user_has_resource_access[payload] {
  lower(payload.d[_]) = {{ .Values.authentication.opa.domain | lower | quote }}
}

valid_origin[payload] {
  payload.ao[_] = http_request.headers.origin
}

valid_origin[payload] {
  payload.ao == http_request.headers.origin
}

valid_origin[payload] {
  not payload.ao
}

# allow authenticated access
allow {
  valid_origin[payload]
  user_has_resource_access[payload]
}

# allow cors preflight WITHOUT AUTHENTICATION
allow {
  http_request.method == "OPTIONS"
  _ = http_request.headers["access-control-request-method"]
  _ = http_request.headers["access-control-request-headers"]
}