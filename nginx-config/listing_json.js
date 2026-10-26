import s3gateway from "/etc/nginx/include/s3gateway.js";
import utils from "/etc/nginx/include/utils.js";

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
    const url = `${proto}://${server}:${port}${s3gateway.s3uri(r)}`;

    const headers = {
        'Authorization': r.variables.s3auth,
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

    if (reply.status === 403 || reply.status === 404) {
        return r.internalRedirect('@error404');
    }
    if (reply.status !== 200) {
        r.error(`listing_json: unexpected status ${reply.status} fetching S3 listing`);
        return r.internalRedirect('@error404');
    }

    const xml = await reply.text();
    const result = _parseListBucketResult(xml);

    if (FOUR_O_FOUR_ON_EMPTY_BUCKET && result.entries.length === 0) {
        return r.internalRedirect('@error404');
    }

    r.headersOut['Content-Type'] = 'application/json; charset=utf-8';
    r.headersOut['Vary'] = 'Accept';
    r.return(200, JSON.stringify(result));
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
    htmlListingHeaders
};
