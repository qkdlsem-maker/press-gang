const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const site = path.resolve(root, '../press-gang-site/public');
const version = require('../package.json').version;
(async () => {
  await fs.mkdir(site, { recursive: true });
  const card = (small, headline, line, sub) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1264" height="842"><rect width="1264" height="842" fill="#f7f7f2"/><text x="85" y="142" fill="#78816d" font-family="Malgun Gothic" font-size="20" font-weight="bold" letter-spacing="3">${small}</text><text x="80" y="320" fill="#282b26" font-family="Malgun Gothic" font-size="84" font-weight="bold">${headline}</text><text x="80" y="438" fill="#df4826" font-family="Malgun Gothic" font-size="72" font-weight="bold">${line}</text><text x="85" y="542" fill="#78816d" font-family="Malgun Gothic" font-size="23">${sub}</text><path d="M85 697h1094" stroke="#282b26"/><text x="85" y="755" fill="#282b26" font-family="Malgun Gothic" font-size="24" font-weight="bold">압축깡패</text><text x="1179" y="755" fill="#78816d" font-family="Malgun Gothic" font-size="16" text-anchor="end">PRESS GANG / ${version}</text></svg>`);
  await sharp(card('PRESS GANG EXPRESS', '복사한 사진,', '붙여넣고 출고.', '2.0 실제 앱 녹화 · 붙여넣기 → 압축 → 비교 → 파일 복사')).png().toFile(path.join(root, 'captures/intro.png'));
  const recording = JSON.parse(await fs.readFile(path.join(root, 'captures/recording.json'), 'utf8'));
  await sharp(card('붙여넣은 샘플 이미지 실제 처리 결과', `${(recording.sourceBytes / 1e6).toFixed(2)}MB → ${Math.round(recording.outputBytes / 1000)}KB`, '배송 준비 끝.', '파일 복사 후 Ctrl+V · 파일 붙여넣기를 지원하는 앱에서 사용')).png().toFile(path.join(root, 'captures/outro.png'));
  const installerName = `PressGang-Setup-${version}-x64.exe`;
  const buffer = await fs.readFile(path.join(root, 'release', installerName));
  const chunks = [];
  for (let offset = 0, n = 0; offset < buffer.length; offset += 5 * 1024 * 1024, n++) {
    const part = buffer.subarray(offset, Math.min(offset + 5 * 1024 * 1024, buffer.length));
    const filename = `download/press-gang-${version}-${n}.bin`;
    await fs.mkdir(path.join(site, 'download'), { recursive: true });
    await fs.writeFile(path.join(site, filename), part);
    chunks.push({ url: filename, bytes: part.length, sha256: createHash('sha256').update(part).digest('hex') });
  }
  const manifest = { version, filename: installerName, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), signed: false, chunks };
  // Stage the installer before promoting the public download manifest.
  await fs.writeFile(path.join(site, '../pending-release.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(root, 'release/SHA256SUMS.txt'), `${manifest.sha256}  ${installerName}\n`);
  console.log(JSON.stringify({ bytes: manifest.bytes, chunks: chunks.length, sha256: manifest.sha256 }));
})().catch(e => { console.error(e); process.exit(1); });
