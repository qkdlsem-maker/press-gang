const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
function ff(args) {
  const result = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {windowsHide:true,encoding:'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'FFmpeg failed');
}
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;');
async function card(file, eyebrow, title, line, note) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1264" height="842"><rect width="1264" height="842" fill="#f7f7f2"/><text x="84" y="142" fill="#78816d" font-family="Malgun Gothic" font-size="20" letter-spacing="3">${escape(eyebrow)}</text><text x="80" y="320" fill="#282b26" font-family="Malgun Gothic" font-size="76" font-weight="bold">${escape(title)}</text><text x="80" y="438" fill="#df4826" font-family="Malgun Gothic" font-size="68" font-weight="bold">${escape(line)}</text><text x="85" y="542" fill="#78816d" font-family="Malgun Gothic" font-size="22">${escape(note)}</text><path d="M85 697h1094" stroke="#282b26"/><text x="85" y="755" fill="#282b26" font-family="Malgun Gothic" font-size="24" font-weight="bold">PRESS GANG</text><text x="1179" y="755" fill="#78816d" font-family="Malgun Gothic" font-size="16" text-anchor="end">${version} · FREE BETA</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}
(async () => {
  const media = path.join(root,'docs','media'); await fs.mkdir(media,{recursive:true});
  for (const lang of ['ko','en']) {
    const dir = path.join(root,'captures',version,lang);
    const recording = JSON.parse(await fs.readFile(path.join(dir,'recording.json'),'utf8'));
    const intro = path.join(dir,'intro.png'), outro = path.join(dir,'outro.png');
    await card(intro, 'PRESS GANG / REAL APP DEMO', lang === 'ko' ? '복사한 사진,' : 'Paste it.', lang === 'ko' ? '붙여넣고 출고.' : 'Ship it.', lang === 'ko' ? '붙여넣기 → 압축 → 비교 → 파일 복사' : 'Paste → Compress → Compare → Copy the file');
    await card(outro, lang === 'ko' ? '샘플 이미지의 실제 결과' : 'ACTUAL RESULT / DEMO IMAGE', `${(recording.sourceBytes/1e6).toFixed(2)} MB → ${(recording.outputBytes/1000).toFixed(1)} KB`, lang === 'ko' ? '배송 준비 끝.' : 'Ready to ship.', lang === 'ko' ? '이미지와 설정에 따라 결과는 달라집니다. 원본은 무사합니다.' : 'Results vary by image and settings. Original untouched.');
    const output = path.join(root,'release',`PressGang-Demo-${lang}.mp4`);
    ff(['-i',path.join(dir,'press-gang-demo.mp4'),'-loop','1','-t','2','-i',intro,'-loop','1','-t','2.5','-i',outro,'-filter_complex','[1:v]fps=20,format=yuv420p,setsar=1[i];[0:v]fps=20,format=yuv420p,setsar=1[r];[2:v]fps=20,format=yuv420p,setsar=1[o];[i][r][o]concat=n=3:v=1:a=0[v]','-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','20','-movflags','+faststart',output]);
    await fs.copyFile(path.join(dir,'copy-result.png'),path.join(media,`app-${lang}.png`));
    console.log(JSON.stringify({language:lang,...recording,video:path.basename(output)}));
  }
  ff(['-ss','2','-t','12','-i',path.join(root,'release','PressGang-Demo-en.mp4'),'-filter_complex','fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4','-loop','0',path.join(media,'demo.gif')]);
})().catch(error => { console.error(error); process.exit(1); });
