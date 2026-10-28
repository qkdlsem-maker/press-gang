const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  await fs.mkdir(path.join(root, 'samples'), { recursive: true });
  const svg = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="244" height="244" rx="52" fill="#282b26"/><g transform="rotate(-7 128 115)"><path d="M43 70h70l-6 83H57zm100 0h70l-14 83h-50z" fill="#f7f7f2"/><path d="M109 91h38" stroke="#f7f7f2" stroke-width="14"/><path d="m63 85 28 40m71-40 28 40" stroke="#282b26" stroke-width="7"/></g><path d="M91 187q37 20 74-5" fill="none" stroke="#ec562b" stroke-width="11" stroke-linecap="round"/></svg>`;
  await fs.writeFile(path.join(root, 'assets/icon.svg'), svg);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(path.join(root, 'assets/icon.png'), png);
  const head = Buffer.alloc(22); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4); head[6] = 0; head[7] = 0; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  await fs.writeFile(path.join(root, 'assets/icon.ico'), Buffer.concat([head, png]));
  const width = 2400, height = 1600;
  let trees = '';
  for (let i = 0; i < 58; i++) { const x = (i * 157 + 91) % 2400, y = 870 + (i * 131) % 490, s = 60 + (i * 17) % 110; trees += `<path d="M${x} ${y}l${-s / 2} ${s}h${s}z" fill="${i % 2 ? '#254e42' : '#41694b'}"/><path d="M${x} ${y + s}v${s / 3}" stroke="#334d36" stroke-width="9"/>`; }
  const landscape = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="#ecc8a1"/><stop offset="1" stop-color="#f6e5bf"/></linearGradient><linearGradient id="w" x2="0" y2="1"><stop stop-color="#b5cfc0"/><stop offset="1" stop-color="#589d92"/></linearGradient></defs><rect width="2400" height="1600" fill="url(#s)"/><circle cx="1750" cy="350" r="165" fill="#e48151"/><path d="M0 870L420 340l310 390L1120 210l500 610 400-430 380 470v500H0z" fill="#94a890"/><path d="M0 950l580-460 410 500 500-430 610 500 300-270v810H0z" fill="#54775f"/><path d="M0 1160q400-260 730-60t780 20 890 70v410H0z" fill="url(#w)"/><path d="M0 1100q340-140 730 0l-140 500H0zM2400 1100q-420-110-760 50l340 450h420z" fill="#738e5c"/>${trees}<path d="M1110 1300l230 0-50 35h-140z" fill="#bb5d36"/><path d="M1215 1280v-80" stroke="#f4d59b" stroke-width="8"/><circle cx="1215" cy="1270" r="19" fill="#25382f"/><text x="110" y="180" font-family="sans-serif" font-size="65" font-weight="bold" letter-spacing="15" fill="#294e3e">A LITTLE LIGHTER.</text><text x="115" y="250" font-family="sans-serif" font-size="27" letter-spacing="8" fill="#54735a">ORIGINAL DEMO ART / PRESS GANG</text></svg>`;
  const raw = await sharp(Buffer.from(landscape)).removeAlpha().raw().toBuffer(); let seed = 42;
  for (let i = 0; i < raw.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; raw[i] = Math.max(0, Math.min(255, raw[i] + ((seed >>> 25) - 64) * 0.22)); }
  await sharp(raw, { raw: { width, height, channels: 3 } }).png().toFile(path.join(root, 'samples/무거운-휴가사진.png'));
  console.log('Original icon and demo image created.');
})().catch(e => { console.error(e); process.exit(1); });
