const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage, clipboard } = require('electron');
const { Worker } = require('node:worker_threads');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');
const { readImage, saveUnique } = require('./compress.cjs');
const { parseQuickArgs, readClipboardFiles, copyFiles, integration } = require('./workflow.cjs');
const { translate } = require('./ui/i18n.js');
let language = 'ko';
const t = key => translate(key, language);
const languageFile = () => path.join(app.getPath('userData'), 'language.json');
let win, sessionDir, busy = false, activeWorker, shuttingDown = false;
let importing = false, exporting = false;
const quickQueue = [];
const send = (channel, value) => { if (win && !win.isDestroyed()) win.webContents.send(channel, value); };
function queueQuick(args) { const request = parseQuickArgs(args); if (request && quickQueue.length < 12) quickQueue.push(request); send('quick-request', {}); }
const testMode = process.argv.includes('--self-test') || (!app.isPackaged && (process.env.PRESSGANG_QA === '1' || process.env.PRESSGANG_DEMO === '1'));
if (!testMode && !app.requestSingleInstanceLock({ quick: parseQuickArgs(process.argv) })) { app.quit(); }
else {
app.on('second-instance', (_e, args, _cwd, data) => {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  // Chromium may reorder switches or change the second process's argv.
  // Structured launch data preserves the image path and its associated preset.
  if (data?.quick) queueQuick(['--quick', String(data.quick.targetBytes), '--image', data.quick.file]);
  else queueQuick(args);
});
const files = new Map();
const saved = new Set();
const indexPath = path.join(__dirname, 'ui', 'index.html');
const indexUrl = pathToFileURL(indexPath).href;
const preview = async input => 'data:image/webp;base64,' + (await sharp(input, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 1400, height: 1000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer()).toString('base64');
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame.url.split('?')[0] !== indexUrl) throw new Error('허용되지 않은 요청입니다.');
    try { return { ok: true, value: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.message || '작업을 완료하지 못했습니다.' }; }
  });
}
async function importFiles(paths) {
  if (busy || importing || exporting) throw new Error('작업이 끝난 뒤에 추가해주세요.');
  if (!Array.isArray(paths) || paths.length > 12) throw new Error('한 번에 12장까지 맡길 수 있습니다.');
  importing = true;
  const imported = [], errors = [];
  try {
  for (const filePath of paths) {
    try {
      if (files.size >= 12) throw new Error('접수대가 꽉 찼습니다. 완료된 파일을 비워주세요.');
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('파일 경로가 올바르지 않습니다.');
      const { input, metadata: m } = await readImage(filePath);
      if ([...files.values()].reduce((n, f) => n + f.bytes, 0) + input.length > 350 * 1024 * 1024) throw new Error('한 번에 총 350MB까지 맡길 수 있습니다.');
      const id = randomUUID(), cache = path.join(sessionDir, `${id}.input`);
      const thumb = await preview(input);
      await fs.writeFile(cache, input, { flag: 'wx' });
      const rotated = m.orientation >= 5 && m.orientation <= 8;
      const item = { id, name: path.basename(filePath), bytes: input.length, width: rotated ? m.height : m.width, height: rotated ? m.width : m.height, alpha: !!m.hasAlpha, preview: thumb, format: m.format };
      files.set(id, { ...item, cache });
      imported.push(item);
    } catch (e) { errors.push({ name: typeof filePath === 'string' ? path.basename(filePath) : '파일', message: e.message }); }
  }
  return { imported, errors };
  } finally { importing = false; }
}
async function pasteClipboard() {
  if (busy || importing || exporting) throw new Error('작업이 끝난 뒤에 붙여넣어주세요.');
  // Reading happens only after a paste action. No clipboard monitoring.
  const paths = await readClipboardFiles();
  if (paths.length) return importFiles(paths);
  const entries = await clipboard.read();
  for (const entry of entries) {
    const type = ['image/png','image/jpeg','image/webp'].find(t => entry.types.includes(t));
    if (!type) continue;
    const blob = await entry.getType(type);
    if (blob.size > 100 * 1024 * 1024) throw new Error('복사한 이미지가 100MB를 넘습니다.');
    const ext = type.split('/')[1];
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const temp = path.join(sessionDir, `${language === 'en' ? 'Pasted-image' : '붙여넣기'}-${stamp}.${ext}`);
    try { await fs.writeFile(temp, Buffer.from(await blob.arrayBuffer()), { flag: 'wx' }); return await importFiles([temp]); }
    finally { await fs.unlink(temp).catch(() => {}); }
  }
  throw new Error('복사된 이미지가 없습니다. 사진 파일이나 스크린샷을 복사한 뒤 붙여넣어주세요.');
}
async function runOne(item, config) {
  const output = path.join(sessionDir, `${randomUUID()}.result`);
  const details = await new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.cjs'), { workerData: { input: item.cache, output, config } });
    activeWorker = worker;
    let settled = false;
    worker.on('message', message => {
      if (message.type === 'progress') send('job-progress', { id: item.id, ...message });
      if (message.type === 'done') { settled = true; resolve(message.details); }
      if (message.type === 'error') { settled = true; reject(new Error(message.message)); }
    });
    worker.on('error', reject);
    worker.on('exit', () => { if (!settled) reject(new Error('작업을 취소했습니다.')); if (activeWorker === worker) activeWorker = null; });
  });
  const result = { ...details, preview: await preview(output) };
  if (item.output) await fs.unlink(item.output).catch(() => {});
  item.output = output;
  item.result = result;
  return result;
}
let stopRequested = false;
async function runBatch(ids, config) {
  if (busy || importing || exporting) throw new Error('이미 작업 중입니다.');
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 12 || ids.some(id => !files.has(id))) throw new Error('먼저 이미지를 맡겨주세요.');
  busy = true; stopRequested = false;
  try {
    for (const id of ids) { const item = files.get(id); if (item.output) await fs.unlink(item.output).catch(() => {}); item.output = null; item.result = null; item.takeaway = null; }
    for (const id of [...new Set(ids)]) {
      if (stopRequested) break;
      const item = files.get(id);
      send('job-progress', { id, stage: 'start', index: ids.indexOf(id) + 1, total: ids.length });
      try { const result = await runOne(item, config); send('job-done', { id, result }); }
      catch (e) { send('job-error', { id, error: e.message, cancelled: stopRequested }); }
    }
  } finally { busy = false; send('batch-done', { cancelled: stopRequested }); }
  return true;
}
async function saveItems(ids, directory) {
  const results = [];
  for (const id of ids) {
    const item = files.get(id);
    if (!item?.output) continue;
    try {
      const dest = await saveUnique(await fs.readFile(item.output), directory, item.name, item.result.format, language === 'en' ? 'compressed' : '압축');
      saved.add(dest);
      results.push({ id, name: path.basename(dest), path: dest });
    } catch (e) { results.push({ id, error: `저장하지 못했습니다: ${e.code === 'ENOSPC' ? '디스크 공간이 부족합니다.' : e.message}` }); }
  }
  return results;
}
async function takeaway(ids, copy = false) {
  if (busy || importing || exporting) throw new Error('진행 중인 작업이 끝나면 다시 시도해주세요.');
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 12 || ids.some(id => !files.get(id)?.output)) throw new Error('완료된 파일을 선택해주세요.');
  exporting = true;
  const results = [];
  try {
    const directory = testMode ? path.join(sessionDir, 'takeaway') : path.join(app.getPath('downloads'), '압축깡패');
    await fs.mkdir(directory, { recursive: true });
    for (const id of [...new Set(ids)]) {
      const item = files.get(id);
      // Reuse only a result whose bytes still match; users may edit/move saved files.
      let dest = item.takeaway;
      if (dest) { try { if (!(await fs.readFile(dest)).equals(await fs.readFile(item.output))) dest = null; } catch { dest = null; } }
      if (!dest) dest = await saveUnique(await fs.readFile(item.output), directory, item.name, item.result.format, language === 'en' ? 'compressed' : '압축');
      item.takeaway = dest; saved.add(dest); results.push({ id, name: path.basename(dest), path: dest });
    }
    if (copy) await copyFiles(results.map(r => r.path));
    return results;
  } finally { exporting = false; }
}
app.whenReady().then(async () => {
  language = app.getLocale().startsWith('ko') ? 'ko' : 'en';
  if (testMode) language = process.env.PRESSGANG_LANG === 'en' ? 'en' : 'ko';
  else try { const stored = JSON.parse(await fs.readFile(languageFile(), 'utf8')); if (['ko','en'].includes(stored.language)) language = stored.language; } catch {}
  sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'press-gang-'));
  app.setAppUserModelId('studio.pressgang.desktop');
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1280, height: 880, minWidth: 980, minHeight: 720, backgroundColor: '#f7f7f2', title: '압축깡패', icon: path.join(__dirname, '..', 'assets', 'icon.png'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  handle('pick-files', async () => {
    const response = await dialog.showOpenDialog(win, { title: t('파일 추가'), properties: ['openFile', 'multiSelections'], filters: [{ name: t('이미지'), extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
    return response.canceled ? { imported: [], errors: [] } : importFiles(response.filePaths);
  });
  handle('import-files', importFiles);
  handle('language-get', () => language);
  handle('language-set', async next => {
    if (!['ko','en'].includes(next) || busy || importing || exporting) throw new Error('올바르지 않은 설정입니다.');
    if (!testMode) {
      const temp = languageFile() + '.tmp';
      await fs.mkdir(app.getPath('userData'), { recursive: true });
      await fs.writeFile(temp, JSON.stringify({ language: next }), 'utf8');
      await fs.rename(temp, languageFile());
      if (app.isPackaged && await integration('status', process.execPath)) await integration('enable', process.execPath, next);
    }
    language = next; win.setTitle(t('압축깡패'));
    return language;
  });
  handle('paste', pasteClipboard);
  handle('copy-results', ids => takeaway(ids, true));
  handle('quick-save', ids => takeaway(ids));
  handle('integration-status', async () => ({ available: app.isPackaged, enabled: app.isPackaged ? await integration('status', process.execPath) : false }));
  handle('integration-set', async enabled => { if (!app.isPackaged || typeof enabled !== 'boolean') throw new Error('설치된 앱에서 사용할 수 있습니다.'); await integration(enabled ? 'enable' : 'disable', process.execPath, language); return integration('status', process.execPath); });
  handle('quick-next', async () => {
    if (busy || importing || exporting || !quickQueue.length) return null;
    const request = quickQueue.shift();
    return { response: await importFiles([request.file]), targetBytes: request.targetBytes };
  });
  handle('compress', runBatch);
  handle('cancel', async () => { stopRequested = true; if (activeWorker) await activeWorker.terminate(); return true; });
  handle('remove', async id => {
    if (busy || importing || exporting) throw new Error('작업 중에는 접수대를 비울 수 없습니다.');
    const item = files.get(id); if (!item) return false;
    await fs.unlink(item.cache).catch(() => {});
    if (item.output) await fs.unlink(item.output).catch(() => {});
    files.delete(id); return true;
  });
  handle('save', async ids => {
    if (busy || importing || exporting) throw new Error('작업이 끝난 뒤에 저장해주세요.');
    if (!Array.isArray(ids) || ids.some(id => !files.get(id)?.output)) throw new Error('완료된 파일을 선택해주세요.');
    exporting = true;
    try { const response = await dialog.showOpenDialog(win, { title: t('압축 결과를 받을 폴더'), properties: ['openDirectory', 'createDirectory'], defaultPath: app.getPath('downloads') });
    return response.canceled ? [] : saveItems(ids, response.filePaths[0]); } finally { exporting = false; }
  });
  handle('reveal', async dest => { if (!saved.has(dest)) throw new Error('이 앱에서 저장한 결과만 열 수 있습니다.'); shell.showItemInFolder(dest); return true; });
  handle('drag-result', async id => {
    const item = files.get(id);
    if (!item?.output) throw new Error('먼저 압축을 완료해주세요.');
    const [{ path: dest }] = await takeaway([id]);
    win.webContents.startDrag({ file: dest, icon: nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 64, height: 64 }) });
    return true;
  });
  handle('licenses', async () => fs.readFile(path.join(__dirname, '..', 'docs', 'THIRD-PARTY-NOTICES.txt'), 'utf8'));
  win.on('close', event => {
    if (shuttingDown) return;
    if (busy) {
      event.preventDefault();
      dialog.showMessageBox(win, { type: 'question', message: t('아직 작업 중입니다. 종료할까요?'), detail: t('진행 중인 압축은 취소됩니다. 원본 파일은 그대로입니다.'), buttons: [t('계속 작업'), t('종료')], cancelId: 0 }).then(async r => {
        if (r.response === 1) { shuttingDown = true; stopRequested = true; if (activeWorker) await activeWorker.terminate(); win.close(); }
      });
    }
  });
  await win.loadFile(indexPath);
  if (!testMode) queueQuick(process.argv);
  if (process.argv.includes('--self-test')) { win.hide(); require('./self-test.cjs').run({ win, importFiles, runBatch, saveItems, files, sessionDir }).catch(e => { console.error(e); app.exit(1); }); }
  if (!app.isPackaged && process.env.PRESSGANG_DEMO === '1') require('../scripts/demo.cjs').run({ win, importFiles, runBatch, saveItems, files, sessionDir }).catch(e => { console.error(e); app.exit(1); });
  if (!app.isPackaged && process.env.PRESSGANG_QA === '1') require('../scripts/qa.cjs').run({ win, importFiles, runBatch, saveItems, files, sessionDir, pasteClipboard, takeaway, queueQuick }).catch(e => { console.error(e); app.exit(1); });
});
}
app.on('window-all-closed', async () => {
  if (activeWorker) await activeWorker.terminate();
  if (sessionDir && path.basename(sessionDir).startsWith('press-gang-')) await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  app.quit();
});
