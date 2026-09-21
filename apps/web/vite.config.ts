import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crcVal = crc32(buf.subarray(4, 4 + 4 + len));
  buf.writeUInt32BE(crcVal, 4 + 4 + len);
  return buf;
}

function generatePngBuffer(width: number, height: number, r: number, g: number, b: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const isInnerGold =
        x >= width * 0.35 && x <= width * 0.65 && y >= height * 0.35 && y <= height * 0.65;
      const isInnerWhite =
        x >= width * 0.42 && x <= width * 0.58 && y >= height * 0.42 && y <= height * 0.58;

      if (isInnerWhite) {
        rawData[pxOffset] = 255;
        rawData[pxOffset + 1] = 255;
        rawData[pxOffset + 2] = 255;
      } else if (isInnerGold) {
        rawData[pxOffset] = 217;
        rawData[pxOffset + 1] = 119;
        rawData[pxOffset + 2] = 6;
      } else {
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
      }
      rawData[pxOffset + 3] = 255;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function pwaIconsPlugin(): Plugin {
  return {
    name: 'pwa-icons-generator',
    buildStart() {
      const publicDir = path.resolve(__dirname, 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filesToGenerate: Record<string, number> = {
        'apple-touch-icon.png': 180,
        'pwa-192x192.png': 192,
        'pwa-512x512.png': 512,
        'icon-192.png': 192,
        'icon-512.png': 512,
      };

      for (const [filename, size] of Object.entries(filesToGenerate)) {
        const filePath = path.join(publicDir, filename);
        if (!fs.existsSync(filePath)) {
          const buf = generatePngBuffer(size, size, 15, 118, 110);
          fs.writeFileSync(filePath, buf);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    pwaIconsPlugin(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): we drive the update ourselves via
      // useSwUpdate/UpdateAvailableBanner (virtual:pwa-register/react) so a
      // new SW sits in `waiting` and only activates on an explicit user
      // click or the hook's own grace-period fallback -- 'autoUpdate' would
      // force-reload every open tab the instant a new SW is found, with no
      // button and no grace period.
      registerType: 'prompt',
      // We register manually via useRegisterSW in code (see useSwUpdate.ts)
      // instead of letting the plugin inject its own self-registering
      // <script> into index.html, which would race our own registration.
      injectRegister: false,
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'masked-icon.svg',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'icon-192.png',
        'icon-512.png',
      ],
      // The 'generateSW' strategy (this plugin's default) replaces dist/sw.js
      // with a wholly auto-generated Workbox file on every build — a
      // hand-written service worker in public/sw.js would just get
      // overwritten and never ship. importScripts is generateSW's supported
      // way to pull in extra script content (here: push-notifications-sw.js,
      // just the push/notificationclick handlers) via an `importScripts()`
      // call inside the generated worker, without switching to the more
      // invasive 'injectManifest' strategy and re-deriving the whole
      // precache/routing setup by hand.
      workbox: {
        importScripts: ['push-notifications-sw.js'],
      },
      manifest: {
        name: 'RS CRM',
        short_name: 'RS CRM',
        description: 'Employee Management System & CRM for Radha Real Homes',
        theme_color: '#0f766e',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
