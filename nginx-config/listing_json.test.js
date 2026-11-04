import listing from '/work/nginx-config/listing_json.js';

// njs 0.9.6 does not support destructuring assignment - use direct property access.
const parseListBucketResult = listing._test.parseListBucketResult;
const decodeXmlEntities = listing._test.decodeXmlEntities;
const buildHref = listing._test.buildHref;

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.log(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`); }
    else { console.log(`ok   ${name}`); }
}

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult><Name>test-bucket</Name><Prefix>dir1/</Prefix>
<IsTruncated>true</IsTruncated>
<NextContinuationToken>1ueGcx/a+B==</NextContinuationToken>
<CommonPrefixes><Prefix>dir1/sub &amp; more/</Prefix></CommonPrefixes>
<Contents><Key>dir1/a b.txt</Key><Size>12</Size><LastModified>2026-01-01T00:00:00.000Z</LastModified></Contents>
<Contents><Key>dir1/</Key><Size>0</Size><LastModified>2026-01-01T00:00:00.000Z</LastModified></Contents>
</ListBucketResult>`;

const r = parseListBucketResult(XML);
check('prefix becomes path', r.path, 'dir1/');
check('self-prefix row dropped', r.entries.length, 2);
check('dir name is relative, unslashed', r.entries[0].name, 'sub & more');
check('dir entry type', r.entries[0].type, 'directory');
check('file name is relative', r.entries[1].name, 'a b.txt');
check('file size parsed as number', r.entries[1].size, 12);
check('truncated flag', r.truncated, true);
check('continuation token decoded', r.nextContinuationToken, '1ueGcx/a+B==');

const EMPTY = '<ListBucketResult><Name>b</Name><Prefix/><IsTruncated>false</IsTruncated></ListBucketResult>';
const e = parseListBucketResult(EMPTY);
check('self-closed Prefix means root', e.path, '');
check('no entries', e.entries.length, 0);
check('not truncated', e.truncated, false);
check('no token', e.nextContinuationToken, null);

check('numeric entity', decodeXmlEntities('a&#65;b'), 'aAb');
check('hex entity', decodeXmlEntities('a&#x41;b'), 'aAb');
check('named entities', decodeXmlEntities('&lt;&amp;&gt;&quot;&apos;'), `<&>"'`);
check('unknown entity left alone', decodeXmlEntities('&nope;'), '&nope;');

check('href encodes each segment', buildHref('', 'dir 1/a b.txt'), '/dir%201/a%20b.txt');
check('href keeps slashes', buildHref('', 'a/b/c'), '/a/b/c');
check('href applies root prefix', buildHref('root/', 'a b'), '/root/a%20b');

const buildListingQuery = listing._test.buildListingQuery;

// Minimal stand-in for the nginx request object: buildListingQuery reads only
// these two properties.
function req(uriPath, args) { return { variables: { uri_path: uriPath }, args: args || {} }; }

check('root listing, no token',
    buildListingQuery(req('/')),
    'delimiter=%2F&list-type=2&max-keys=50');
check('prefixed listing sorts after list-type',
    buildListingQuery(req('/dir1/')),
    'delimiter=%2F&list-type=2&max-keys=50&prefix=dir1%2F');
check('token sorts first',
    buildListingQuery(req('/dir1/', {'continuation-token': 'abc'})),
    'continuation-token=abc&delimiter=%2F&list-type=2&max-keys=50&prefix=dir1%2F');
check('token with / + = is fully encoded',
    buildListingQuery(req('/', {'continuation-token': '1ueGcx/a+B=='})),
    'continuation-token=1ueGcx%2Fa%2BB%3D%3D&delimiter=%2F&list-type=2&max-keys=50');
check('blank token is omitted, not sent empty',
    buildListingQuery(req('/', {'continuation-token': ''})),
    'delimiter=%2F&list-type=2&max-keys=50');
check('prefix with space and ampersand',
    buildListingQuery(req('/a b&c/')),
    'delimiter=%2F&list-type=2&max-keys=50&prefix=a%20b%26c%2F');

check('max-keys sorts between list-type and prefix',
    buildListingQuery(req('/dir1/')),
    'delimiter=%2F&list-type=2&max-keys=50&prefix=dir1%2F');
check('max-keys present on a root listing too',
    buildListingQuery(req('/')),
    'delimiter=%2F&list-type=2&max-keys=50');
check('full sorted order with a token',
    buildListingQuery(req('/dir1/', {'continuation-token': 'abc'})),
    'continuation-token=abc&delimiter=%2F&list-type=2&max-keys=50&prefix=dir1%2F');

const parseMaxKeys = listing._test.parseMaxKeys;

check('unset falls back to S3 default', parseMaxKeys(undefined), 1000);
check('empty string falls back', parseMaxKeys(''), 1000);
check('garbage falls back', parseMaxKeys('abc'), 1000);
check('zero falls back', parseMaxKeys('0'), 1000);
check('negative falls back', parseMaxKeys('-5'), 1000);
check('above S3 ceiling is clamped', parseMaxKeys('5000'), 1000);
check('valid value is honored', parseMaxKeys('250'), 250);
check('ceiling value is honored', parseMaxKeys('1000'), 1000);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
if (failures) { throw new Error(`${failures} test(s) failed`); }
