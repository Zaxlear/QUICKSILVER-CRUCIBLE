import fs from 'node:fs';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Zero-dependency 8-bit PNG decoder (supports RGB, RGBA, Grayscale, Grayscale+Alpha, Indexed PLTE+tRNS).
 * Returns { width, height, data: Uint8Array (RGBA8888) }.
 */
export function decodePngFile(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid PNG signature in ${filePath}`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idatChunks = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0) {
        throw new Error(`Unsupported PNG bitDepth=${bitDepth} interlace=${interlace} in ${filePath}`);
      }
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      trns = data;
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bpp = channelsByType[colorType];
  if (!bpp) {
    throw new Error(`Unsupported PNG colorType=${colorType} in ${filePath}`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * bpp;
  const unfiltered = new Uint8Array(height * stride);

  for (let y = 0; y < height; y++) {
    const rowIn = y * (stride + 1);
    const filter = raw[rowIn];
    const rowOut = y * stride;
    const prevRowOut = (y - 1) * stride;

    for (let i = 0; i < stride; i++) {
      const xByte = raw[rowIn + 1 + i];
      const left = i >= bpp ? unfiltered[rowOut + i - bpp] : 0;
      const up = y > 0 ? unfiltered[prevRowOut + i] : 0;
      const upLeft = y > 0 && i >= bpp ? unfiltered[prevRowOut + i - bpp] : 0;

      let recon = xByte;
      if (filter === 1) recon = (xByte + left) & 0xff;
      else if (filter === 2) recon = (xByte + up) & 0xff;
      else if (filter === 3) recon = (xByte + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) recon = (xByte + paethPredictor(left, up, upLeft)) & 0xff;
      unfiltered[rowOut + i] = recon;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let px = 0; px < width * height; px++) {
    const dst = px * 4;
    if (colorType === 6) {
      const src = px * 4;
      rgba[dst] = unfiltered[src];
      rgba[dst + 1] = unfiltered[src + 1];
      rgba[dst + 2] = unfiltered[src + 2];
      rgba[dst + 3] = unfiltered[src + 3];
    } else if (colorType === 2) {
      const src = px * 3;
      rgba[dst] = unfiltered[src];
      rgba[dst + 1] = unfiltered[src + 1];
      rgba[dst + 2] = unfiltered[src + 2];
      rgba[dst + 3] = 255;
    } else if (colorType === 3) {
      const idx = unfiltered[px];
      rgba[dst] = palette[idx * 3];
      rgba[dst + 1] = palette[idx * 3 + 1];
      rgba[dst + 2] = palette[idx * 3 + 2];
      rgba[dst + 3] = trns && idx < trns.length ? trns[idx] : 255;
    } else if (colorType === 4) {
      const src = px * 2;
      rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = unfiltered[src];
      rgba[dst + 3] = unfiltered[src + 1];
    } else {
      rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = unfiltered[px];
      rgba[dst + 3] = 255;
    }
  }

  return { width, height, data: rgba };
}

function makeChunk(typeAscii, payloadBuf) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(payloadBuf.length, 0);
  const typeBuf = Buffer.from(typeAscii, 'ascii');
  const crcInput = Buffer.concat([typeBuf, payloadBuf]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

/**
 * Encodes RGBA8888 Uint8Array into a lossless non-interlaced PNG file.
 */
export function encodePngFile(filePath, width, height, rgbaData) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const rawScanlines = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const outRow = y * (stride + 1);
    rawScanlines[outRow] = 0; // Filter None
    const srcStart = y * stride;
    Buffer.from(rgbaData.buffer, rgbaData.byteOffset + srcStart, stride).copy(
      rawScanlines,
      outRow + 1
    );
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });
  const pngBuf = Buffer.concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, pngBuf);
}
