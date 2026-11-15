// Serves z/x/y tiles (rows from the top) from a COG built with TILING_SCHEME=WorldCRS84Quad
// and ALIGNED_LEVELS covering every served level: one COG per <layer>/<z>.tif. Each tile's
// bytes are a complete WebP image, so a tile is one byte-range read. Ranges go back through
// this gateway (location /) to reuse S3 signing, auth and its slice cache.

const GATEWAY = "http://127.0.0.1:8080";
const LEVEL0_RES = 0.703125;
const HEADER_PROBE = 65536;
const TAG = { width: 256, height: 257, tileWidth: 322, tileHeight: 323, offsets: 324, counts: 325, pixelScale: 33550, tiePoint: 33922 };
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 11: 4, 12: 8, 16: 8 };

async function readRange(key, pos, len) {
  const res = await ngx.fetch(`${GATEWAY}/${key}`, { headers: { Range: `bytes=${pos}-${pos + len - 1}` } });
  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`range ${pos}+${len} of ${key}: HTTP ${res.status}`);
  }
  const body = await res.arrayBuffer();
  return new DataView(body);
}

function readUint(view, pos, size) {
  if (size === 2) return view.getUint16(pos, true);
  if (size === 4) return view.getUint32(pos, true);
  return view.getUint32(pos, true) + view.getUint32(pos + 4, true) * 2 ** 32;
}

// Parses each IFD's entries (not its arrays) into what tile lookups need, so the cached index
// stays a few hundred bytes per level however large the file is.
async function parseHeader(key) {
  let head = await readRange(key, 0, HEADER_PROBE);
  if (head.getUint16(0, true) !== 0x4949) throw new Error(`${key}: only little-endian TIFF is supported`);
  const big = head.getUint16(2, true) === 43;
  const word = big ? 8 : 4;
  const at = async (pos, len) => {
    if (pos + len > head.byteLength) head = await readRange(key, 0, pos + len);
    return head;
  };

  const levels = [];
  let ifdPos = readUint(head, big ? 8 : 4, word);
  while (ifdPos) {
    const countSize = big ? 8 : 2;
    const entrySize = big ? 20 : 12;
    const countView = await at(ifdPos, countSize);
    const n = readUint(countView, ifdPos, countSize);
    const view = await at(ifdPos, countSize + n * entrySize + word);
    const tags = {};
    for (let i = 0; i < n; i++) {
      const e = ifdPos + countSize + i * entrySize;
      const typeSize = TYPE_SIZE[view.getUint16(e + 2, true)] || 1;
      const count = readUint(view, e + 4, word);
      const inline = count * typeSize <= word;
      tags[view.getUint16(e, true)] = { typeSize, count, pos: inline ? e + 4 + word : readUint(view, e + 4 + word, word), inline };
    }
    const value = (tag) => readUint(view, tags[tag].pos, tags[tag].typeSize);
    levels.push({
      width: value(TAG.width), height: value(TAG.height), tileWidth: value(TAG.tileWidth), tileHeight: value(TAG.tileHeight),
      offsets: { pos: tags[TAG.offsets].pos, size: tags[TAG.offsets].typeSize },
      counts: { pos: tags[TAG.counts].pos, size: tags[TAG.counts].typeSize },
      geo: tags[TAG.pixelScale] && tags[TAG.tiePoint] ? { scale: tags[TAG.pixelScale].pos, tie: tags[TAG.tiePoint].pos } : null,
    });
    ifdPos = readUint(view, ifdPos + countSize + n * entrySize, word);
  }

  const geo = levels[0].geo;
  const view = await at(Math.max(geo.scale + 8, geo.tie + 40), 8);
  const resolution = view.getFloat64(geo.scale, true);
  const maxZoom = Math.round(Math.log2(LEVEL0_RES / resolution));
  if (Math.abs(LEVEL0_RES / 2 ** maxZoom - resolution) > resolution * 1e-6 || levels[0].tileWidth !== 256) {
    throw new Error(`${key}: not on the WorldCRS84 grid (resolution ${resolution}, tile ${levels[0].tileWidth})`);
  }
  return {
    maxZoom,
    west: view.getFloat64(geo.tie + 24, true),
    north: view.getFloat64(geo.tie + 32, true),
    levels: levels.map((l) => ({ width: l.width, height: l.height, offsets: l.offsets, counts: l.counts })),
  };
}

async function getIndex(key) {
  const cached = ngx.shared.cogheaders.get(key);
  if (cached) return JSON.parse(cached);
  const index = await parseHeader(key);
  ngx.shared.cogheaders.set(key, JSON.stringify(index));
  return index;
}

async function tile(r) {
  const key = r.variables.cog_key;
  const z = Number(r.variables.tile_z);
  const x = Number(r.variables.tile_x);
  const y = Number(r.variables.tile_y);
  try {
    const index = await getIndex(key);
    const level = index.levels[index.maxZoom - z];
    if (!level) return r.return(404);
    const tileDeg = 180 / 2 ** z;
    const col = x - Math.round((index.west + 180) / tileDeg);
    const row = y - Math.round((90 - index.north) / tileDeg);
    const across = Math.ceil(level.width / 256);
    if (col < 0 || row < 0 || col >= across || row >= Math.ceil(level.height / 256)) return r.return(404);
    const i = row * across + col;
    const entries = await Promise.all([
      readRange(key, level.offsets.pos + i * level.offsets.size, level.offsets.size),
      readRange(key, level.counts.pos + i * level.counts.size, level.counts.size),
    ]);
    const offset = readUint(entries[0], 0, level.offsets.size);
    const count = readUint(entries[1], 0, level.counts.size);
    // SPARSE_OK leaves tiles with no data unwritten: offset and count are 0.
    if (!count) return r.return(404);
    const body = await readRange(key, offset, count);
    r.headersOut["Content-Type"] = "image/webp";
    r.return(200, Buffer.from(body.buffer));
  } catch (e) {
    r.error(e.message);
    r.return(502);
  }
}

export default { tile };
