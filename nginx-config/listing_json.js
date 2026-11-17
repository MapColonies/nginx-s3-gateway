import xml from "xml";
import s3gateway from "/etc/nginx/include/s3gateway.js";

var ROOT_PATH = process.env['DIRECTORY_LISTING_PATH_PREFIX'] || '';
var PREFIX_PATH = process.env['PREFIX_LEADING_DIRECTORY_PATH'] || '';

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

    var body = Buffer.concat(r._jsonChunks).toString();
    r._jsonChunks = null;

    // Headers are already sent: status can't change here. 403/404 are mapped by
    // error_page; any other S3 error gets a JSON body under S3's own status.
    var out;
    if (r.status !== 200) {
        r.error('listing_json: S3 answered ' + r.status);
        out = { error: 'upstream listing request failed' };
    } else {
        try {
            out = _parseXmlToJson(body);
        } catch (e) {
            r.error('listing_json: failed to parse listing XML: ' + e);
            out = { error: 'upstream listing parse failed' };
        }
    }
    r.sendBuffer(JSON.stringify(out), { last: true });
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
                href: _buildHref(ROOT_PATH, _stripPrefixPath(full))
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
                href: _buildHref(ROOT_PATH, _stripPrefixPath(key))
            });
        }
    }

    return {
        path: _joinRoot(ROOT_PATH, _stripPrefixPath(globalPrefix)),
        entries: entries,
        truncated: truncated,
        nextMarker: nextMarker
    };
}

function _stripPrefixPath(key) {
    return PREFIX_PATH && key.indexOf(PREFIX_PATH) === 0 ? key.substring(PREFIX_PATH.length) : key;
}

function _findChildTag(parent, name) {
    var tags = parent.$tags || [];
    for (var i = 0; i < tags.length; i++) {
        if (tags[i].$name === name) { return tags[i]; }
    }
    return null;
}

function _joinRoot(rootPath, path) {
    var sep = rootPath.length > 0 && rootPath.charAt(rootPath.length - 1) !== '/' && path.charAt(0) !== '/' ? '/' : '';
    return rootPath + sep + path;
}

function _buildHref(rootPath, path) {
    var full = _joinRoot(rootPath, path);
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
        joinRoot: _joinRoot,
        wantsJson: _wantsJson
    }
};
