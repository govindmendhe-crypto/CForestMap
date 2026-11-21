import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function generatePng(width, height, isMaskable = false) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0
  const rowBytes = width * 4;
  const rawData = Buffer.alloc((rowBytes + 1) * height);

  const cx = width / 2;
  const cy = height / 2;
  const outerR = (width / 2) * (isMaskable ? 0.98 : 0.88);
  const innerR = outerR * 0.45;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowBytes + 1);
    rawData[rowOffset] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      // Forest Deep Green base (#064e3b -> #022c22)
      let r = 6;
      let g = 78;
      let b = 59;
      let a = 255;

      // Darker border vignette
      const diag = (x + y) / (width + height);
      r = Math.round(r * (1 - diag * 0.3));
      g = Math.round(g * (1 - diag * 0.3));
      b = Math.round(b * (1 - diag * 0.3));

      // Grid line pattern
      const gridStep = width / 8;
      if (Math.abs(x % gridStep) < 2 || Math.abs(y % gridStep) < 2) {
        g = Math.min(255, g + 40);
        r = Math.min(255, r + 20);
        b = Math.min(255, b + 25);
      }

      // Red baseline across middle
      if (Math.abs(y - cy) < 4) {
        r = 239;
        g = 68;
        b = 68;
      }

      // Compass ring
      if (Math.abs(dist - innerR) < 3) {
        r = 251;
        g = 191;
        b = 36; // Amber gold
      }

      // North arrow needle
      if (dist < innerR && y < cy) {
        const needleW = (innerR - (cy - y)) * 0.35;
        if (Math.abs(dx) <= needleW) {
          r = 220;
          g = 38;
          b = 38; // Red needle
        }
      }

      // South arrow needle
      if (dist < innerR && y >= cy) {
        const needleW = (innerR - (y - cy)) * 0.35;
        if (Math.abs(dx) <= needleW) {
          r = 226;
          g = 232;
          b = 240; // Silver needle
        }
      }

      // Outer border circle or rounded rect
      if (dist > outerR) {
        if (!isMaskable) {
          a = 0;
        }
      } else if (Math.abs(dist - outerR) < 2) {
        r = 52;
        g = 211;
        b = 153; // Emerald border
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const idatData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', idatData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePng(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePng(180, 180, false));
console.log('PNG Icons successfully generated in /public!');
