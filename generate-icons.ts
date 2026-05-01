// Generates simple placeholder PNG icons using raw PNG encoding
// Each icon is a solid #1A1A1A square with a white "F" letter

function createPNG(size: number): Uint8Array {
  const { deflateSync } = require("zlib");

  const channels = 3; // RGB
  // Build raw image data: each row = filter byte (0) + RGB pixels
  const rowSize = size * channels;
  const raw = new Uint8Array((1 + rowSize) * size);

  // Background color: #1A1A1A
  const bg = [0x1a, 0x1a, 0x1a];
  // Letter color: #FFFFFF
  const fg = [0xff, 0xff, 0xff];

  // Fill background
  for (let y = 0; y < size; y++) {
    raw[y * (1 + rowSize)] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const off = y * (1 + rowSize) + 1 + x * channels;
      raw[off] = bg[0];
      raw[off + 1] = bg[1];
      raw[off + 2] = bg[2];
    }
  }

  // Draw a simple "F" shape relative to icon size
  // Scale strokes to size
  const margin = Math.round(size * 0.2);
  const strokeW = Math.max(1, Math.round(size * 0.12));
  const top = margin;
  const bottom = size - margin;
  const left = margin;
  const right = size - margin;
  const mid = Math.round(size * 0.5);
  const crossEnd = Math.round(size * 0.68);

  function fillRect(x1: number, y1: number, x2: number, y2: number) {
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const off = y * (1 + rowSize) + 1 + x * channels;
        raw[off] = fg[0];
        raw[off + 1] = fg[1];
        raw[off + 2] = fg[2];
      }
    }
  }

  // Vertical stem
  fillRect(left, top, left + strokeW, bottom);
  // Top horizontal bar
  fillRect(left, top, right, top + strokeW);
  // Middle horizontal bar
  fillRect(left, mid - Math.floor(strokeW / 2), crossEnd, mid + Math.ceil(strokeW / 2));

  const compressed = deflateSync(raw, { level: 9 });

  // PNG helpers
  function adler32(buf: Uint8Array): number {
    let s1 = 1, s2 = 0;
    for (let i = 0; i < buf.length; i++) {
      s1 = (s1 + buf[i]) % 65521;
      s2 = (s2 + s1) % 65521;
    }
    return (s2 << 16) | s1;
  }

  function crc32(buf: Uint8Array): number {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u32be(n: number): Uint8Array {
    return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
  }

  function chunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    const crcInput = new Uint8Array(typeBytes.length + data.length);
    crcInput.set(typeBytes);
    crcInput.set(data, typeBytes.length);
    const crcVal = crc32(crcInput);
    const out = new Uint8Array(4 + 4 + data.length + 4);
    out.set(u32be(data.length), 0);
    out.set(typeBytes, 4);
    out.set(data, 8);
    out.set(u32be(crcVal), 8 + data.length);
    return out;
  }

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(size), 0);
  ihdr.set(u32be(size), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - we need to wrap in zlib format
  // zlib header: 0x78 0x9c + deflate data + adler32
  const adler = adler32(raw);
  const zlibData = new Uint8Array(2 + compressed.length + 4);
  zlibData[0] = 0x78;
  zlibData[1] = 0x9c;
  zlibData.set(compressed, 2);
  zlibData.set(u32be(adler), 2 + compressed.length);

  const ihdrChunk = chunk("IHDR", ihdr);
  const idatChunk = chunk("IDAT", zlibData);
  const iendChunk = chunk("IEND", new Uint8Array(0));

  const total = sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of [sig, ihdrChunk, idatChunk, iendChunk]) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

for (const size of [16, 48, 128]) {
  const png = createPNG(size);
  await Bun.write(`icons/icon${size}.png`, png);
  console.log(`Generated icons/icon${size}.png`);
}
