const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const version = require('../package.json').version;
  const visited = new Set(); let text = '압축깡패 ' + version + ' — Third-party notices\n\nOriginal interface, characters and demo illustration were created for this project.\n\n';
  async function addPackage(dir) {
    const real = await fs.realpath(dir); if (visited.has(real)) return; visited.add(real);
    const pkg = JSON.parse(await fs.readFile(path.join(real, 'package.json'), 'utf8'));
    text += `\n\n===== ${pkg.name} ${pkg.version} (${pkg.license || 'see notices'}) =====\n`;
    for (const name of await fs.readdir(real)) if (/^(license|licence|copying|notice)/i.test(name) && (await fs.stat(path.join(real, name))).isFile()) text += await fs.readFile(path.join(real, name), 'utf8') + '\n';
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      try { const dep = require.resolve(`${name}/package.json`, { paths: [real] }); await addPackage(path.dirname(dep)); }
      catch { try { await addPackage(path.join(real, '..', ...name.split('/'))); } catch {} }
    }
  }
  await addPackage(path.join(root, 'node_modules/sharp'));
  const electronPath = require('electron');
  text += '\n\n===== Electron =====\n' + await fs.readFile(path.join(path.dirname(electronPath), 'LICENSE'), 'utf8');
  text += '\nChromium notices are distributed as LICENSES.chromium.html alongside the application executable.\n';
  for (const name of ['PRETENDARD-LICENSE.txt', 'LIBVIPS-NOTICES.md', 'LIBRARY-SOURCES.txt', 'LGPL-3.0.txt', 'GPL-3.0.txt']) { try { text += `\n\n===== ${name} =====\n` + await fs.readFile(path.join(root, 'docs', name), 'utf8'); } catch {} }
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs/THIRD-PARTY-NOTICES.txt'), text);
  console.log(`Collected ${visited.size} image-library packages plus Electron notices.`);
})().catch(e => { console.error(e); process.exit(1); });
