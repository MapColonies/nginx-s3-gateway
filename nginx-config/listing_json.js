import xml from "xml";
import s3gateway from "/etc/nginx/include/s3gateway.js";
import utils from "/etc/nginx/include/utils.js";

var FOUR_O_FOUR_ON_EMPTY_BUCKET = utils.parseBoolean(process.env['FOUR_O_FOUR_ON_EMPTY_BUCKET']);
var ROOT_PATH = process.env['DIRECTORY_LISTING_PATH_PREFIX'] || '';

function _wantsJson(r) {
    var accept = r.headersIn['Accept'] || '';
    var parts = accept.split(',');
    for (var i = 0; i < parts.length; i++) {
        var entry = parts[i].trim();
        var semi = entry.indexOf(';');
        var mediaType = (semi === -1 ? entry : entry.substring(0, semi)).trim().toLowerCase();
        if (mediaType !== 'application/json') {
            continue;
        }
        if (semi === -1) {
            return true;
        }
        var params = entry.substring(semi + 1);
        var qMatch = /(?:^|;)\s*q\s*=\s*([0-9.]+)/.exec(params);
        if (!qMatch || parseFloat(qMatch[1]) > 0) {
            return true;
        }
        return false;
    }
    return false;
}

function dispatchDirectoryFormat(r) {
    r.internalRedirect(_wantsJson(r) ? '@s3DirectoryJson' : '@s3DirectoryHtml');
}

function htmlListingHeaders(r) {
    s3gateway.editHeaders(r);
    r.headersOut['Vary'] = 'Accept';
}

function jsonListingHeaders(r) {
    s3gateway.editHeaders(r);
    r.headersOut['Content-Type'] = 'application/json; charset=utf-8';
    r.headersOut['Vary'] = 'Accept';
    delete r.headersOut['Content-Length'];
}

function jsonBodyFilter(r, data, flags) {
    if (!r._jsonChunks) {
        r._jsonChunks = [];
    }
    r._jsonChunks.push(data);

    if (!flags.last) {
        return;
    }

    var body = r._jsonChunks.join('');
    r._jsonChunks = null;

    if (r.status === 403 || r.status === 404) {
        r.status = 404;
        r.sendBuffer(JSON.stringify({ error: 'not found' }), { last: true });
        return;
    }
    if (r.status >= 400) {
        r.status = r.status >= 500 ? 502 : r.status;
        var errMsg = r.status >= 500 ? 'upstream listing request failed' : 'listing request failed';
        r.sendBuffer(JSON.stringify({ error: errMsg }), { last: true });
        return;
    }

    var result;
    try {
        result = _parseXmlToJson(body);
    } catch (e) {
        r.error('listing_json: failed to parse listing XML: ' + e);
        r.sendBuffer(JSON.stringify({ error: 'upstream listing parse failed' }), { last: true });
        return;
    }

    var isFirstPage = !r.variables.arg_marker;
    if (FOUR_O_FOUR_ON_EMPTY_BUCKET && isFirstPage && result.entries.length === 0) {
        r.status = 404;
        r.sendBuffer(JSON.stringify({ error: 'not found' }), { last: true });
        return;
    }

    r.sendBuffer(JSON.stringify(result), { last: true });
}

function _parseXmlToJson(body) {
    var parsed = xml.parse(body);
    var root = parsed.ListBucketResult;
    if (!root) {
        throw new Error('no ListBucketResult element');
    }

    var globalPrefix = root.Prefix ? root.Prefix.$text || '' : '';
    var truncated = root.IsTruncated ? root.IsTruncated.$text === 'true' : false;

    var nextMarker = null;
    if (root.NextMarker && root.NextMarker.$text) {
        var raw = root.NextMarker.$text;
        nextMarker = raw.indexOf(globalPrefix) === 0
            ? raw.substring(globalPrefix.length) : raw;
    }

    var entries = [];
    var tags = root.$tags || [];

    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];

        if (tag.$name === 'CommonPrefixes') {
            var prefixTag = tag.$tags ? tag.$tags[0] : null;
            if (!prefixTag) { continue; }
            var full = prefixTag.$text || '';
            if (full === globalPrefix) { continue; }
            var dirName = full.substring(globalPrefix.length).replace(/\/$/, '');
            entries.push({
                name: dirName,
                type: 'directory',
                size: null,
                lastModified: null,
                href: _buildHref(ROOT_PATH, full)
            });
        }

        if (tag.$name === 'Contents') {
            var keyTag = _findChildTag(tag, 'Key');
            if (!keyTag) { continue; }
            var key = keyTag.$text || '';
            if (key === globalPrefix) { continue; }
            var sizeTag = _findChildTag(tag, 'Size');
            var lastModTag = _findChildTag(tag, 'LastModified');
            entries.push({
                name: key.substring(globalPrefix.length),
                type: 'file',
                size: sizeTag ? Number(sizeTag.$text) : null,
                lastModified: lastModTag ? lastModTag.$text : null,
                href: _buildHref(ROOT_PATH, key)
            });
        }
    }

    return {
        path: ROOT_PATH + globalPrefix,
        entries: entries,
        truncated: truncated,
        nextMarker: nextMarker
    };
}

function _findChildTag(parent, name) {
    var tags = parent.$tags || [];
    for (var i = 0; i < tags.length; i++) {
        if (tags[i].$name === name) { return tags[i]; }
    }
    return null;
}

function _buildHref(rootPath, path) {
    var prefix = rootPath;
    if (prefix.length > 0 && prefix.charAt(prefix.length - 1) !== '/' && path.charAt(0) !== '/') {
        prefix = prefix + '/';
    }
    var full = prefix + path;
    if (full.charAt(0) === '/') {
        full = full.substring(1);
    }
    var segments = full.split('/');
    var encoded = [];
    for (var i = 0; i < segments.length; i++) {
        encoded.push(segments[i] ? s3gateway._encodeURIComponent(segments[i]) : segments[i]);
    }
    return '/' + encoded.join('/');
}

export default {
    dispatchDirectoryFormat,
    jsonBodyFilter,
    jsonListingHeaders,
    htmlListingHeaders,
    _test: {
        parseXmlToJson: _parseXmlToJson,
        buildHref: _buildHref,
        wantsJson: _wantsJson
    }
};
