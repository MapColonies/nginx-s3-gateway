FROM debian:12 as BUILDER

RUN apt update && apt install -y wget build-essential git zlib1g-dev curl libpcre2-dev libssl-dev

WORKDIR /work

ARG BASE_NGINX_VERSION=1.25.3

## BASE NGINX
RUN wget --no-check-certificate https://openresty.org/download/nginx-${BASE_NGINX_VERSION}.tar.gz \
    && tar -xzvf nginx-${BASE_NGINX_VERSION}.tar.gz

## LUA JIT
RUN wget --no-check-certificate https://github.com/openresty/luajit2/archive/refs/tags/v2.1-20231117.tar.gz \
    && tar -xzvf v2.1-20231117.tar.gz \ 
    && cd luajit2-2.1-20231117 \
    && make \
    && make install

ENV LUAJIT_LIB=/usr/local/lib/
ENV LUAJIT_INC=/usr/local/include/luajit-2.1

## CLONE OPENRESTY REPOS
RUN wget --no-check-certificate https://github.com/vision5/ngx_devel_kit/archive/refs/tags/v0.3.3.tar.gz \
    && tar -xzvf v0.3.3.tar.gz \
    && wget --no-check-certificate https://github.com/openresty/lua-nginx-module/archive/refs/tags/v0.10.26rc1.tar.gz \
    && tar -xzvf v0.10.26rc1.tar.gz \
    && wget --no-check-certificate https://github.com/openresty/srcache-nginx-module/archive/refs/tags/v0.33.tar.gz \
    && tar -xzvf v0.33.tar.gz \
    && rm -rf v0.33.tar.gz \
    && wget --no-check-certificate https://github.com/openresty/set-misc-nginx-module/archive/refs/tags/v0.33.tar.gz \
    && tar -xzvf v0.33.tar.gz \
    && wget --no-check-certificate https://github.com/openresty/headers-more-nginx-module/archive/refs/tags/v0.36.tar.gz \
    && tar -xzvf v0.36.tar.gz

## COMPILE NGINX FOR THE DYNAMIC MODULES
RUN cd nginx-${BASE_NGINX_VERSION} \
    && ./configure --prefix=/etc/nginx \
    --sbin-path=/usr/sbin/nginx --modules-path=/usr/lib/nginx/modules --conf-path=/etc/nginx/nginx.conf --error-log-path=/var/log/nginx/error.log \
    --http-log-path=/var/log/nginx/access.log --pid-path=/var/run/nginx.pid --lock-path=/var/run/nginx.lock \
    --http-client-body-temp-path=/var/cache/nginx/client_temp --http-proxy-temp-path=/var/cache/nginx/proxy_temp \
    --http-fastcgi-temp-path=/var/cache/nginx/fastcgi_temp --http-uwsgi-temp-path=/var/cache/nginx/uwsgi_temp \
    --http-scgi-temp-path=/var/cache/nginx/scgi_temp --user=nginx --group=nginx --with-compat --with-file-aio --with-threads \
    --with-http_addition_module --with-http_auth_request_module --with-http_dav_module --with-http_flv_module --with-http_gunzip_module \
    --with-http_gzip_static_module --with-http_mp4_module --with-http_random_index_module --with-http_realip_module --with-http_secure_link_module \
    --with-http_slice_module --with-http_ssl_module --with-http_stub_status_module --with-http_sub_module --with-http_v2_module --with-http_v3_module \
    --with-mail --with-mail_ssl_module --with-stream --with-stream_realip_module --with-stream_ssl_module --with-stream_ssl_preread_module \
    --with-cc-opt='-g -O2 -ffile-prefix-map=/data/builder/debuild/nginx-${BASE_NGINX_VERSION}/debian/debuild-base/nginx-${BASE_NGINX_VERSION}=. -fstack-protector-strong -Wformat -Werror=format-security -Wp,-D_FORTIFY_SOURCE=2 -fPIC' \
    --with-ld-opt='-Wl,-z,relro -Wl,-z,now -Wl,-rpath,/usr/local/lib,--as-needed -pie' \
    --add-dynamic-module=/work/ngx_devel_kit-0.3.3 \
    --add-dynamic-module=/work/lua-nginx-module-0.10.26rc1 \
    --add-dynamic-module=/work/srcache-nginx-module-0.33 \
    --add-dynamic-module=/work/set-misc-nginx-module-0.33 \
    --add-dynamic-module=/work/headers-more-nginx-module-0.36 \
    && make -j2 \
    && make install

## ADD-ONS THAT DO NOT NEED COMPILATION

RUN apt-get update && apt-get install -y \
    git \
    ca-certificates
RUN git config --global http.sslCAinfo /etc/ssl/certs/ca-certificates.crt
RUN git config --global http.sslVerify false
RUN git clone https://github.com/openresty/lua-resty-core.git \
    && cd lua-resty-core \
    && make install PREFIX=/etc/nginx \
    && cd /work \
    && git clone https://github.com/openresty/lua-resty-lrucache.git \
    && cd lua-resty-lrucache \
    && make install PREFIX=/etc/nginx \
    && cd /work \
    && git clone https://github.com/openresty/lua-resty-redis.git \
    && cd lua-resty-redis \
    && make install PREFIX=/etc/nginx


## NGINX-S3-GATEWAY
FROM ghcr.io/nginxinc/nginx-s3-gateway/nginx-oss-s3-gateway:unprivileged-oss-20231102

USER root

ARG BASE_NGINX_VERSION=1.25.3

## EXPORT PATHS OF LUA
ENV LUAJIT_LIB=/usr/local/lib/
ENV LUAJIT_INC=/usr/local/include/luajit-2.1

## COPY THE MODULES FROM BUILDER STAGE TO NGINX-S3-GATEWAY
COPY --from=BUILDER /work/nginx-${BASE_NGINX_VERSION}/objs/*.so /etc/nginx/modules/
COPY --from=BUILDER /etc/nginx/lib /etc/nginx/lib
COPY --from=BUILDER /usr/local/lib/ /usr/local/lib

COPY jwt.js /etc/nginx/jwt.js
COPY 21-envsubst-on-nginx-conf.sh /docker-entrypoint.d
COPY default.conf.template /etc/nginx/templates
COPY nginx.conf.template /etc/nginx/nginx.conf.template

RUN chmod +x /docker-entrypoint.d/21-envsubst-on-nginx-conf.sh

EXPOSE 8080

USER nginx
