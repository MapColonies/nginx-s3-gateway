# Changelog

## [5.0.0](https://github.com/MapColonies/nginx-s3-gateway/compare/v4.0.0...v5.0.0) (2026-09-24)


### ⚠ BREAKING CHANGES

* route.host/route.path are removed in favor of route.routesMapping; route.tls.useCert is renamed to route.tls.useCerts.

### Bug Fixes

* **log-format:** quote upstream_bytes to keep JSON valid on no-upstream requests ([#35](https://github.com/MapColonies/nginx-s3-gateway/issues/35)) ([b9db1ef](https://github.com/MapColonies/nginx-s3-gateway/commit/b9db1ef3a3657d5ad162449df45e888037ad1bce))
* readiness probe returns truncated response ([#30](https://github.com/MapColonies/nginx-s3-gateway/issues/30)) ([f25b107](https://github.com/MapColonies/nginx-s3-gateway/commit/f25b107f23a1cdc5626d76b526e462ced883a531))
* return 401/403 when OPA denies with a reasons array (MAPCO-11769) ([#34](https://github.com/MapColonies/nginx-s3-gateway/issues/34)) ([2563958](https://github.com/MapColonies/nginx-s3-gateway/commit/25639587cdb525c281ac33ea50bfd7ae48e7ca79))


### Helm Changes

* added support of gzip for lighter serving (MAPCO-7230) ([#32](https://github.com/MapColonies/nginx-s3-gateway/issues/32)) ([e8e9c60](https://github.com/MapColonies/nginx-s3-gateway/commit/e8e9c60944c8f797502ff90bcbf5e25ce1816e83))
* support multiple openshift routes ([#31](https://github.com/MapColonies/nginx-s3-gateway/issues/31)) ([f3dc439](https://github.com/MapColonies/nginx-s3-gateway/commit/f3dc439ca2281d7f6bd91dfec02dec98aa28de59))

## [4.0.0](https://github.com/MapColonies/nginx-s3-gateway/compare/v3.0.2...v4.0.0) (2026-09-07)


### ⚠ BREAKING CHANGES

* image base and entrypoint change; nginx config is now the official gateway template model.

### Features

* reuse MapColonies nginx base for OTel + shared OPA auth (MAPCO-11186) ([#28](https://github.com/MapColonies/nginx-s3-gateway/issues/28)) ([bf1cf24](https://github.com/MapColonies/nginx-s3-gateway/commit/bf1cf24f7ba97740fb09c0e1d03c33acfe60cc2f))
* upgrade to official nginx-s3-gateway image (MAPCO-11185) ([#27](https://github.com/MapColonies/nginx-s3-gateway/issues/27)) ([831bbbe](https://github.com/MapColonies/nginx-s3-gateway/commit/831bbbe5a03f9a650b98a45c3c1b931cc6d1ddee))


### Bug Fixes

* add the missing env file in example ([05fc5a3](https://github.com/MapColonies/nginx-s3-gateway/commit/05fc5a303ebbfdf45027e21a3e7e978e748cac1e))
