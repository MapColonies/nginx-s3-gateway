import listing from '/work/nginx-config/listing_json.js';

var parseXmlToJson = listing._test.parseXmlToJson;
var buildHref = listing._test.buildHref;
var wantsJson = listing._test.wantsJson;

var failures = 0;
function check(name, actual, expected) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.log('FAIL ' + name + '\n  expected ' + e + '\n  actual   ' + a); }
    else { console.log('ok   ' + name); }
}

// --- parseXmlToJson ---

var XML = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ListBucketResult><Name>test-bucket</Name><Prefix>dir1/</Prefix>' +
    '<Delimiter>/</Delimiter>' +
    '<IsTruncated>true</IsTruncated>' +
    '<NextMarker>dir1/zoo/</NextMarker>' +
    '<CommonPrefixes><Prefix>dir1/sub &amp; more/</Prefix></CommonPrefixes>' +
    '<Contents><Key>dir1/a b.txt</Key><Size>12</Size><LastModified>2026-01-01T00:00:00.000Z</LastModified></Contents>' +
    '<Contents><Key>dir1/</Key><Size>0</Size><LastModified>2026-01-01T00:00:00.000Z</LastModified></Contents>' +
    '</ListBucketResult>';

var r = parseXmlToJson(XML);
check('prefix becomes path', r.path, 'dir1/');
check('self-prefix row dropped', r.entries.length, 2);
check('dir name is relative, unslashed', r.entries[0].name, 'sub & more');
check('dir entry type', r.entries[0].type, 'directory');
check('file name is relative', r.entries[1].name, 'a b.txt');
check('file size parsed as number', r.entries[1].size, 12);
check('truncated flag', r.truncated, true);
check('nextMarker is prefix-stripped', r.nextMarker, 'zoo/');

var EMPTY = '<ListBucketResult><Name>b</Name><Prefix/><IsTruncated>false</IsTruncated></ListBucketResult>';
var e = parseXmlToJson(EMPTY);
check('self-closed Prefix means root', e.path, '');
check('no entries', e.entries.length, 0);
check('not truncated', e.truncated, false);
check('no marker', e.nextMarker, null);

// Multiple CommonPrefixes and Contents
var MULTI = '<ListBucketResult><Prefix>p/</Prefix><IsTruncated>false</IsTruncated>' +
    '<CommonPrefixes><Prefix>p/a/</Prefix></CommonPrefixes>' +
    '<CommonPrefixes><Prefix>p/b/</Prefix></CommonPrefixes>' +
    '<Contents><Key>p/x.txt</Key><Size>100</Size><LastModified>2026-06-01T00:00:00Z</LastModified></Contents>' +
    '<Contents><Key>p/y.txt</Key><Size>200</Size><LastModified>2026-06-02T00:00:00Z</LastModified></Contents>' +
    '</ListBucketResult>';
var m = parseXmlToJson(MULTI);
check('multi: 4 entries total', m.entries.length, 4);
check('multi: first dir', m.entries[0].name, 'a');
check('multi: second dir', m.entries[1].name, 'b');
check('multi: first file', m.entries[2].name, 'x.txt');
check('multi: second file', m.entries[3].name, 'y.txt');

// XML entities in key names are decoded by xml.parse
var ENTITIES = '<ListBucketResult><Prefix></Prefix><IsTruncated>false</IsTruncated>' +
    '<Contents><Key>file &amp; "name".txt</Key><Size>1</Size><LastModified>2026-01-01T00:00:00Z</LastModified></Contents>' +
    '</ListBucketResult>';
var ent = parseXmlToJson(ENTITIES);
check('xml entities decoded in key', ent.entries[0].name, 'file & "name".txt');

// Backslash in key (not an XML entity — must pass through for valid JSON)
var BACKSLASH = '<ListBucketResult><Prefix></Prefix><IsTruncated>false</IsTruncated>' +
    '<Contents><Key>path\\to\\file.txt</Key><Size>1</Size><LastModified>2026-01-01T00:00:00Z</LastModified></Contents>' +
    '</ListBucketResult>';
var bs = parseXmlToJson(BACKSLASH);
check('backslash preserved in key', bs.entries[0].name, 'path\\to\\file.txt');
var bsJson = JSON.parse(JSON.stringify(bs));
check('backslash survives JSON round-trip', bsJson.entries[0].name, 'path\\to\\file.txt');

// --- buildHref ---

check('href encodes each segment', buildHref('', 'dir 1/a b.txt'), '/dir%201/a%20b.txt');
check('href keeps slashes', buildHref('', 'a/b/c'), '/a/b/c');
check('href applies root prefix', buildHref('root/', 'a b'), '/root/a%20b');
check('href with leading slash prefix does not double-slash', buildHref('/files', 'a/b'), '/files/a/b');

// --- wantsJson ---

function mockReq(accept) { return { headersIn: { 'Accept': accept } }; }

check('exact application/json', wantsJson(mockReq('application/json')), true);
check('json with charset', wantsJson(mockReq('application/json; charset=utf-8')), true);
check('json among others', wantsJson(mockReq('text/html, application/json, */*')), true);
check('no accept header', wantsJson({ headersIn: {} }), false);
check('text/html only', wantsJson(mockReq('text/html')), false);
check('q=0 rejects json', wantsJson(mockReq('application/json;q=0')), false);
check('q=0.0 rejects json', wantsJson(mockReq('application/json; q=0.0')), false);
check('q=0.5 accepts json', wantsJson(mockReq('application/json;q=0.5')), true);
check('application/jsonx not matched', wantsJson(mockReq('application/jsonx')), false);

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
if (failures) { throw new Error(failures + ' test(s) failed'); }
