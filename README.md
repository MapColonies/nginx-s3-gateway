# nginx-s3-gateway Openshift Compatible Image

Configuring `nginxinc/nginx-s3-gateway` image to act as an authenticating and caching gateway for read-only requests (GET/HEAD) to the S3 API.

## Application Architecture Overview

![Application Architecture Overview](Nginx-S3.png)

## Why?

* Providing an authentication gateway using an alternative authentication system to S3
* Caching frequently accessed S3 objects for lower latency delivery and protection against S3 outages
* For internal/micro services that can't authenticate against the S3 API (e.g. don't have libraries available) the gateway can provide a means to accessing S3 objects without authentication
* Compressing objects (gzip, brotli) from gateway to end user
* Protecting S3 bucket from arbitrary public access and traversal
* Rate limiting S3 objects
* Protecting a S3 bucket with a WAF
* Serving static assets from a S3 bucket alongside a dynamic application endpoints all in a single RESTful directory structure

# NGINX-S3-Gateway with Lua and Redis Feature

This Dockerfile enhances the NGINX-S3-Gateway image by adding Redis support using OpenResty. The resulting image provides a powerful and extensible NGINX setup for S3 gateway functionality with the added benefits of Lua scripting and Redis integration.

## Build Process Overview

1. **Base Image Setup:**
   - The Dockerfile starts from the Debian base image, which is the foundation for the NGINX-S3-Gateway.

2. **Installation of Build Dependencies:**
   - Essential packages, including `wget`, `build-essential`, and required libraries, are installed to facilitate the subsequent build process.

3. **NGINX Compilation with OpenResty Modules:**
   - The OpenResty NGINX modules (e.g., lua-nginx-module and srcache-nginx-module) are cloned into the workspace.
   - LuaJIT is cloned and installed, and environment variables (`LUAJIT_LIB` and `LUAJIT_INC`) are set to ensure correct library paths.
   - NGINX is configured using the `./configure` script with various modules and options, including dynamic modules for OpenResty.
   - NGINX is then compiled (`make`) and installed (`make install`).

   To determine the appropriate configuration for building NGINX with additional Lua and dynamic modules, we retrieved the configuration command using "nginx -V" within the desired version of NGINX. This ensures compatibility with the chosen NGINX version.
   Executing "nginx -V" inside the container of the selected NGINX version helps guarantee that the configuration for building NGINX is as close as possible to the official NGINX version. This minimizes the risk of encountering binary compatibility issues during the build process.

4. **Add-ons Installation:**
   - Additional Lua modules that do not require compilation (e.g., lua-resty-redis) are cloned and installed.

5. **Integration with NGINX-S3-Gateway Image:**
   - The NGINX-S3-Gateway image is used as the base for further modifications.
   - The compiled NGINX modules, libraries, and additional Lua modules are copied from the build stage to the NGINX-S3-Gateway image.

6. **Configuration and Entrypoint:**
   - Custom configuration files (`nginx.conf.template` and `default.conf.template`) are copied to their respective locations.
   - The entrypoint script is set as executable.

## Building the Docker Image

To build the Docker image with the Redis feature:

```bash
docker image build -t <prefix>/nginx-s3-gateway:v1.0.0 .
```

```bash
docker image push <prefix>/nginx-s3-gateway:v1.0.0
```

## Running the Container

To run a container:

```bash
docker container run -d --rm --name nginx-s3-gateway \
  --network host \
  -e S3_BUCKET_NAME=<bucket> \
  -e S3_SERVER=127.0.0.1 \
  -e S3_SERVER_PORT=9000 \
  -e S3_SERVER_PROTO=http \
  -e S3_REGION=us-east-1 \
  -e S3_STYLE=path \
  -e ALLOW_DIRECTORY_LIST=true \
  -e AWS_SIGS_VERSION=4 \
  -e AWS_ACCESS_KEY_ID=<user> \
  -e AWS_SECRET_ACCESS_KEY=<password> \
  -e CORS_ENABLED=true \
  -e NGINX_WORKER_PROCESSES=4 \
  -e PROXY_CACHE_MAX_SIZE=10g \
  -e PROXY_CACHE_INACTIVE=60m \
  -e PROXY_CACHE_VALID_OK=1h \
  -e PROXY_CACHE_VALID_NOTFOUND=1m \
  -e PROXY_CACHE_VALID_FORBIDDEN=30s \
  <prefix>/nginx-s3-gateway
```

This command will expose NGINX, providing access to the S3 gateway with Redis integration.

## Customization

Feel free to customize the NGINX configuration files (`nginx.conf` and `default.conf`) and environment variables to suit your specific requirements.

## Testing

The Dockerfile has been tested locally to ensure proper integration of the Redis feature. Comprehensive testing includes both unit tests and manual testing to validate functionality.

## Install

```bash
  cd helm
  helm install proxy .
```

See: [OpenResty](https://openresty.org/)

## Future Considerations

This Dockerfile provides a solid foundation for NGINX with Redis support. Future enhancements may include additional Redis-related configurations and features based on project requirements (e.g., prometheus).

## Use Cases

* When Redis is down, requests will be sent directly to S3
* When a request is taking longer than expected in redis, the request will be sent to S3