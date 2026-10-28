const { parentPort, workerData } = require('node:worker_threads');
const { compress, readImage } = require('./compress.cjs');
const fs = require('node:fs/promises');
(async () => {
  const { input } = await readImage(workerData.input);
  const result = await compress(input, workerData.config, p => parentPort.postMessage({ type: 'progress', ...p }));
  await fs.writeFile(workerData.output, result.buffer, { flag: 'wx' });
  const { buffer, ...details } = result;
  parentPort.postMessage({ type: 'done', details: { ...details, bytes: buffer.length } });
})().catch(e => parentPort.postMessage({ type: 'error', message: e.message }));
