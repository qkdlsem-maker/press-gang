const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { app } = require('electron');
const assert = require('node:assert/strict');
exports.run = async ({ win, importFiles, runBatch, saveItems, files, sessionDir }) => {
  const index = process.argv.indexOf('--report');
  const reportPath = index >= 0 ? path.resolve(process.argv[index + 1]) : path.join(app.getPath('userData'), 'self-test.json');
  let report;
  try {
    const fixture = path.join(sessionDir, '설치 검증.png');
    const pixels = Buffer.alloc(800 * 600 * 3); let seed = 7;
    for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels[i] = seed >>> 24; }
    await sharp(pixels, { raw: { width: 800, height: 600, channels: 3 } }).png().toFile(fixture);
    const imported = await importFiles([fixture]); assert.equal(imported.imported.length, 1);
    const id = imported.imported[0].id;
    await runBatch([id], { targetBytes: 50000, format: 'auto', allowResize: true, careful: true });
    const item = files.get(id); assert.ok(item.result?.reached); assert.ok(item.result.bytes <= 50000);
    const saved = await saveItems([id], sessionDir); assert.ok(saved[0].path);
    const metadata = await sharp(saved[0].path).metadata(); assert.equal(metadata.format, 'jpeg');
    const ui = await win.webContents.executeJavaScript('({bridge:!!window.gang, node:typeof require, title:document.title})');
    assert.equal(ui.bridge, true); assert.equal(ui.node, 'undefined');
    await win.webContents.executeJavaScript("changeLanguage('en')");
    assert.equal(await win.webContents.executeJavaScript("document.documentElement.lang"), 'en');
    assert.equal(await win.webContents.executeJavaScript("document.getElementById('start').textContent.trim()"), 'Compress');
    const enSaved = await saveItems([id], sessionDir); assert.ok(enSaved[0].name.includes('-compressed.'));
    await win.webContents.executeJavaScript("changeLanguage('ko')");
    assert.equal(await win.webContents.executeJavaScript("document.getElementById('start').textContent.trim()"), '압축 시작');
    report = { passed: true, version: app.getVersion(), packaged: app.isPackaged, executable: process.execPath, compressionBytes: item.result.bytes, savedAndDecoded: true, koreanEnglishSwitch:true, englishFilename:true, ui, checkedAt: new Date().toISOString() };
  } catch (e) { report = { passed: false, error: e.message, checkedAt: new Date().toISOString() }; }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  win.close();
};
