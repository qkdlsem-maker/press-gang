const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
sharp.cache(false);
sharp.concurrency(2);
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_PIXELS = 80_000_000;
const options = { limitInputPixels: MAX_PIXELS, failOn: 'warning' };

async function inspect(input) {
  const m = await sharp(input, options).metadata();
  if (!['jpeg', 'png', 'webp'].includes(m.format)) throw new Error('JPG, PNG, WebP 이미지만 받습니다.');
  if ((m.pages || 1) > 1) throw new Error('움직이는 이미지는 아직 받지 않습니다. 정지 이미지를 맡겨주세요.');
  return m;
}
async function readImage(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_BYTES || stat.size === 0) throw new Error('0바이트 초과, 100MB 이하의 이미지 파일을 맡겨주세요.');
  const input = await fs.readFile(filePath);
  const metadata = await inspect(input);
  return { input, metadata };
}
async function compress(input, config, progress = () => {}, cancelled = () => false) {
  if (!Buffer.isBuffer(input) || input.length > MAX_BYTES) throw new Error('입력 파일이 너무 큽니다.');
  const target = Math.floor(Number(config.targetBytes));
  if (!Number.isFinite(target) || target < 10_000 || target > MAX_BYTES) throw new Error('목표는 10KB부터 100MB까지 입력해주세요.');
  if (!['auto', 'jpeg', 'webp'].includes(config.format)) throw new Error('지원하지 않는 출력 형식입니다.');
  const m = await inspect(input);
  const rotated = m.orientation >= 5 && m.orientation <= 8;
  const originalWidth = rotated ? m.height : m.width;
  const originalHeight = rotated ? m.width : m.height;
  const format = config.format === 'auto' ? (m.hasAlpha ? 'webp' : 'jpeg') : config.format;
  const minQuality = config.careful === false ? 35 : 55;
  let attempt = 0;
  let smallest;
  const check = () => { if (cancelled()) { const e = new Error('작업을 취소했습니다.'); e.code = 'CANCELLED'; throw e; } };
  check();
  if (input.length <= target && config.format === 'auto') {
    return { buffer: input, format: m.format, width: originalWidth, height: originalHeight, quality: null, reached: true, unchanged: true, resized: false, flattened: false, attempts: 0 };
  }
  const encode = async (width, quality) => {
    check();
    progress({ stage: width < originalWidth ? 'resize' : 'compress', attempt: ++attempt, quality, width });
    let pipeline = sharp(input, options).rotate().resize({ width, withoutEnlargement: true });
    if (format === 'jpeg') pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
    else pipeline = pipeline.webp({ quality, effort: 4, alphaQuality: 100 });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    check();
    const result = { buffer: data, format, width: info.width, height: info.height, quality, reached: data.length <= target, resized: info.width !== originalWidth || info.height !== originalHeight, flattened: !!m.hasAlpha && format === 'jpeg', unchanged: false, attempts: attempt };
    if (!smallest || data.length < smallest.buffer.length) smallest = result;
    return result;
  };
  let width = originalWidth;
  for (let round = 0; round < 18; round++) {
    const floor = await encode(width, minQuality);
    if (floor.reached) {
      let best = floor, lo = minQuality + 1, hi = 94;
      while (lo <= hi) {
        const quality = Math.floor((lo + hi) / 2);
        const result = await encode(width, quality);
        if (result.reached) { best = result; lo = quality + 1; }
        else hi = quality - 1;
      }
      progress({ stage: 'check', attempt });
      return { ...best, attempts: attempt };
    }
    if (!config.allowResize || width <= Math.min(originalWidth, 128)) break;
    const ratio = Math.min(0.88, Math.max(0.45, Math.sqrt(target / floor.buffer.length) * 0.92));
    const next = Math.max(Math.min(originalWidth, 128), Math.floor(width * ratio));
    if (next === width) break;
    width = next;
  }
  progress({ stage: 'check', attempt });
  if (config.format === 'auto' && input.length <= smallest.buffer.length) {
    return { buffer: input, format: m.format, width: originalWidth, height: originalHeight, quality: null, reached: input.length <= target, unchanged: true, resized: false, flattened: false, attempts: attempt };
  }
  return { ...smallest, attempts: attempt };
}
async function saveUnique(buffer, directory, name, format, suffix = '압축') {
  const extension = format === 'jpeg' ? 'jpg' : format;
  const stem = path.parse(path.basename(name)).name.slice(0, 120) + '-' + (suffix === 'compressed' ? 'compressed' : '압축');
  for (let n = 0; n < 1000; n++) {
    const dest = path.join(directory, `${stem}${n ? ` (${n})` : ''}.${extension}`);
    let handle;
    try {
      handle = await fs.open(dest, 'wx');
      await handle.writeFile(buffer);
      await handle.sync();
      await handle.close();
      return dest;
    } catch (e) {
      if (handle) { await handle.close().catch(() => {}); await fs.unlink(dest).catch(() => {}); }
      if (e.code === 'EEXIST') continue;
      throw e;
    }
  }
  throw new Error('같은 이름의 결과가 너무 많습니다. 다른 폴더를 선택해주세요.');
}
module.exports = { compress, inspect, readImage, saveUnique, MAX_BYTES, MAX_PIXELS };
