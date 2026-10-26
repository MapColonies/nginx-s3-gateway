import s3gateway from "/etc/nginx/include/s3gateway.js";

// Entry point for the "@s3Directory" named location. Decides, per request,
// whether the client wants the HTML (XSLT) listing or a JSON listing, and
// forwards to the matching variant. XSLT transforms are configured
// statically per-location, so the format choice has to happen before nginx
// picks a location, not inside a shared one.
function dispatchDirectoryFormat(r) {
    r.internalRedirect(_wantsJson(r) ? "@s3DirectoryJson" : "@s3DirectoryHtml");
}

function _wantsJson(r) {
    const accept = r.headersIn['Accept'] || '';
    return accept.toLowerCase().indexOf('application/json') !== -1;
}

/**
 * Serves the JSON directory listing. Fetches the S3 ListBucketResult XML
 * directly via ngx.fetch (the same pattern the vendor s3gateway.loadContent
 * uses) rather than proxy_pass + js_body_filter: a body filter on its own,
 * with no XSLT (or other body-transforming filter) also attached to the
 * location, does not reliably receive the proxied response body in this
 * nginx/njs build - it's handed empty chunks even though the upstream fetch
 * itself succeeds. Doing the S3 call directly from njs sidesteps that filter
 * chain entirely.
 *
 * @param r {NginxHTTPRequest} HTTP request object
 */
async function serveDirectoryJson(r) {
    const proto = process.env['S3_SERVER_PROTO'];
    const server = process.env['S3_SERVER'];
    const port = process.env['S3_SERVER_PORT'];
    const url = `${proto}://${server}:${port}${s3gateway.s3uri(r)}`;

    let reply;
    try {
        reply = await ngx.fetch(url, {
            headers: {
                'Authorization': r.variables.s3auth,
                'X-Amz-Security-Token': r.variables.awsSessionToken,
                'Host': r.variables.s3_host
            }
        });
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
    const json = JSON.stringify(_parseListBucketResult(xml));

    r.headersOut['Content-Type'] = 'application/json; charset=utf-8';
    r.return(200, json);
}

/**
 * Converts an S3 ListBucketResult XML document into a simplified JSON shape:
 * { path, entries: [{ name, type, size, lastModified }] }
 *
 * Deliberately avoids depending on njs's XML support (version-dependent) in
 * favor of a small manual extractor, since ListBucketResult's shape is fixed
 * and shallow.
 *
 * @param xml {string} S3 ListBucketResult XML document
 * @returns {{path: string, entries: Array<Object>}}
 */
function _parseListBucketResult(xml) {
    const rootPath = process.env['DIRECTORY_LISTING_PATH_PREFIX'] || '';
    // The root <Prefix> is self-closed ("<Prefix />") when empty, so a
    // closing-tag match would skip it and pick up a nested CommonPrefixes
    // <Prefix> instead. Match either form, preferring one with content.
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
            lastModified: null
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
            lastModified: lastModifiedMatch ? lastModifiedMatch[1] : null
        });
    }

    return {
        path: rootPath + globalPrefix,
        entries
    };
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
    // Exposed only so unit tests can exercise it directly.
    _parseListBucketResult,
    _decodeXmlEntities
};
