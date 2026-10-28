'use strict';
const $ = id => document.getElementById(id);
const api = window.gang;
let language = 'ko', languageReady = false;
const t = (key, values) => PGText.translate(key, language, values);
function errorText(message) {
  if (String(message).startsWith('저장하지 못했습니다: ')) return t('저장하지 못했습니다: {reason}', {reason:t(message.slice('저장하지 못했습니다: '.length))});
  return t(message);
}
// Capture static text and accessible names once, before dynamic rendering.
const staticText = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
  const node = walker.currentNode, key = node.nodeValue.trim();
  if (Object.hasOwn(PGText.en, key)) staticText.push({node, original:node.nodeValue, key});
}
const staticAttributes = [];
for (const element of document.querySelectorAll('[aria-label],[title],[alt]')) {
  for (const attribute of ['aria-label','title','alt']) {
    const key = element.getAttribute(attribute);
    if (key && Object.hasOwn(PGText.en,key)) staticAttributes.push({element,attribute,key});
  }
}
function applyLanguage() {
  document.documentElement.lang = language;
  document.title = t('압축깡패');
  for (const entry of staticText) if (entry.node.isConnected) entry.node.nodeValue = entry.original.replace(entry.key,t(entry.key));
  for (const entry of staticAttributes) entry.element.setAttribute(entry.attribute,t(entry.key));
  $('language').value = language;
}
async function changeLanguage(next) {
  if (busy || saving || importing || quickHandling || !['ko','en'].includes(next)) return;
  $('language').disabled = true;
  try {
    language = await api.setLanguage(next);
    applyLanguage(); settingsChanged(); renderQueue(); renderSelected();
    $('footer-message').textContent = t('파일만 손댑니다.');
    $('toast').hidden = true;
  } finally { $('language').value = language; syncControls(); }
}

const items = new Map();
let selected, busy = false, saving = false, importing = false, toastTimer, previousUnit = 1000000;
let quickHandling = false, jobIndex = 0, jobTotal = 0;
const size = n => n >= 1e6 ? (n / 1e6).toFixed(2) + ' MB' : (n / 1e3).toFixed(1) + ' KB';
const configNow = () => ({ targetBytes: Math.floor(Number($('target').value) * Number($('unit').value)), format: $('format').value, allowResize: $('resize').checked, careful: $('careful').checked });
const configKey = c => JSON.stringify(c);
const readyItems = () => [...items.values()].filter(f => f.result);
function toast(message) { $('toast').textContent = errorText(message); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000); }
function say(person, text) { $('dialogue').querySelector('b').textContent = person; $('speech').textContent = text; }
function stage(value) { $('workshop').dataset.stage = value; }
async function safe(fn) { try { return await fn(); } catch (e) { toast(e.message); } }
function validTarget() { const n = configNow().targetBytes; return Number.isFinite(n) && n >= 10000 && n <= 100 * 1024 * 1024; }
function syncControls() {
  $('language').disabled = busy || saving || importing || quickHandling || !languageReady;
  for (const id of ['drop-zone', 'choose-files', 'paste-files', 'paste-quick', 'target', 'unit', 'format', 'resize', 'careful']) $(id).disabled = busy || importing || saving || !api;
  for (const button of document.querySelectorAll('[data-bytes]')) button.disabled = busy || !api;
  $('start').disabled = busy || importing || saving || !items.size || !validTarget() || !api;
  const completed = readyItems();
  const item = items.get(selected), hasResult = !!item?.result && !busy;
  $('start').querySelector('span').textContent = busy ? t('압축 중…') : completed.length ? t('다시 압축') : items.size > 1 ? t('{count}장 압축 시작', {count:items.size}) : t('압축 시작');
  $('start').classList.toggle('retry', completed.length > 0 && !busy);
  $('cancel').hidden = !busy; $('job-progress').hidden = !busy;
  $('save-selected').hidden = !hasResult;
  $('copy-selected').hidden = !hasResult;
  $('copy-selected').disabled = saving || busy;
  $('copy-selected').querySelector('span').textContent = saving ? t('파일 준비 중…') : item?.copied ? t('한 번 더 복사') : t('파일 복사');
  $('copy-all').hidden = busy || completed.length < 2;
  $('copy-all').disabled = saving;
  $('clear-queue').hidden = !items.size;
  $('clear-queue').disabled = busy || saving || importing;
  $('retry-selected').hidden = !item || items.size < 2;
  $('retry-selected').disabled = busy || saving || importing || !validTarget();
  $('save-selected').disabled = saving || busy;
  $('save-selected').querySelector('span').textContent = saving ? t('저장 중…') : item?.savedPath ? t('다시 저장') : t('결과 저장');
  $('save-compare').disabled = saving || busy;
  $('save-all').hidden = busy || completed.length < 2;
  $('save-all').disabled = saving;
  $('save-all').textContent = t('완료된 {count}장 모두 저장', {count:completed.length});
  $('reveal-saved').hidden = !item?.savedPath || busy;
  $('action-summary').textContent = busy ? t('작업 중에도 원본은 그대로 보관됩니다.') : hasResult ? (item.copied ? t('이제 다른 앱에서 Ctrl+V 해보세요.') : item.savedPath ? t('저장 완료 · 원본도 그대로 있습니다.') : t('확인 후 복사하면 바로 보낼 수 있어요.')) : items.size ? t('{count}장 각각 {size} 이하로', {count:items.size, size:size(configNow().targetBytes)}) : t('복사한 사진은 Ctrl+V로 접수하세요.');
  $('settings-changed').hidden = !hasResult || item.config === configKey(configNow());
}
function setBusy(value) { busy = value; syncControls(); }
function updateRow(item) {
  const detail = document.querySelector('[data-item-id="' + item.id + '"] .file-detail');
  if (!detail) return;
  detail.className = 'file-detail';
  detail.textContent = size(item.bytes) + ' · ' + t(item.status || '대기');
  if (item.result) {
    detail.textContent = size(item.result.bytes) + ' · ' + (item.savedPath ? t('저장됨') : item.result.reached ? t('완료') : t('목표 초과'));
    detail.classList.add(item.result.reached ? 'done' : 'error');
  }
  if (item.error) { detail.textContent = errorText(item.error); detail.classList.add('error'); }
}
function renderQueue() {
  const container = $('queue'); container.replaceChildren();
  if (!items.size) {
    const empty = document.createElement('div'); empty.className = 'empty-note';
    empty.innerHTML = '<svg class="icon"><use href="#i-image"/></svg><strong>' + t('접수된 파일이 없어요.') + '</strong>' + t('오늘은 아직 평화롭네요.');
    container.append(empty);
  }
  for (const item of items.values()) {
    const row = document.createElement('div'); row.className = 'file-row' + (item.id === selected ? ' selected' : ''); row.dataset.itemId = item.id;
    const select = document.createElement('button'); select.className = 'file-select';
    select.setAttribute('aria-label', t('{name} 선택', {name:item.name})); select.setAttribute('aria-pressed', String(selected === item.id));
    select.onclick = () => { selected = item.id; renderQueue(); renderSelected(); document.querySelector('[data-item-id="' + item.id + '"] .file-select')?.focus({ preventScroll: true }); };
    const image = document.createElement('img'); image.src = item.preview; image.alt = '';
    const info = document.createElement('div'); info.className = 'file-info';
    const title = document.createElement('span'); title.className = 'file-name'; title.textContent = item.name; title.title = item.name;
    const detail = document.createElement('span'); detail.className = 'file-detail';
    info.append(title, detail);
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('aria-label', t('{name} 목록에서 제거', {name:item.name})); remove.disabled = busy || saving;
    remove.onclick = () => safe(async () => {
      await api.remove(item.id); items.delete(item.id);
      if (selected === item.id) selected = items.keys().next().value;
      renderQueue(); renderSelected();
      (document.querySelector('.file-row.selected .file-select') || $('drop-zone')).focus();
    });
    row.append(select, image, info, remove); container.append(row); updateRow(item);
  }
  $('count').textContent = items.size + ' / 12';
  $('queue-total').textContent = items.size ? t('{count}장 · 원본 합계 {size}', {count:items.size, size:size([...items.values()].reduce((n, f) => n + f.bytes, 0))}) : t('한 번에 최대 12장');
  const ready = readyItems(), failed = [...items.values()].filter(i => i.error).length;
  $('batch-receipt').hidden = !ready.length && !failed;
  if (ready.length || failed) {
    const before = ready.reduce((n,i) => n+i.bytes,0), after = ready.reduce((n,i) => n+i.result.bytes,0);
    $('receipt-size').textContent = size(before) + ' → ' + size(after);
    $('receipt-status').textContent = t('{count}장 통과', {count:ready.filter(i=>i.result.reached).length}) + (ready.some(i=>!i.result.reached) ? t(' · {count}장 초과', {count:ready.filter(i=>!i.result.reached).length}) : '') + (failed ? t(' · {count}장 오류', {count:failed}) : '');
  }
  syncControls();
}
function setView(view) {
  const item = items.get(selected); if (!item) return;
  item.view = item.result ? view : 'before';
  $('inline-comparison').dataset.view = item.view;
  for (const button of document.querySelectorAll('button[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === item.view));
  $('preview-hint').textContent = item.view === 'split' ? t('경계선을 움직여 비교') : t('화면에 맞춘 미리보기');
}
function renderSelected() {
  const item = items.get(selected), r = item?.result;
  $('welcome').hidden = !!item;
  $('inline-comparison').hidden = !item;
  $('view-switch').hidden = !item;
  $('compare').hidden = !r;
  $('result-bar').hidden = !r;
  $('quality-note').hidden = !r;
  $('preview-name').textContent = item?.name || t('작업대');
  $('preview-name').title = item?.name || '';
  $('preview-eyebrow').textContent = item ? 'PREVIEW' : 'IMAGE COMPRESSOR';
  $('image-meta').textContent = item ? item.width + ' × ' + item.height + ' px · ' + item.format.toUpperCase() + ' · ' + size(item.bytes) : t('파일을 어디에 놓아도 접수됩니다.');
  for (const button of document.querySelectorAll('button[data-view]')) button.disabled = button.dataset.view !== 'before' && !r;
  if (item) {
    if ($('inline-before').src !== item.preview) $('inline-before').src = item.preview;
    if (r) $('inline-after').src = r.preview; else $('inline-after').removeAttribute('src');
    setView(item.view || (r ? 'split' : 'before'));
  } else $('preview-hint').textContent = t('내 컴퓨터에서 처리');
  if (r) {
    $('original-size').textContent = size(item.bytes);
    $('result-size').textContent = size(r.bytes);
    $('result-caption').textContent = t('압축 후') + ' · ' + r.format.toUpperCase();
    const reduction = (1 - r.bytes / item.bytes) * 100;
    const value = document.createTextNode(r.unchanged ? t('그대로') : reduction >= 0 ? '−' + reduction.toFixed(0) + '%' : '+' + Math.abs(reduction).toFixed(0) + '%');
    const label = document.createElement('small'); label.textContent = r.reached ? t('목표 용량 통과') : t('목표 용량 초과');
    $('saving').replaceChildren(value, label); $('saving').classList.toggle('warning', !r.reached || reduction < 0);
    $('quality-note').classList.toggle('warning', !r.reached || r.resized || r.flattened);
    $('quality-note').textContent = (r.unchanged ? t('이미 목표 이하라 원본 그대로입니다.') : r.reached ? t('목표 {size} 이하로 압축했습니다.', {size:size(item.target)}) : t('목표 {size}를 넘었습니다. 목표를 높이거나 압축 조건을 바꿔주세요.', {size:size(item.target)})) + (r.resized ? t(' 해상도 {width} × {height}로 축소.', {width:r.width,height:r.height}) : t(' 해상도 유지.')) + (r.flattened ? t(' 투명 배경은 흰색으로 변경.') : '');
  }
  if (!busy) {
    stage(!item ? 'idle' : item.error ? 'warning' : r ? (r.reached ? 'done' : 'warning') : 'ready');
    $('shop-sign').textContent = !item ? t('대기 중') : item.error ? t('확인 필요') : r ? (r.reached ? t('작업 완료') : t('확인 필요')) : t('접수 완료');
    if (!item) { say(t('압축반장'), t('사장님, 무거운 거 내려놓으시죠.')); $('status-text').textContent = t('원본은 무사히 돌려보내겠습니다.'); }
    else if (item.error) { say(t('검수대리'), t('사장님, 이 파일은 확인이 필요합니다.')); $('status-text').textContent = errorText(item.error); }
    else if (!r) { say(t('압축반장'), t('접수했습니다. 몇 메가로 모실까요?')); $('status-text').textContent = t('오른쪽에서 목표를 정하고 압축을 시작하세요.'); }
    else if (r.unchanged) { say(t('검수대리'), t('이미 가볍네요. 오늘은 그냥 보내드리죠.')); $('status-text').textContent = t('원본과 같은 파일입니다. 그대로 저장할 수 있어요.'); }
    else if (!r.reached) { say(t('검수대리'), t('반장님, 힘만 쓴다고 되는 게 아닙니다.')); $('status-text').textContent = t('조건을 바꾸면 다시 도전할 수 있어요.'); }
    else { say(t('압축반장'), t('용량만 혼내줬습니다. 원본은 무사합니다.')); $('status-text').textContent = r.resized ? t('크기가 줄었습니다. 세부를 확인하고 저장하세요.') : t('해상도는 그대로. 사진을 비교하고 저장하세요.'); }
  }
  syncControls();
}
function accept(response) {
  for (const item of response.imported) items.set(item.id, item);
  if (response.imported.length) selected = response.imported[0].id;
  if (response.errors.length) toast(response.errors.map(e => e.name + ': ' + errorText(e.message)).join('\n'));
  renderQueue(); renderSelected();
}
async function pickFiles() {
  if (busy || importing) return; importing = true; syncControls();
  try { accept(await api.pick()); } finally { importing = false; syncControls(); drainQuick(); }
}
async function pasteFiles(quick = false) {
  if (busy || importing || saving) return;
  importing = true; syncControls();
  let response;
  try { response = await api.paste(); accept(response); }
  finally { importing = false; syncControls(); setTimeout(drainQuick,100); }
  if (quick && response.imported.length) await compressIds(response.imported.map(i=>i.id));
  drainQuick();
}
$('paste-files').onclick = () => safe(() => pasteFiles());
$('paste-quick').onclick = () => safe(() => pasteFiles(true));
$('clear-queue').onclick = () => safe(async () => {
  if (busy || saving || importing) return;
  for (const id of [...items.keys()]) { await api.remove(id); items.delete(id); }
  selected = undefined; renderQueue(); renderSelected(); toast('접수대를 비웠습니다. 저장한 결과 파일은 그대로입니다.');
});
async function drainQuick() {
  if (!api || !languageReady || quickHandling || busy || importing || saving) return;
  quickHandling = true;
  try {
    const next = await api.quickNext(); if (!next) return;
    accept(next.response);
    const ids = next.response.imported.map(i=>i.id);
    if (ids.length) {
      const unit = next.targetBytes >= 1e6 ? 1e6 : 1000;
      $('unit').value = unit; previousUnit = unit; $('target').value = next.targetBytes / unit;
      $('format').value = 'auto'; $('resize').checked = true; $('careful').checked = true; settingsChanged();
      await compressIds(ids);
      const reached = ids.filter(id => items.get(id)?.result?.reached);
      if (reached.length) {
        const results = await api.quickSave(reached);
        for (const r of results) items.get(r.id).savedPath = r.path;
        renderQueue(); renderSelected(); toast('빠른 압축 완료. 다운로드 폴더 안의 압축깡패에 저장했습니다.');
      }
    }
  } catch(e) { toast(e.message); }
  finally { quickHandling = false; syncControls(); }
  // Drain only after a request was handled. A null request returns through finally.
  drainQuick();
}
$('drop-zone').onclick = $('choose-files').onclick = () => safe(pickFiles);
for (const name of ['dragenter', 'dragover']) document.addEventListener(name, event => { event.preventDefault(); if (!busy && event.dataTransfer?.types.includes('Files')) document.body.classList.add('drag-over'); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('drag-over'); });
document.addEventListener('drop', event => {
  event.preventDefault(); document.body.classList.remove('drag-over');
  if (busy || importing) return toast('작업이 끝나면 추가해주세요.');
  if (event.dataTransfer.files.length) safe(async () => { importing = true; syncControls(); try { accept(await api.drop(Array.from(event.dataTransfer.files))); } finally { importing = false; syncControls(); drainQuick(); } });
});
function settingsChanged() {
  const valid = validTarget();
  $('target').setAttribute('aria-invalid', String(!valid));
  $('target-error').hidden = valid;
  $('target-error').textContent = t('10 KB부터 100 MB 사이로 입력해주세요.');
  $('target').min = 10000 / Number($('unit').value); $('target').max = (100 * 1024 * 1024) / Number($('unit').value);
  for (const button of document.querySelectorAll('[data-bytes]')) button.setAttribute('aria-pressed', String(Number(button.dataset.bytes) === configNow().targetBytes));
  $('format-note').textContent = $('format').value === 'jpeg' ? t('투명한 부분은 흰 배경으로 바뀝니다.') : $('format').value === 'webp' ? t('투명 배경을 유지할 수 있습니다.') : t('일반 사진은 JPG, 투명 이미지는 WebP');
  syncControls();
  if (valid) try { localStorage.setItem('press-gang-settings', JSON.stringify({ target: $('target').value, unit: $('unit').value, ...configNow() })); } catch {}
}
$('unit').onchange = () => { const bytes = Number($('target').value) * previousUnit; previousUnit = Number($('unit').value); $('target').value = Number((bytes / previousUnit).toFixed(4)); settingsChanged(); };
for (const id of ['target', 'format', 'resize', 'careful']) $(id).addEventListener('input', settingsChanged);
for (const button of document.querySelectorAll('[data-bytes]')) button.onclick = () => {
  const bytes = Number(button.dataset.bytes), unit = bytes >= 1e6 ? 1e6 : 1000;
  $('unit').value = unit; previousUnit = unit; $('target').value = bytes / unit; settingsChanged();
};
for (const button of document.querySelectorAll('button[data-view]')) button.onclick = () => setView(button.dataset.view);
async function compressIds(ids) {
  if (!validTarget()) { settingsChanged(); $('target').focus(); return; }
  if (!items.size || busy || saving || importing) return;
  const config = configNow();
  jobIndex = 0; jobTotal = ids.length;
  for (const id of ids) { const item = items.get(id); item.status = '대기 중'; item.error = null; item.result = null; item.savedPath = null; item.copied = false; item.target = config.targetBytes; item.config = configKey(config); item.view = 'before'; }
  setBusy(true); stage('working'); $('shop-sign').textContent = t('작업 중'); $('cancel').disabled = false; $('cancel').textContent = t('취소');
  renderQueue(); renderSelected();
  try { await api.compress(ids, config); }
  catch (e) { toast(e.message); setBusy(false); renderQueue(); renderSelected(); }
}
$('start').onclick = () => compressIds([...items.keys()]);
$('retry-selected').onclick = () => compressIds([selected]);
$('cancel').onclick = () => safe(async () => { $('cancel').disabled = true; $('cancel').textContent = t('취소 중'); await api.cancel(); });
async function save(ids) {
  if (saving || busy) return;
  saving = true; syncControls();
  try {
    const results = await api.save(ids); if (!results.length) return;
    const success = results.filter(r => !r.error);
    for (const r of success) { const item = items.get(r.id); if (item) item.savedPath = r.path; }
    const errors = results.filter(r => r.error);
    toast(errors.length ? errors.map(r => errorText(r.error)).join('\n') : t('{count}개 파일을 저장했습니다. 원본은 그대로입니다.', {count:success.length}));
    $('footer-message').textContent = success.length ? t('저장 완료 · 원본 보존') : t('파일만 손댑니다.');
  } finally { saving = false; renderQueue(); renderSelected(); drainQuick(); }
}
async function copyResults(ids) {
  if (saving || busy || importing) return;
  saving = true; syncControls();
  try {
    const results = await api.copy(ids);
    for (const r of results) { const item = items.get(r.id); if (item) { item.savedPath = r.path; item.copied = true; } }
    toast(t('{count}개 파일 복사 완료. 파일 붙여넣기를 지원하는 앱에서 Ctrl+V 하세요.\n다운로드 > 압축깡패에도 보관했습니다.', {count:results.length}));
    $('footer-message').textContent = t('배송 준비 끝. 이제 Ctrl+V.');
  } finally { saving = false; renderQueue(); renderSelected(); drainQuick(); }
}
$('copy-selected').onclick = () => safe(() => copyResults([selected]));
$('copy-all').onclick = () => safe(() => copyResults(readyItems().map(i=>i.id)));
$('save-selected').onclick = $('save-compare').onclick = () => safe(() => save([selected]));
$('save-all').onclick = () => safe(() => save(readyItems().map(f => f.id)));
$('reveal-saved').onclick = () => safe(() => api.reveal(items.get(selected).savedPath));
$('result-size').draggable = true;
$('result-size').ondragstart = event => { event.preventDefault(); if (!busy) safe(() => api.drag(selected)); };
function updateInlineSlider() { const value = $('inline-slider').value; $('inline-comparison').style.setProperty('--split', value + '%'); $('inline-after-layer').style.clipPath = 'inset(0 0 0 ' + value + '%)'; $('inline-line').style.left = value + '%'; }
function updateSlider() { const value = $('compare-slider').value; $('after-layer').parentElement.style.setProperty('--split', value + '%'); $('after-layer').style.clipPath = 'inset(0 0 0 ' + value + '%)'; $('slider-line').style.left = value + '%'; }
$('inline-slider').oninput = updateInlineSlider; $('compare-slider').oninput = updateSlider;
$('compare').onclick = () => {
  const item = items.get(selected); if (!item?.result) return;
  const r = item.result;
  $('before-image').src = item.preview; $('after-image').src = r.preview;
  $('before-meta').textContent = t('원본') + ' · ' + size(item.bytes) + ' · ' + item.width + ' × ' + item.height;
  $('after-meta').textContent = r.format.toUpperCase() + ' · ' + size(r.bytes) + ' · ' + r.width + ' × ' + r.height;
  $('compare-slider').value = $('inline-slider').value; updateSlider(); $('compare-dialog').showModal();
};
$('about-button').onclick = () => $('about-dialog').showModal();
$('workflow-button').onclick = () => safe(async () => {
  $('workflow-dialog').showModal(); $('integration-toggle').disabled = true;
  const status = await api.integrationStatus();
  $('integration-toggle').checked = status.enabled; $('integration-toggle').disabled = !status.available;
  $('integration-status').textContent = status.available ? (status.enabled ? t('탐색기 메뉴가 켜져 있습니다.') : t('원할 때 켜고 끌 수 있습니다.')) : t('정식 설치본에서 켤 수 있습니다.');
});
$('integration-toggle').onchange = () => safe(async () => {
  const toggle = $('integration-toggle'), desired = toggle.checked; toggle.disabled = true;
  try { toggle.checked = await api.setIntegration(desired); $('integration-status').textContent = toggle.checked ? t('사진 우클릭 → 압축깡패. Windows 11에서는 “더 많은 옵션 표시”를 열어주세요.') : t('탐색기 메뉴를 껐습니다.'); }
  catch(e) { toggle.checked = !desired; throw e; }
  finally { toggle.disabled = false; }
});
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => button.closest('dialog').close();
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
$('licenses-button').onclick = () => safe(async () => { $('licenses-text').textContent = await api.licenses(); $('licenses-text').hidden = !$('licenses-text').hidden; });
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  if (key === 'o') { event.preventDefault(); if (!busy && !importing) safe(pickFiles); }
  if (key === 'enter') { event.preventDefault(); $('start').click(); }
  if (key === 's') { event.preventDefault(); if (!busy && items.get(selected)?.result) safe(() => save([selected])); }
  if (key === 'v' && !['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)) { event.preventDefault(); safe(() => pasteFiles(event.shiftKey)); }
  if (key === 'c' && event.shiftKey) { event.preventDefault(); if (items.get(selected)?.result) safe(() => copyResults([selected])); }
});
if (api) {
  api.on('quick-request', drainQuick);
  api.on('job-progress', p => {
    const item = items.get(p.id); if (!item) return;
    item.status = p.stage === 'start' ? '압축 중' : p.stage === 'check' ? '검수 중' : '화질 조절 중';
    if (p.stage === 'start') { jobIndex = p.index; jobTotal = p.total; selected = p.id; stage('working'); renderQueue(); renderSelected(); say(t('압축반장'), t('잠깐만요. 용량이랑 얘기 좀 하겠습니다.')); }
    else if (p.stage === 'resize') say(t('검수대리'), t('화질은 지키고, 크기를 조금 줄이겠습니다.'));
    else if (p.stage === 'check') say(t('검수대리'), t('반장님, 검수 끝나기 전엔 못 나갑니다.'));
    else if (p.attempt >= 3) say(t('압축반장'), t('힘 조절 중입니다. 디테일은 대리가 봅니다.'));
    $('status-text').textContent = t('{index} / {total}장 · {status} · 목표 {size}', {index:jobIndex,total:jobTotal,status:t(item.status),size:size(item.target)});
    updateRow(item);
  });
  api.on('job-done', ({ id, result }) => { const item = items.get(id); if (item) { item.result = result; item.status = '완료'; item.error = null; item.view = 'split'; } renderQueue(); renderSelected(); });
  api.on('job-error', ({ id, error }) => { const item = items.get(id); if (item) { item.error = error; item.status = '중단'; } toast(error); renderQueue(); });
  api.on('batch-done', ({ cancelled }) => { setBusy(false); for (const item of items.values()) if (item.status === '대기 중') item.status = '대기'; renderQueue(); renderSelected(); if (cancelled) toast('취소했습니다. 이미 완료된 결과는 저장할 수 있습니다.'); setTimeout(drainQuick, 100); });
}
try {
  const s = JSON.parse(localStorage.getItem('press-gang-settings'));
  if (s && Number(s.target) > 0 && ['1000','1000000'].includes(String(s.unit))) {
    $('target').value = s.target; $('unit').value = s.unit; previousUnit = Number(s.unit);
    if (['auto','jpeg','webp'].includes(s.format)) $('format').value = s.format;
    if (typeof s.allowResize === 'boolean') $('resize').checked = s.allowResize;
    if (typeof s.careful === 'boolean') $('careful').checked = s.careful;
  }
} catch {}
$('language').onchange = () => safe(() => changeLanguage($('language').value));
async function initializeLanguage() {
  try { language = api ? await api.language() : 'en'; }
  catch { language = navigator.language.startsWith('ko') ? 'ko' : 'en'; }
  languageReady = true;
  applyLanguage(); settingsChanged(); renderQueue(); renderSelected();
  document.body.classList.add('language-ready');
  drainQuick();
}
initializeLanguage();
