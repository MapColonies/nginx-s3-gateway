# Changelog

## [5.0.0](https://github.com/MapColonies/nginx-s3-gateway/compare/v4.0.0...v5.0.0) (2026-09-11)


### ⚠ BREAKING CHANGES

* route.host/route.path are removed in favor of route.routesMapping; route.tls.useCert is renamed to route.tls.useCerts.

### Helm Changes

* support multiple openshift routes ([#31](https://github.com/MapColonies/nginx-s3-gateway/issues/31)) ([f3dc439](https://github.com/MapColonies/nginx-s3-gateway/commit/f3dc439ca2281d7f6bd91dfec02dec98aa28de59))

## [4.0.0](https://github.com/MapColonies/nginx-s3-gateway/compare/v3.0.2...v4.0.0) (2026-09-07)


### ⚠ BREAKING CHANGES

* image base and entrypoint change; nginx config is now the official gateway template model.

### Features

* reuse MapColonies nginx base for OTel + shared OPA auth (MAPCO-11186) ([#28](https://github.com/MapColonies/nginx-s3-gateway/issues/28)) ([bf1cf24](https://github.com/MapColonies/nginx-s3-gateway/commit/bf1cf24f7ba97740fb09c0e1d03c33acfe60cc2f))
* upgrade to official nginx-s3-gateway image (MAPCO-11185) ([#27](https://github.com/MapColonies/nginx-s3-gateway/issues/27)) ([831bbbe](https://github.com/MapColonies/nginx-s3-gateway/commit/831bbbe5a03f9a650b98a45c3c1b931cc6d1ddee))


### Bug Fixes

* add the missing env file in example ([05fc5a3](https://github.com/MapColonies/nginx-s3-gateway/commit/05fc5a303ebbfdf45027e21a3e7e978e748cac1e))
