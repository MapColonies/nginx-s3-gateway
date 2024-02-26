local connectTimeout = os.getenv("REDIS_CONNECT_TIMEOUT")
local sendTimeout = os.getenv("REDIS_SEND_TIMEOUT")
local readTimeout = os.getenv("REDIS_READ_TIMEOUT")
local maxIdleTimeout = os.getenv("REDIS_MAX_IDLE_TIMEOUT")
local poolSize = os.getenv("REDIS_POOL_SIZE")
local host = os.getenv("REDIS_HOST")
local port = os.getenv("REDIS_PORT")
local str2bool={ ["true"]=true, ["false"]=false }
local enableSSL = str2bool[os.getenv("REDIS_SSL_ENABLED")]
local requirePassword = os.getenv("REDIS_REQUIRE_PASSWORD")
local password = os.getenv("REDIS_PASSWORD")
{{ if .Values.redis.authentication.username }}
local username = os.getenv("REDIS_USERNAME")
{{ end }}

local key = assert(ngx.var.request_uri, "no key found")

if string.match(key, "?") then
    key = string.sub(key, 2, string.find(key, "?") - 1)
end

local redis = require "resty.redis"
local red, err = redis:new()
if not red then
    ngx.log(ngx.ERR, "Failed to create redis variable, error -> ", err)
    return
end

red:set_timeouts(connectTimeout, sendTimeout, readTimeout)
red:set_keepalive(maxIdleTimeout, poolSize)

local ok, err = red:connect(host, port, { ssl = enableSSL })
if not ok then
    ngx.log(ngx.ERR, "Failed to connect to redis, error -> ", err)
    return
end

if requirePassword == "true" then
    {{ if .Values.redis.authentication.username }}
    local ok, err = red:auth(username, password)
    {{ else }}
    local ok, err = red:auth(password)
    {{ end }}
    if not ok then
        ngx.log(ngx.ERR, "Failed to authenticate redis, error -> ", err)
        return ngx.exit(403)
    end
end

{{ if .Values.redis.prefix.enabled }}
key = {{ quote .Values.redis.prefix.value }}..key
{{ end }}

local data, err = red:get(key)
if not data then
    ngx.log(ngx.ERR, "Failed to get key, error -> ", err)
    return ngx.exit(500)
end
if data == ngx.null then
    return ngx.exit(404)
end

ngx.print(data)
