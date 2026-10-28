const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { clipboard, ClipboardItem } = require('electron');
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(r => setTimeout(r, ms));
exports.run = async ({ win, importFiles, saveItems, files }) => {
  const language = process.env.PRESSGANG_LANG === 'en' ? 'en' : 'ko';
  const out = path.join(root, 'captures', require('../package.json').version, language); await fs.mkdir(out, { recursive: true });
  const js = code => win.webContents.executeJavaScript(code);
  win.setContentSize(1264, 842);
  await pause(400);
  await js(`changeLanguage(${JSON.stringify(language)})`);
  const output = path.join(out, 'press-gang-demo.mp4');
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', '20', '-vcodec', 'png', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let ffError = ''; ff.stderr.on('data', b => ffError += b.toString());
  let finished = false, frames = 0;
  const snapshot = [];
  for (const entry of await clipboard.read()) { const data = {}; for (const type of entry.types) data[type] = await entry.getType(type); snapshot.push(new ClipboardItem(data)); }
  const capture = (async () => {
    while (!finished) {
      const start = Date.now(), png = (await win.webContents.capturePage()).toPNG();
      if (!ff.stdin.write(png)) await once(ff.stdin, 'drain');
      frames++; await pause(Math.max(1, 50 - (Date.now() - start)));
    }
    ff.stdin.end();
  })();
  try {
  await js("$('target').value=300; $('unit').value=1000; previousUnit=1000; settingsChanged();");
  await clipboard.write([new ClipboardItem({'image/png':new Blob([await fs.readFile(path.join(root,'samples/무거운-휴가사진.png'))],{type:'image/png'})})]);
  await pause(2200);
  await js('pasteFiles(true)');
  await pause(2000);
  for (let value = 50; value >= 15; value -= 2) { await js(`$('inline-slider').value=${value}; updateInlineSlider();`); await pause(35); }
  for (let value = 15; value <= 85; value += 2) { await js(`$('inline-slider').value=${value}; updateInlineSlider();`); await pause(35); }
  await pause(1200);
  await js(`document.getElementById('compare').click();`);
  await pause(1200);
  for (let value = 50; value >= 10; value -= 2) { await js(`document.getElementById('compare-slider').value=${value}; updateSlider();`); await pause(35); }
  for (let value = 10; value <= 90; value += 2) { await js(`document.getElementById('compare-slider').value=${value}; updateSlider();`); await pause(35); }
  await pause(1800);
  await js(`document.getElementById('compare-dialog').close();`);
  await js('copyResults([selected])');
  await pause(2200);
  const item = [...files.values()][0]; const saved = await saveItems([item.id], out);
  await fs.writeFile(path.join(out,'copy-result.png'),(await win.webContents.capturePage()).toPNG());
  await pause(1800);
  finished = true; await capture;
  const [code] = await once(ff, 'close'); if (code) throw new Error(ffError);
  await fs.writeFile(path.join(out, 'recording.json'), JSON.stringify({ frames, fps: 20, durationSeconds: frames / 20, sourceBytes: item.bytes, outputBytes: item.result.bytes, actualOutput: saved[0].name, realAppCapture: true }, null, 2));
  console.log(`Demo captured: ${frames / 20}s`);
  } finally { if(snapshot.length) await clipboard.write(snapshot); else clipboard.clear(); }
  win.close();
};
