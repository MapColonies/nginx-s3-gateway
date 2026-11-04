import s3gateway from "/etc/nginx/include/s3gateway.js";
import utils from "/etc/nginx/include/utils.js";
import awssig4 from "/etc/nginx/include/awssig4.js";
import awscred from "/etc/nginx/include/awscredentials.js";

const FOUR_O_FOUR_ON_EMPTY_BUCKET = utils.parseBoolean(process.env['FOUR_O_FOUR_ON_EMPTY_BUCKET']);

// cors.conf's per-method `if` blocks each define their own add_header set, which under
// nginx's add_header inheritance rule means a bare add_header at the location level never
// reaches most requests - so Vary has to be set here instead, via the header filter that
// already runs unconditionally for this location.
function htmlListingHeaders(r) {
    s3gateway.editHeaders(r);
    r.headersOut['Vary'] = 'Accept';
}

// XSLT is configured per-location at parse time, so the HTML/JSON choice must
// happen before nginx picks a location, not inside a shared one.
function dispatchDirectoryFormat(r) {
    r.internalRedirect(_wantsJson(r) ? "@s3DirectoryJson" : "@s3DirectoryHtml");
}

function _wantsJson(r) {
    const accept = r.headersIn['Accept'] || '';
    return accept.toLowerCase().indexOf('application/json') !== -1;
}

// Fetches the listing XML directly via ngx.fetch rather than proxy_pass + js_body_filter:
// a body filter alone, with no XSLT also on the location, doesn't reliably get the body here.
async function serveDirectoryJson(r) {
    const proto = process.env['S3_SERVER_PROTO'];
    const server = process.env['S3_SERVER'];
    const port = process.env['S3_SERVER_PORT'];
    const query = _buildListingQuery(r);
    const baseUri = _s3BaseUri();
    const url = `${proto}://${server}:${port}${baseUri.length > 0 ? baseUri : '/'}?${query}`;

    const headers = {
        'Authorization': _signListingQuery(r, query),
        'X-Amz-Security-Token': r.variables.awsSessionToken,
        'Host': r.variables.s3_host
    };
    if (r.variables.httpDate) {
        headers['Date'] = r.variables.httpDate;
    }
    if (r.variables.awsDate) {
        headers['x-amz-date'] = r.variables.awsDate;
    }
    if (r.variables.awsPayloadHash) {
        headers['x-amz-content-sha256'] = r.variables.awsPayloadHash;
    }

    let reply;
    try {
        reply = await ngx.fetch(url, { headers });
    } catch (error) {
        r.error(`listing_json: failed to fetch S3 listing: ${error}`);
        return r.internalRedirect('@error404');
    }

    if (reply.status === 400) {
        r.error('listing_json: S3 rejected the listing request (bad continuation-token?)');
        return r.return(400, JSON.stringify({ error: 'invalid continuation-token' }));
    }
    if (reply.status === 403 || reply.status === 404) {
        return r.internalRedirect('@error404');
    }
    // An upstream failure is not a missing directory - reporting 404 here would
    // tell a client the folder is gone when S3 is merely broken or unreachable.
    // (LocalStack answers 500 for a malformed continuation-token where real S3
    // answers 400, so both paths have to be non-404.)
    if (reply.status >= 500) {
        r.error(`listing_json: S3 returned ${reply.status} fetching listing`);
        return r.return(502, JSON.stringify({ error: 'upstream listing request failed' }));
    }
    if (reply.status !== 200) {
        r.error(`listing_json: unexpected status ${reply.status} fetching S3 listing`);
        return r.internalRedirect('@error404');
    }

    const xml = await reply.text();
    const result = _parseListBucketResult(xml);

    // Only a first page may 404 on empty: the last page of an exactly-N*1000-key
    // directory is legitimately empty, and 404ing it breaks a paging client mid-walk.
    const isFirstPage = !(r.args && r.args['continuation-token']);
    if (FOUR_O_FOUR_ON_EMPTY_BUCKET && isFirstPage && result.entries.length === 0) {
        return r.internalRedirect('@error404');
    }

    r.headersOut['Content-Type'] = 'application/json; charset=utf-8';
    r.headersOut['Vary'] = 'Accept';
    r.return(200, JSON.stringify(result));
}

// s3gateway.s3BaseUri is not exported by the base image, so re-derive it.
// Must stay identical to upstream's s3BaseUri: path style prefixes the bucket,
// virtual-host style uses the empty string.
function _s3BaseUri() {
    return process.env['S3_STYLE'] === 'path' ? '/' + process.env['S3_BUCKET_NAME'] : '';
}

// Signs the listing query with the base image's own sigv4 implementation.
// Upstream's $s3auth cannot be reused: _s3ReqParamsForSigV4 derives its
// queryParams from _s3DirQueryParams, which emits only delimiter/prefix and
// never reads r.args - so a continuation-token would be sent but not signed.
function _signListingQuery(r, queryParams) {
    if (process.env['AWS_SIGS_VERSION'] !== '4') {
        throw new Error('listing_json: JSON listing pagination requires AWS_SIGS_VERSION=4, got ' +
            process.env['AWS_SIGS_VERSION']);
    }
    const baseUri = _s3BaseUri();
    return awssig4.signatureV4(
        r, awscred.Now(), process.env['S3_REGION'], 's3',
        baseUri.length > 0 ? baseUri : '/', queryParams,
        r.variables.s3_host, awscred.readCredentials(r));
}

// Builds the canonical ListObjectsV2 query string. sigv4 requires the
// parameters sorted by name, and the string signed must be byte-identical to
// the string sent - so this one function is the only place the query is built.
// Sorted order: continuation-token, delimiter, list-type, prefix.
function _buildListingQuery(r) {
    const params = [];

    const token = (r.args && r.args['continuation-token']) || '';
    if (token) {
        params.push('continuation-token=' + s3gateway._encodeURIComponent(token));
    }

    params.push('delimiter=%2F');
    params.push('list-type=2');

    const uriPath = r.variables.uri_path;
    if (uriPath !== '/') {
        const decoded = decodeURIComponent(uriPath);
        const withoutLeadingSlash = decoded.charAt(0) === '/' ? decoded.substring(1) : decoded;
        if (withoutLeadingSlash) {
            params.push('prefix=' + s3gateway._encodeURIComponent(withoutLeadingSlash));
        }
    }

    return params.join('&');
}

// Converts a ListBucketResult XML doc to { path, entries: [{ name, type, size, lastModified }] }.
function _parseListBucketResult(xml) {
    const rootPath = process.env['DIRECTORY_LISTING_PATH_PREFIX'] || '';
    // Root <Prefix> is self-closed when empty; match either form, preferring one with content.
    const prefixMatch = /<Prefix>([\s\S]*?)<\/Prefix>|<Prefix\s*\/>/.exec(xml);
    const globalPrefix = prefixMatch && prefixMatch[1] ? _decodeXmlEntities(prefixMatch[1]) : '';

    const entries = [];

    const commonPrefixRe = /<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g;
    let match;
    while ((match = commonPrefixRe.exec(xml)) !== null) {
        const prefixInner = /<Prefix>([\s\S]*?)<\/Prefix>/.exec(match[1]);
        if (!prefixInner) {
            continue;
        }
        const full = _decodeXmlEntities(prefixInner[1]);
        if (full === globalPrefix) {
            continue;
        }
        entries.push({
            name: full.substring(globalPrefix.length).replace(/\/$/, ''),
            type: 'directory',
            size: null,
            lastModified: null,
            href: _buildHref(rootPath, full)
        });
    }

    const contentsRe = /<Contents>([\s\S]*?)<\/Contents>/g;
    while ((match = contentsRe.exec(xml)) !== null) {
        const block = match[1];
        const keyMatch = /<Key>([\s\S]*?)<\/Key>/.exec(block);
        if (!keyMatch) {
            continue;
        }
        const key = _decodeXmlEntities(keyMatch[1]);
        if (key === globalPrefix) {
            continue;
        }
        const sizeMatch = /<Size>([\s\S]*?)<\/Size>/.exec(block);
        const lastModifiedMatch = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(block);
        entries.push({
            name: key.substring(globalPrefix.length),
            type: 'file',
            size: sizeMatch ? Number(sizeMatch[1]) : null,
            lastModified: lastModifiedMatch ? lastModifiedMatch[1] : null,
            href: _buildHref(rootPath, key)
        });
    }

    const truncatedMatch = /<IsTruncated>([\s\S]*?)<\/IsTruncated>/.exec(xml);
    const tokenMatch = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);

    return {
        path: rootPath + globalPrefix,
        entries,
        truncated: truncatedMatch ? truncatedMatch[1] === 'true' : false,
        nextContinuationToken: tokenMatch ? _decodeXmlEntities(tokenMatch[1]) : null
    };
}

// Per-segment percent-encoding, matching listing.xsl's encode-uri template.
function _buildHref(rootPath, path) {
    const encoded = (rootPath + path).split('/').map((seg) => seg ? s3gateway._encodeURIComponent(seg) : seg).join('/');
    return '/' + encoded;
}

const XML_ENTITIES = {
    'amp': '&',
    'lt': '<',
    'gt': '>',
    'quot': '"',
    'apos': "'"
};

function _decodeXmlEntities(value) {
    return value.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (entity, body) => {
        if (body[0] === '#') {
            const codePoint = body[1] === 'x' || body[1] === 'X'
                ? parseInt(body.substring(2), 16)
                : parseInt(body.substring(1), 10);
            return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
        }
        return body in XML_ENTITIES ? XML_ENTITIES[body] : entity;
    });
}

export default {
    dispatchDirectoryFormat,
    serveDirectoryJson,
    htmlListingHeaders,
    // Pure helpers, exported for nginx-config/listing_json.test.js only.
    // Nothing in the nginx config references these.
    _test: {
        parseListBucketResult: _parseListBucketResult,
        decodeXmlEntities: _decodeXmlEntities,
        buildHref: _buildHref,
        buildListingQuery: _buildListingQuery
    }
};
