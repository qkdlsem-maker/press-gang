const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { compress, saveUnique, readImage } = require('../app/compress.cjs');
let temp, photo, alpha;
const config = { targetBytes: 50_000, format: 'auto', allowResize: true, careful: true };
before(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'press-gang-test-'));
  const pixels = Buffer.alloc(1200 * 800 * 3); let seed = 5;
  for (let i = 0; i < pixels.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; pixels[i] = seed >>> 24; }
  photo = await sharp(pixels, { raw: { width: 1200, height: 800, channels: 3 } }).png().toBuffer();
  alpha = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 20, g: 40, b: 100, alpha: 0.5 } } }).png().toBuffer();
});
after(() => fs.rm(temp, { recursive: true, force: true }));
test('actually meets byte target and decodes; never changes source buffer', async () => {
  const before = Buffer.from(photo), progress = [];
  const r = await compress(photo, config, p => progress.push(p));
  assert.ok(r.buffer.length <= config.targetBytes); assert.ok(r.reached); assert.deepEqual(photo, before);
  const m = await sharp(r.buffer).metadata(); assert.equal(m.format, 'jpeg'); assert.equal(m.width, r.width); assert.ok(progress.length > 1);
});
test('small auto files are returned byte-for-byte', async () => { const r = await compress(alpha, config); assert.ok(r.unchanged); assert.deepEqual(r.buffer, alpha); assert.equal(r.format, 'png'); });
test('explicit WebP preserves transparency', async () => { const r = await compress(alpha, { ...config, format: 'webp' }); assert.equal((await sharp(r.buffer).metadata()).hasAlpha, true); });
test('explicit JPG reports flattened transparency', async () => { const r = await compress(alpha, { ...config, format: 'jpeg' }); assert.ok(r.flattened); assert.equal((await sharp(r.buffer).metadata()).hasAlpha, false); });
test('no-resize cannot silently resize to claim success', async () => { const r = await compress(photo, { ...config, targetBytes: 10_000, allowResize: false }); assert.equal(r.width, 1200); assert.equal(r.height, 800); assert.equal(r.reached, false); });
test('invalid limits, formats and corrupt inputs fail', async () => {
  await assert.rejects(compress(photo, { ...config, targetBytes: -1 }));
  await assert.rejects(compress(photo, { ...config, format: 'svg' }));
  await assert.rejects(compress(Buffer.from('broken'), config));
  await assert.rejects(compress(photo, { ...config, targetBytes: Infinity }));
});
test('cancellation stops before an encode', async () => { await assert.rejects(compress(photo, config, () => {}, () => true), { code: 'CANCELLED' }); });
test('orientation is applied and metadata stripped after conversion', async () => {
  const oriented = await sharp({ create: { width: 320, height: 180, channels: 3, background: 'red' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const r = await compress(oriented, { ...config, format: 'jpeg' });
  assert.equal(r.width, 180); assert.equal(r.height, 320); assert.equal((await sharp(r.buffer).metadata()).orientation, undefined);
});
test('Korean names and collisions preserve existing files and outputs', async () => {
  const first = await saveUnique(alpha, temp, '사진 테스트.png', 'png');
  const second = await saveUnique(photo, temp, '사진 테스트.png', 'png');
  assert.notEqual(first, second); assert.deepEqual(await fs.readFile(first), alpha); assert.deepEqual(await fs.readFile(second), photo);
  assert.equal((await readImage(first)).metadata.format, 'png');
});
test('animated WebP is rejected, not silently reduced to one frame', async () => {
  const pixels = Buffer.alloc(30 * 60 * 3); for (let i = 0; i < 1800; i++) pixels[i * 3 + (i < 900 ? 0 : 2)] = 255;
  const animated = await sharp(pixels, { raw: { width: 30, height: 60, channels: 3, pageHeight: 30 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  const m = await sharp(animated).metadata(); if (m.pages > 1) await assert.rejects(compress(animated, config), /움직이는/); else assert.fail('animated fixture must contain multiple pages');
});
