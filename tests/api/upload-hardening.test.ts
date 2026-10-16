import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import app from '../../apps/api/src/server';
import {
  imageOnlyUpload,
  processImageBuffer,
  UPLOAD_DIR,
} from '../../apps/api/src/services/storage.service';

// A tiny app wired the way the profile / offer / project-image routes are:
// image-only multer filter, then a sharp re-encode, errors via statusCode.
const uploadApp = express();
uploadApp.post('/upload', imageOnlyUpload.single('image') as any, async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
  try {
    const { processedBuffer, filename } = await processImageBuffer(req.file.buffer);
    return res.status(201).json({ filename, bytes: processedBuffer.length });
  } catch {
    return res.status(400).json({ error: 'That file is not a valid image.' });
  }
});
uploadApp.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message });
});

describe('upload hardening - image-only filter + re-encode', () => {
  let png: Buffer;
  beforeAll(async () => {
    png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer();
  });

  it('rejects an .html file', async () => {
    const res = await request(uploadApp)
      .post('/upload')
      .attach('image', Buffer.from('<script>alert(1)</script>'), {
        filename: 'x.html',
        contentType: 'text/html',
      });
    expect(res.status).toBe(400);
  });

  it('rejects an .svg file', async () => {
    const res = await request(uploadApp)
      .post('/upload')
      .attach(
        'image',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'),
        {
          filename: 'x.svg',
          contentType: 'image/svg+xml',
        },
      );
    expect(res.status).toBe(400);
  });

  it('rejects HTML disguised with a .png name and image/png type (re-encode catches it)', async () => {
    const res = await request(uploadApp)
      .post('/upload')
      .attach('image', Buffer.from('<html><script>alert(1)</script></html>'), {
        filename: 'x.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
  });

  it('rejects a real PNG sent with a .html extension', async () => {
    const res = await request(uploadApp)
      .post('/upload')
      .attach('image', png, { filename: 'x.html', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('accepts a real PNG and stores it under a server-made .webp name', async () => {
    const res = await request(uploadApp)
      .post('/upload')
      .attach('image', png, { filename: 'evil-name.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.filename).toMatch(/^[0-9a-f-]{36}\.webp$/);
  });
});

describe('/uploads response headers', () => {
  const dir = path.join(UPLOAD_DIR, 'profiles');
  const htmlName = `__audit-test-${process.pid}.html`;
  const pngName = `__audit-test-${process.pid}.png`;

  beforeAll(async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, htmlName), '<script>alert(1)</script>');
    fs.writeFileSync(
      path.join(dir, pngName),
      await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
        .png()
        .toBuffer(),
    );
  });
  afterAll(() => {
    for (const n of [htmlName, pngName]) fs.rmSync(path.join(dir, n), { force: true });
  });

  it('sends nosniff and a sandbox CSP on every upload', async () => {
    const res = await request(app).get(`/uploads/profiles/${pngName}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain('sandbox');
  });

  it('forces a legacy .html upload to download instead of rendering', async () => {
    const res = await request(app).get(`/uploads/profiles/${htmlName}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not force images to download', async () => {
    const res = await request(app).get(`/uploads/profiles/${pngName}`);
    expect(res.headers['content-disposition']).toBeUndefined();
  });
});
