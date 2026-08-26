/* BeatSwipe My Page module — upload, dashboard, beat order */
// ─── PREVIEW TYPE + MP3 UPLOAD ────────────────────────────────────────────
let _mp3File = null;
let _mp3PublicUrl = null;
let _mp3Queue = [];
let _mp3QueueId = 0;
let _singleCoverFile = null;
let _singleCoverPreview = '';
let _editCoverFile = null;
let _editCoverPreview = '';
let _editCoverCleared = false;

const MAX_FILE_MB = 15;
const MAX_MP3_QUEUE = 10;
const COVER_MAX_SOURCE_MB = 8;
const COVER_MAX_PX = 800;
const MP3_PREVIEW_HINT = 'Preview only — short clip (~30–60s), not the full beat.';
const ALLOWED_MIME = 'audio/mpeg';
const SUPA_BUCKET  = 'beats';

function titleFromFilename(name) {
  let t = name.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ').trim();
  if (t.length > 80) t = t.slice(0, 80);
  return t || 'Untitled';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';
}

function isQueueItemReady(item) {
  return !!(item.title?.trim() && item.genre && item.type && item.buyPlatform && String(item.buyLink || '').trim());
}

function resetAddBeatForm() {
  ['f-title', 'f-bpm', 'f-key', 'f-preview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['f-genre', 'f-type'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  const pt = document.getElementById('f-preview-type');
  if (pt) pt.value = currentUser ? 'MP3' : '';
  mountBuyStoreField('submitBuyStore', { wrapId: 'single', platform: '', buyLink: '' });
  clearSingleCover();
}

function syncSubmitBtnLabel() {
  const addBtn = document.getElementById('addBeatBtn');
  const uploadBtn = document.getElementById('submitBeatBtn');
  const pt = document.getElementById('f-preview-type')?.value;
  const n = _mp3Queue.length;
  if (addBtn) addBtn.hidden = true;
  if (uploadBtn && !uploadBtn.disabled) {
    if (pt === 'MP3' && n > 1) {
      uploadBtn.innerHTML = `<i class="ti ti-upload"></i> Upload all ${n} beats`;
    } else {
      uploadBtn.innerHTML = '<i class="ti ti-upload"></i> Upload';
    }
  }
}

function selectPreviewType(type) {
  const pt = document.getElementById('f-preview-type');
  if (!pt || pt.value === type) return;
  pt.value = type;
  updatePreviewLabel();
}

function syncPreviewTypeCards() {
  const type = document.getElementById('f-preview-type')?.value || '';
  document.querySelectorAll('.preview-type-card').forEach(btn => {
    const on = btn.dataset.type === type;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function addAnotherBeat() {
  const pt = document.getElementById('f-preview-type');
  if (pt && pt.value !== 'MP3') {
    pt.value = 'MP3';
    updatePreviewLabel();
  }
  if (!currentUser) {
    showToast('Sign in to upload MP3s.', 'error');
    return;
  }
  if (_mp3Queue.length >= MAX_MP3_QUEUE) {
    showToast(`Max. ${MAX_MP3_QUEUE} files per batch.`, 'error');
    return;
  }
  document.getElementById('f-mp3-file')?.click();
}

function updatePreviewLabel() {
  const type = document.getElementById('f-preview-type').value;
  const urlGroup = document.getElementById('preview-url-group');
  const mp3Group = document.getElementById('preview-mp3-group');
  const titleGroup = document.getElementById('single-title-group');
  const label    = document.getElementById('preview-url-label');
  const hint     = document.getElementById('preview-hint');
  const input    = document.getElementById('f-preview');

  urlGroup.style.display = 'none';
  mp3Group.style.display = 'none';
  if (titleGroup) titleGroup.style.display = 'none';

  syncPreviewTypeCards();
  if (!type) {
    syncQueueFormLayout();
    syncOptionalBuyStore('');
    return;
  }

  if (type === 'YouTube') {
    urlGroup.style.display = 'block';
    if (titleGroup) titleGroup.style.display = 'block';
    label.textContent = 'YouTube Link *';
    input.placeholder = 'https://youtube.com/watch?v=...';
    hint.textContent = 'Fans swipe this video as the preview.';
    clearMp3Queue();
  } else if (type === 'SoundCloud') {
    urlGroup.style.display = 'block';
    if (titleGroup) titleGroup.style.display = 'block';
    label.textContent = 'SoundCloud Link *';
    input.placeholder = 'https://soundcloud.com/you/track';
    hint.textContent = 'Public track page or share link. Private tracks will not play.';
    clearMp3Queue();
  } else if (type === 'MP3') {
    mp3Group.style.display = 'block';
    const mp3Hint = document.getElementById('preview-mp3-hint');
    if (mp3Hint) mp3Hint.textContent = MP3_PREVIEW_HINT;
    const loginHint  = document.getElementById('uploadLoginHint');
    const loggedInEl = document.getElementById('uploadLoggedIn');
    if (currentUser) {
      loginHint.style.display  = 'none';
      loggedInEl.style.display = 'flex';
      if (!_mp3Queue.length) resetUploadUI();
    } else {
      loginHint.style.display  = 'block';
      loggedInEl.style.display = 'none';
    }
  }
  syncSubmitBtnLabel();
  syncQueueFormLayout();
  syncOptionalBuyStore(type);
  renderSingleCoverPick();
}

const SUBMIT_GENRES = ['Trap','Drill','R&B','Lo-Fi','Afrobeats','Synthwave','Acoustic','Boom Bap','Other'];
const SUBMIT_TYPES = ['Full Beat','Loop','Drum Kit','Sample'];
const BUY_STORE_PLATFORMS = [
  { id: 'beatstars', label: 'BeatStars', placeholder: 'https://beatstars.com/beat/...' },
  { id: 'airbit', label: 'Airbit', placeholder: 'https://airbit.com/...' },
  { id: 'traktrain', label: 'Traktrain', placeholder: 'https://traktrain.com/...' },
  { id: 'soundcloud', label: 'SoundCloud', placeholder: 'https://soundcloud.com/you/track' },
  { id: 'other', label: 'Custom website', placeholder: 'https://yourstore.com/...' }
];
const BUY_STORE_HOSTS = {
  beatstars: 'beatstars.com',
  airbit: 'airbit.com',
  traktrain: 'traktrain.com',
  soundcloud: 'soundcloud.com'
};
const BPM_MIN = 40;
const BPM_MAX = 240;

function normalizeBuyLink(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return 'https://' + trimmed.replace(/^https?:\/\//i, '');
  return '';
}

function detectBuyPlatform(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('beatstars.com')) return 'beatstars';
  if (u.includes('airbit.com')) return 'airbit';
  if (u.includes('traktrain.com')) return 'traktrain';
  if (u.includes('soundcloud.com') || u.includes('snd.sc')) return 'soundcloud';
  if (u.trim()) return 'other';
  return '';
}

function validateBuyLink(raw, platform) {
  if (!platform) return 'Select where you sell this beat.';
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'Paste the store link for this beat.';
  const normalized = normalizeBuyLink(trimmed);
  if (!normalized) return 'Enter a full link (https://…).';
  const host = BUY_STORE_HOSTS[platform];
  const label = BUY_STORE_PLATFORMS.find(p => p.id === platform)?.label;
  if (platform === 'soundcloud') {
    if (!/soundcloud\.com|snd\.sc\//i.test(normalized)) {
      return `That doesn't look like a ${label} link.`;
    }
  } else if (host && !normalized.toLowerCase().includes(host)) {
    return `That doesn't look like a ${label} link.`;
  }
  return null;
}

function validateBpm(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < BPM_MIN || n > BPM_MAX) {
    return `BPM should be between ${BPM_MIN} and ${BPM_MAX}.`;
  }
  return null;
}

function validatePreviewUrl(type, url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return 'Paste a preview link.';
  if (type === 'YouTube' && !/(?:youtube\.com|youtu\.be)\//i.test(trimmed)) {
    return 'Paste a YouTube video link.';
  }
  if (type === 'SoundCloud' && !/soundcloud\.com|snd\.sc\//i.test(trimmed)) {
    return 'Paste a SoundCloud track link.';
  }
  return null;
}

function getBuyWrapState(wrapId) {
  const wrap = document.querySelector(`[data-buy-wrap="${wrapId}"]`);
  if (!wrap) return { platform: '', buyLink: '' };
  return {
    platform: wrap.querySelector('.buy-store-pill.active')?.dataset.platform || '',
    buyLink: wrap.querySelector('.buy-store-input')?.value.trim() || ''
  };
}

function mountBuyStoreField(containerId, opts) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = buildBuyStoreFieldHtml(opts);
}

function buyStorePlaceholder(platformId) {
  return BUY_STORE_PLATFORMS.find(p => p.id === platformId)?.placeholder || 'https://...';
}

function buildBuyStoreFieldHtml({ wrapId, platform, buyLink, optional }) {
  const nonePill = optional
    ? `<button type="button" class="buy-store-pill filter-pill${!platform ? ' active' : ''}" data-platform="" onclick="selectQueueBuyPlatform('${wrapId}', '')">No store</button>`
    : '';
  const pills = nonePill + BUY_STORE_PLATFORMS.map(p =>
    `<button type="button" class="buy-store-pill filter-pill${platform === p.id ? ' active' : ''}" data-platform="${p.id}" onclick="selectQueueBuyPlatform('${wrapId}', '${p.id}')">${p.label}</button>`
  ).join('');
  const showInput = !!platform;
  const label = optional
    ? 'Buy link <span class="field-optional">(optional)</span>'
    : 'Where can people buy this beat? *';
  const pickHint = optional
    ? 'Optional — skip if fans should open the preview.'
    : 'Select where you sell this beat.';
  return `
    <div class="buy-store-field${optional ? ' buy-store-field--optional' : ''}" data-buy-wrap="${wrapId}">
      <label class="field-label">${label}</label>
      <div class="buy-store-pills filter-pills" role="list">${pills}</div>
      <input type="url" class="buy-store-input" value="${escHtml(buyLink || '')}" placeholder="${escHtml(buyStorePlaceholder(platform))}"
        style="display:${showInput ? 'block' : 'none'}" oninput="updateQueueField('${wrapId}', 'buyLink', this.value)">
      <div class="buy-store-hint" style="display:${showInput ? 'block' : 'none'}">Paste the track page — fans leave BeatSwipe to buy there.</div>
      <div class="buy-store-pick-hint" style="display:${showInput ? 'none' : 'block'}">${pickHint}</div>
    </div>`;
}

function syncOptionalBuyStore(previewType) {
  const buyStore = document.getElementById('submitBuyStore');
  if (!buyStore) return;
  if (previewType !== 'YouTube' && previewType !== 'SoundCloud') {
    buyStore.style.display = 'none';
    return;
  }
  buyStore.style.display = 'block';
  const wrap = buyStore.querySelector('[data-buy-wrap="single"]');
  if (!wrap || !wrap.classList.contains('buy-store-field--optional')) {
    const state = wrap ? getBuyWrapState('single') : { platform: '', buyLink: '' };
    mountBuyStoreField('submitBuyStore', {
      wrapId: 'single',
      platform: state.platform,
      buyLink: state.buyLink,
      optional: true
    });
  }
  const pickHint = buyStore.querySelector('.buy-store-pick-hint');
  if (pickHint) {
    pickHint.textContent = previewType === 'YouTube'
      ? 'Optional — skip if fans should open YouTube.'
      : 'Optional — skip if fans should open SoundCloud.';
  }
}

function selectQueueBuyPlatform(wrapId, platform) {
  const wrap = document.querySelector(`[data-buy-wrap="${wrapId}"]`);
  if (!wrap) return;
  const item = _mp3Queue.find(q => q.id === wrapId);
  if (item) item.buyPlatform = platform;
  wrap.querySelectorAll('.buy-store-pill').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.platform || '') === (platform || ''));
  });
  const input = wrap.querySelector('.buy-store-input');
  const hint = wrap.querySelector('.buy-store-hint');
  const pickHint = wrap.querySelector('.buy-store-pick-hint');
  const showInput = !!platform;
  if (input) {
    input.style.display = showInput ? 'block' : 'none';
    input.placeholder = buyStorePlaceholder(platform);
    if (!showInput) {
      input.value = '';
      if (item) item.buyLink = '';
    } else if (!input.value.trim()) {
      input.focus();
    }
  }
  if (hint) hint.style.display = showInput ? 'block' : 'none';
  if (pickHint) pickHint.style.display = showInput ? 'none' : 'block';
  refreshQueueItemChrome(wrapId);
}

function genreSelectHtml(selected, id, onchange) {
  const opts = SUBMIT_GENRES.map(g =>
    `<option value="${g}"${g === selected ? ' selected' : ''}>${g}</option>`).join('');
  return `<select id="${id}" onchange="${onchange}"><option value="">Select genre...</option>${opts}</select>`;
}

function typeSelectHtml(selected, id, onchange) {
  const opts = SUBMIT_TYPES.map(t =>
    `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`).join('');
  return `<select id="${id}" onchange="${onchange}"><option value="">Select type...</option>${opts}</select>`;
}

function syncQueueFormLayout() {
  const type = document.getElementById('f-preview-type')?.value;
  const showDetails = type === 'YouTube' || type === 'SoundCloud';
  const details = document.getElementById('submitDetailsCard');
  const singleFields = document.getElementById('submitSingleFields');
  if (details) details.style.display = showDetails ? 'flex' : 'none';
  if (singleFields) singleFields.style.display = showDetails ? 'block' : 'none';
  syncUploadDropState();
}

function syncUploadDropState() {
  const drop = document.getElementById('uploadDrop');
  if (drop) drop.classList.toggle('has-files', _mp3Queue.length > 0);
}

function validateMp3File(file) {
  if (file.type !== ALLOWED_MIME && !file.name.toLowerCase().endsWith('.mp3')) {
    return 'MP3 files only.';
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `File too large — max. ${MAX_FILE_MB} MB.`;
  }
  return null;
}

function renderUploadQueue() {
  const wrap = document.getElementById('uploadQueue');
  if (!wrap) return;
  if (!_mp3Queue.length) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    _mp3File = null;
    syncQueueFormLayout();
    syncSubmitBtnLabel();
    return;
  }
  wrap.style.display = 'flex';
  _mp3File = _mp3Queue[0].file;
  const n = _mp3Queue.length;
  const kicker = `<div class="upload-queue-kicker">${n} preview${n === 1 ? '' : 's'} · add title, genre and store for each</div>`;
  wrap.innerHTML = kicker + _mp3Queue.map((item, index) => {
    const openClass = item.expanded ? ' open' : '';
    const chev = item.expanded ? 'ti-chevron-down' : 'ti-chevron-right';
    const ready = isQueueItemReady(item);
    const size = formatFileSize(item.file.size);
    return `
    <div class="upload-queue-acc${openClass}" data-id="${item.id}">
      <button type="button" class="upload-queue-head" onclick="toggleQueueExpand('${item.id}')">
        <span class="upload-queue-num">${index + 1}</span>
        <span class="upload-queue-head-text">
          <span class="upload-queue-summary" id="summary-${item.id}">${escHtml(item.title?.trim() || 'Untitled')}</span>
          <span class="upload-queue-file">${escHtml(item.file.name)}${size ? ' · ' + size : ''}</span>
        </span>
        <span class="upload-queue-status ${ready ? 'is-ready' : 'is-todo'}" id="qstatus-${item.id}">${ready ? 'Ready' : 'Details'}</span>
        <i class="ti upload-queue-chevron ${chev}"></i>
      </button>
      <div class="upload-queue-body" style="display:${item.expanded ? 'block' : 'none'}">
        <div class="upload-queue-fields">
          <div>
            <label class="field-label">Title *</label>
            <input type="text" value="${escHtml(item.title)}" placeholder="Track title" maxlength="80"
              oninput="updateQueueField('${item.id}', 'title', this.value)">
          </div>
          <div class="upload-queue-row">
            <div>
              <label class="field-label">Genre *</label>
              ${genreSelectHtml(item.genre, 'qg-' + item.id, `updateQueueField('${item.id}', 'genre', this.value)`)}
            </div>
            <div>
              <label class="field-label">Type *</label>
              ${typeSelectHtml(item.type, 'qt-' + item.id, `updateQueueField('${item.id}', 'type', this.value)`)}
            </div>
          </div>
          <div class="upload-queue-row">
            <div>
              <label class="field-label">BPM <span class="field-optional">(optional)</span></label>
              <input type="number" value="${escHtml(item.bpm || '')}" placeholder="140" min="${BPM_MIN}" max="${BPM_MAX}" step="1"
                oninput="updateQueueField('${item.id}', 'bpm', this.value)">
            </div>
            <div>
              <label class="field-label">Key <span class="field-optional">(optional)</span></label>
              <input type="text" value="${escHtml(item.key || '')}" placeholder="F# Min"
                oninput="updateQueueField('${item.id}', 'key', this.value)">
            </div>
          </div>
          ${buildBuyStoreFieldHtml({ wrapId: item.id, platform: item.buyPlatform || '', buyLink: item.buyLink || '' })}
          <div>
            <label class="field-label">Cover <span class="field-optional">(optional)</span></label>
            ${beatCoverPickHTML({
              inputId: 'qc-' + item.id,
              previewSrc: item.coverPreview || '',
              onChange: `onQueueCoverPicked('${item.id}', this)`,
              onClear: `clearQueueCover('${item.id}')`
            })}
          </div>
          <button type="button" class="upload-queue-remove" onclick="removeQueueItem('${item.id}')"><i class="ti ti-trash"></i> Remove</button>
        </div>
      </div>
    </div>`;
  }).join('');
  syncQueueFormLayout();
  syncSubmitBtnLabel();
}

function refreshQueueItemChrome(id) {
  const item = _mp3Queue.find(q => q.id === id);
  if (!item) return;
  const titleEl = document.getElementById('summary-' + id);
  if (titleEl) titleEl.textContent = item.title?.trim() || 'Untitled';
  const statusEl = document.getElementById('qstatus-' + id);
  if (statusEl) {
    const ready = isQueueItemReady(item);
    statusEl.textContent = ready ? 'Ready' : 'Details';
    statusEl.classList.toggle('is-ready', ready);
    statusEl.classList.toggle('is-todo', !ready);
  }
}

function updateQueueField(id, field, value) {
  const item = _mp3Queue.find(q => q.id === id);
  if (!item) return;
  item[field] = value;
  refreshQueueItemChrome(id);
}

function toggleQueueExpand(id) {
  const item = _mp3Queue.find(q => q.id === id);
  if (!item) return;
  item.expanded = !item.expanded;
  const acc = document.querySelector(`.upload-queue-acc[data-id="${id}"]`);
  if (!acc) return;
  acc.classList.toggle('open', item.expanded);
  const body = acc.querySelector('.upload-queue-body');
  const icon = acc.querySelector('.upload-queue-chevron');
  if (body) body.style.display = item.expanded ? 'block' : 'none';
  if (icon) icon.className = 'ti upload-queue-chevron ' + (item.expanded ? 'ti-chevron-down' : 'ti-chevron-right');
}

function expandQueueItem(id) {
  const item = _mp3Queue.find(q => q.id === id);
  if (item && !item.expanded) {
    item.expanded = true;
    renderUploadQueue();
  }
}

function addFilesToQueue(fileList) {
  const errEl = document.getElementById('uploadError');
  if (errEl) errEl.style.display = 'none';
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const previewSel = document.getElementById('f-preview-type');
  if (previewSel && previewSel.value !== 'MP3') {
    previewSel.value = 'MP3';
    updatePreviewLabel();
  }

  let added = 0;
  const errors = [];
  for (const file of files) {
    if (_mp3Queue.length >= MAX_MP3_QUEUE) {
      errors.push(`Max. ${MAX_MP3_QUEUE} files per batch.`);
      break;
    }
    const err = validateMp3File(file);
    if (err) { errors.push(`${file.name}: ${err}`); continue; }
    const dup = _mp3Queue.some(q => q.file.name === file.name && q.file.size === file.size);
    if (dup) continue;
    const isFirst = _mp3Queue.length === 0 && added === 0;
    _mp3Queue.push({
      id: 'q' + (++_mp3QueueId),
      file,
      title: titleFromFilename(file.name),
      bpm: '',
      key: '',
      genre: '',
      type: '',
      buyLink: '',
      buyPlatform: '',
      coverFile: null,
      coverPreview: '',
      expanded: isFirst
    });
    added++;
  }

  if (errors.length && errEl) {
    errEl.textContent = errors[0];
    errEl.style.display = 'block';
  } else if (added && errEl) {
    errEl.style.display = 'none';
  }
  renderUploadQueue();
}

function removeQueueItem(id) {
  const item = _mp3Queue.find(q => q.id === id);
  if (item) revokeCoverPreview(item.coverPreview);
  _mp3Queue = _mp3Queue.filter(q => q.id !== id);
  renderUploadQueue();
  if (!_mp3Queue.length) resetUploadUI();
}

function clearMp3Queue() {
  _mp3Queue.forEach(q => revokeCoverPreview(q.coverPreview));
  _mp3Queue = [];
  _mp3File = null;
  _mp3PublicUrl = null;
  renderUploadQueue();
}

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('uploadDrop')?.classList.add('dragover');
}
function handleDragLeave(e) {
  document.getElementById('uploadDrop')?.classList.remove('dragover');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadDrop')?.classList.remove('dragover');
  addFilesToQueue(e.dataTransfer?.files);
}
function handleFileSelect(e) {
  addFilesToQueue(e.target.files);
  e.target.value = '';
}

function resetUploadUI() {
  const drop = document.getElementById('uploadDrop');
  if (drop) drop.style.display = 'flex';
  const progressWrap = document.getElementById('uploadProgressWrap');
  if (progressWrap) progressWrap.style.display = 'none';
  const progressFill = document.getElementById('uploadProgressFill');
  if (progressFill) progressFill.style.width = '0%';
  const errEl = document.getElementById('uploadError');
  if (errEl) errEl.style.display = 'none';
  const oldInput = document.getElementById('f-mp3-file');
  if (oldInput) {
    const newInput = document.createElement('input');
    newInput.type = 'file';
    newInput.id = 'f-mp3-file';
    newInput.accept = 'audio/mpeg,.mp3';
    newInput.multiple = true;
    newInput.style.display = 'none';
    newInput.onchange = handleFileSelect;
    oldInput.parentNode.replaceChild(newInput, oldInput);
  }
  syncUploadDropState();
}

async function getSupabaseAccessToken() {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Session expired — please sign out and sign back in.');
  return accessToken;
}

async function uploadMp3File(file, onProgress) {
  if (!file) throw new Error('no file');
  if (!currentUser) throw new Error('Not signed in — please log in first.');

  const accessToken = await getSupabaseAccessToken();
  const ext = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const uploadUrl = `${SUPA_URL}/storage/v1/object/${SUPA_BUCKET}/${fileName}`;

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 95);
        onProgress(pct);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200 || xhr.status === 201) {
        resolve(`${SUPA_URL}/storage/v1/object/public/${SUPA_BUCKET}/${fileName}`);
      } else {
        let errMsg = 'Upload failed (status ' + xhr.status + ')';
        try { errMsg = JSON.parse(xhr.responseText).message || errMsg; } catch (e) {}
        reject(new Error(errMsg));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload — please check your connection.')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload timeout — file too large or connection too slow.')));
    xhr.timeout = 120000;
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Cache-Control', '3600');
    xhr.send(file);
  });
}

function revokeCoverPreview(url) {
  if (url && String(url).startsWith('blob:')) URL.revokeObjectURL(url);
}

function validateCoverFile(file) {
  if (!file) return 'Choose an image.';
  const okType = /^image\/(jpeg|jpg|png|webp|gif)/i.test(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name);
  if (!okType) return 'Use a JPG, PNG, or WebP image.';
  if (file.size > COVER_MAX_SOURCE_MB * 1024 * 1024) return `Cover must be under ${COVER_MAX_SOURCE_MB} MB.`;
  return null;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

async function fileToCoverBlob(file) {
  const err = validateCoverFile(file);
  if (err) throw new Error(err);
  const img = await loadImageFromFile(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error('Could not read that image.');
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const out = Math.min(COVER_MAX_PX, side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Could not process image.');
  return blob;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.includes(',') ? s.split(',')[1] : s);
    };
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(blob);
  });
}

async function coverBlobToPng(blob) {
  const img = await loadImageFromFile(blob);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('Could not process image.');
  return png;
}

async function postCoverBlob(blob) {
  const accessToken = await getSupabaseAccessToken();
  const res = await fetch('/api/manage-beat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'upload-cover',
      mime: blob.type || 'image/jpeg',
      image: await blobToBase64(blob)
    })
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok || !data.url) {
    throw new Error(data.error || data.message || 'Cover upload failed');
  }
  return data.url;
}

async function uploadCoverBlob(blob) {
  if (!currentUser) throw new Error('Not signed in — please log in first.');
  try {
    return await postCoverBlob(blob);
  } catch (e) {
    if (!/mime|not supported|jpeg|storage/i.test(String(e.message || ''))) throw e;
    return await postCoverBlob(await coverBlobToPng(blob));
  }
}

function beatCoverPickHTML(opts) {
  const hasImg = !!opts.previewSrc;
  const previewInner = hasImg
    ? `<img src="${escHtml(opts.previewSrc)}" alt="">`
    : '<i class="ti ti-photo"></i>';
  return `<div class="beat-cover-pick">
    <div class="beat-cover-pick-preview">${previewInner}</div>
    <div class="beat-cover-pick-copy">
      <input type="file" id="${escHtml(opts.inputId)}" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp" style="display:none" onchange="${opts.onChange}">
      <div class="beat-cover-pick-actions">
        <button type="button" class="beat-cover-pick-btn" onclick="document.getElementById('${escHtml(opts.inputId)}').click()">${hasImg ? 'Change cover' : 'Add cover'}</button>
        ${hasImg && opts.onClear ? `<button type="button" class="beat-cover-pick-clear" onclick="${opts.onClear}">Remove</button>` : ''}
      </div>
      <div class="field-hint">Optional · square crop on the swipe card</div>
    </div>
  </div>`;
}

function renderSingleCoverPick() {
  const host = document.getElementById('singleCoverPick');
  if (!host) return;
  host.innerHTML = beatCoverPickHTML({
    inputId: 'f-cover-file',
    previewSrc: _singleCoverPreview,
    onChange: 'onSingleCoverPicked(this)',
    onClear: 'clearSingleCover()'
  });
}

function onSingleCoverPicked(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const err = validateCoverFile(file);
  if (err) { showToast(err, 'error'); return; }
  revokeCoverPreview(_singleCoverPreview);
  _singleCoverFile = file;
  _singleCoverPreview = URL.createObjectURL(file);
  renderSingleCoverPick();
}

function clearSingleCover() {
  revokeCoverPreview(_singleCoverPreview);
  _singleCoverFile = null;
  _singleCoverPreview = '';
  renderSingleCoverPick();
}

function renderEditCoverPick(beat) {
  const host = document.getElementById('beatEditCoverPick');
  if (!host) return;
  const previewSrc = _editCoverPreview || (!_editCoverCleared && (beat?.cover || beat?.cover_url) || '');
  host.innerHTML = beatCoverPickHTML({
    inputId: 'beat-edit-cover-file',
    previewSrc,
    onChange: 'onEditCoverPicked(this)',
    onClear: 'clearEditCover()'
  });
}

function onEditCoverPicked(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const err = validateCoverFile(file);
  if (err) { showToast(err, 'error'); return; }
  revokeCoverPreview(_editCoverPreview);
  _editCoverFile = file;
  _editCoverPreview = URL.createObjectURL(file);
  _editCoverCleared = false;
  renderEditCoverPick(findMyBeatById(_editingBeatId));
}

function clearEditCover() {
  revokeCoverPreview(_editCoverPreview);
  _editCoverFile = null;
  _editCoverPreview = '';
  _editCoverCleared = true;
  renderEditCoverPick(findMyBeatById(_editingBeatId));
}

function onQueueCoverPicked(id, input) {
  const item = _mp3Queue.find(q => q.id === id);
  const file = input.files && input.files[0];
  input.value = '';
  if (!item || !file) return;
  const err = validateCoverFile(file);
  if (err) { showToast(err, 'error'); return; }
  revokeCoverPreview(item.coverPreview);
  item.coverFile = file;
  item.coverPreview = URL.createObjectURL(file);
  renderUploadQueue();
}

function clearQueueCover(id) {
  const item = _mp3Queue.find(q => q.id === id);
  if (!item) return;
  revokeCoverPreview(item.coverPreview);
  item.coverFile = null;
  item.coverPreview = '';
  renderUploadQueue();
}

async function uploadMp3ToSupabase() {
  if (!_mp3File) throw new Error('no file');
  const progressWrap = document.getElementById('uploadProgressWrap');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressLbl  = document.getElementById('uploadProgressLbl');
  progressWrap.style.display = 'block';
  progressFill.style.width = '5%';
  progressLbl.textContent = 'Uploading…';
  const url = await uploadMp3File(_mp3File, pct => {
    progressFill.style.width = pct + '%';
    progressLbl.textContent = `Uploading… ${pct}%`;
  });
  progressFill.style.width = '100%';
  progressLbl.textContent = 'Upload complete ✓';
  return url;
}

async function postBeatSubmit(payload) {
  const token = await getAccessToken();
  if (!token) throw new Error('Session expired — please sign in again.');
  const res = await fetch('/api/submit-beat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseManageBeatError(data.error) || 'Submit failed');
  return data;
}

function getResolvedBuyState(wrapId) {
  const { platform, buyLink } = getBuyWrapState(wrapId);
  return { platform, buyLink, error: validateBuyLink(buyLink, platform) };
}

function setSubmitBtnLoading(loading, label) {
  const btn = document.getElementById('submitBeatBtn');
  const addBtn = document.getElementById('addBeatBtn');
  if (btn) {
    btn.disabled = loading;
    if (loading) {
      btn.innerHTML = `<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> ${label || 'Sending...'}`;
    } else {
      syncSubmitBtnLabel();
    }
  }
  if (addBtn) {
    if (loading) {
      addBtn.dataset.loading = '1';
      addBtn.disabled = true;
    } else {
      delete addBtn.dataset.loading;
      syncSubmitBtnLabel();
    }
  }
}

function showSubmitError(message) {
  const msg = message || 'Something went wrong';
  const addErr = document.getElementById('addBeatError');
  if (addErr) {
    addErr.hidden = false;
    addErr.textContent = msg;
  }
  const mp3Group = document.getElementById('preview-mp3-group');
  const mp3Visible = mp3Group && mp3Group.style.display !== 'none';
  const errEl = document.getElementById('uploadError');
  if (errEl) {
    if (mp3Visible) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    } else {
      errEl.style.display = 'none';
    }
  }
  showToast(msg, 'error', 3600);
}

function clearSubmitError() {
  const addErr = document.getElementById('addBeatError');
  if (addErr) {
    addErr.hidden = true;
    addErr.textContent = '';
  }
  const errEl = document.getElementById('uploadError');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
}

function clearBeatFormAfterSubmit() {
  ['f-title', 'f-bpm', 'f-key', 'f-preview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  clearMp3Queue();
  resetUploadUI();
  clearSingleCover();
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────
async function doSubmitForm() {
  clearSubmitError();
  try {
    await doSubmitFormInner();
  } catch (e) {
    console.error('[BeatSwipe] submitForm error:', e);
    setSubmitBtnLoading(false);
    showSubmitError(e.message || 'Something went wrong');
  }
}

async function doSubmitFormInner() {
  const producer = (_userProfile?.producer_name || document.getElementById('f-producer')?.value || '').trim();
  if (!producer) {
    showToast('Complete your page setup first — add your producer name.', 'error');
    hideMyPageAddBeat();
    renderMyPage();
    return;
  }
  const prodEl = document.getElementById('f-producer');
  if (prodEl) prodEl.value = producer;

  const previewType = document.getElementById('f-preview-type')?.value || '';
  if (!previewType) {
    showSubmitError('Please select a preview type.');
    return;
  }

  if (previewType === 'MP3') {
    if (!_mp3Queue.length) {
      showSubmitError('Please add at least one MP3 file.');
      return;
    }
    for (const item of _mp3Queue) {
      const label = item.title.trim() || item.file.name;
      if (!item.title.trim()) {
        showSubmitError('Please add a title for each track.');
        expandQueueItem(item.id);
        return;
      }
      if (!item.genre.trim()) {
        showSubmitError(`Select a genre for "${label}".`);
        expandQueueItem(item.id);
        return;
      }
      if (!item.type.trim()) {
        showSubmitError(`Select a type for "${label}".`);
        expandQueueItem(item.id);
        return;
      }
      const bpmErr = validateBpm(item.bpm);
      if (bpmErr) {
        showSubmitError(`"${label}": ${bpmErr}`);
        expandQueueItem(item.id);
        return;
      }
      if (!item.buyPlatform) {
        showSubmitError(`Select where you sell "${label}".`);
        expandQueueItem(item.id);
        return;
      }
      const buyErr = validateBuyLink(item.buyLink, item.buyPlatform);
      if (buyErr) {
        showSubmitError(`"${label}": ${buyErr}`);
        expandQueueItem(item.id);
        return;
      }
    }
    return doSubmitMp3Batch({ producer });
  }

  const genre = document.getElementById('f-genre')?.value.trim() || '';
  const type = document.getElementById('f-type')?.value.trim() || '';
  if (!genre || !type) {
    showSubmitError('Please fill in genre and type.');
    return;
  }

  const bpm = document.getElementById('f-bpm')?.value.trim() || '';
  const bpmErr = validateBpm(bpm);
  if (bpmErr) { showSubmitError(bpmErr); return; }
  const key = document.getElementById('f-key')?.value.trim() || '';

  const title = document.getElementById('f-title')?.value.trim() || '';
  if (!title) { showSubmitError('Please enter a track title.'); return; }

  let previewUrl = '';
  let buyLinkOverride = '';
  if (previewType === 'YouTube' || previewType === 'SoundCloud') {
    previewUrl = document.getElementById('f-preview')?.value.trim() || '';
    if (previewType === 'SoundCloud' && typeof extractSoundCloudUrl === 'function') {
      previewUrl = extractSoundCloudUrl(previewUrl) || previewUrl;
    }
    const previewErr = validatePreviewUrl(previewType, previewUrl);
    if (previewErr) { showSubmitError(previewErr); return; }
    const buyState = getBuyWrapState('single');
    if (buyState.platform || buyState.buyLink) {
      const plat = buyState.platform || detectBuyPlatform(buyState.buyLink);
      const buyErr = validateBuyLink(buyState.buyLink, plat);
      if (buyErr) { showSubmitError(buyErr); return; }
      buyLinkOverride = normalizeBuyLink(buyState.buyLink);
    }
  }

  setSubmitBtnLoading(true, 'Publishing...');

  let coverUrl = '';
  if (_singleCoverFile) {
    const blob = await fileToCoverBlob(_singleCoverFile);
    coverUrl = await uploadCoverBlob(blob);
  }
  await postBeatSubmit({
    title,
    bpm: parseFloat(bpm) || null,
    key,
    genre,
    type,
    previewType,
    previewUrl,
    buyLink: buyLinkOverride || previewUrl,
    coverUrl
  });

  finishSubmitSuccess(1);
}

async function doSubmitMp3Batch(shared) {
  const total = _mp3Queue.length;
  const queue = _mp3Queue.slice();
  const errEl = document.getElementById('uploadError');
  const progressWrap = document.getElementById('uploadProgressWrap');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressLbl = document.getElementById('uploadProgressLbl');
  if (errEl) errEl.style.display = 'none';
  if (progressWrap) progressWrap.style.display = 'block';

  setSubmitBtnLoading(true, `Uploading 1 of ${total}…`);

  const submitted = [];
  try {
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const n = i + 1;
      setSubmitBtnLoading(true, `Uploading ${n} of ${total}…`);
      progressLbl.textContent = `Uploading ${n} of ${total} — ${item.title}`;
      progressFill.style.width = '5%';

      let previewUrl;
      try {
        previewUrl = await uploadMp3File(item.file, pct => {
          progressFill.style.width = Math.max(5, pct) + '%';
        });
      } catch (uploadErr) {
        throw new Error(`"${item.title}": ${uploadErr.message}`);
      }

      progressLbl.textContent = `Saving ${n} of ${total}…`;
      let coverUrl = '';
      if (item.coverFile) {
        progressLbl.textContent = `Cover ${n} of ${total}…`;
        const blob = await fileToCoverBlob(item.coverFile);
        coverUrl = await uploadCoverBlob(blob);
        progressLbl.textContent = `Saving ${n} of ${total}…`;
      }
      await postBeatSubmit({
        title: item.title.trim(),
        bpm: parseFloat(item.bpm) || null,
        key: item.key || '',
        genre: item.genre,
        type: item.type,
        previewType: 'MP3',
        previewUrl,
        buyLink: normalizeBuyLink(item.buyLink),
        coverUrl
      });
      submitted.push(item.title.trim());
      progressFill.style.width = '100%';
    }

    finishSubmitSuccess(submitted.length);
  } catch (e) {
    console.error('[BeatSwipe] batch submit error:', e);
    setSubmitBtnLoading(false);
    if (progressWrap) progressWrap.style.display = 'none';
    showSubmitError(submitted.length
      ? `${submitted.length} uploaded. Failed on next: ${e.message}`
      : (e.message || 'Upload failed'));
    if (submitted.length) {
      _mp3Queue = _mp3Queue.filter(q => !submitted.includes(q.title.trim()));
      renderUploadQueue();
      renderMyPage();
    }
  }
}

async function finishSubmitSuccess(count) {
  clearSubmitError();
  const successMsg = document.getElementById('successMsg');
  if (successMsg) {
    const p = successMsg.querySelector('p');
    if (p) {
      p.textContent = count > 1
        ? `${count} beats are live on your page.`
        : 'Beat is live on your page.';
    }
    successMsg.style.display = 'block';
  }
  setSubmitBtnLoading(false);
  clearBeatFormAfterSubmit();

  try { await loadBeats({ force: true }); } catch (e) {}

  setTimeout(() => {
    if (successMsg) successMsg.style.display = 'none';
    hideMyPageAddBeat();
    renderMyPage();
  }, count > 1 ? 1600 : 1200);
}

function resetSubmitForAnother() {
  const successMsg = document.getElementById('successMsg');
  if (successMsg) successMsg.style.display = 'none';
  ['f-title', 'f-bpm', 'f-key', 'f-preview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  clearMp3Queue();
  resetUploadUI();
  resetAddBeatForm();
  updatePreviewLabel();
  syncSubmitBtnLabel();
  document.getElementById('f-title')?.focus();
}

function renderSubmitScreen() {
  renderMyPage();
}

// ─── MY PAGE (producer dashboard) ─────────────────────────────────────────
let _myPageObStep = 0;
let _myPendingBeatsCache = null;
let _myPendingBeatsCacheAt = 0;
let _pendingRefreshInFlight = null;
const PENDING_CACHE_TTL_MS = 60000;

function myPageStorageKey(suffix) {
  return currentUser ? `bs_${suffix}_${currentUser.id}` : null;
}

function isMyPageOnboarded() {
  if (!currentUser) return false;
  const key = myPageStorageKey('page_setup');
  if (key && localStorage.getItem(key) === '1') return true;
  if (typeof hasProducerSetupIntent === 'function' && hasProducerSetupIntent()) return false;
  const name = _userProfile?.producer_name?.trim();
  if (name && getMyLiveBeats().length >= 1) {
    if (key) localStorage.setItem(key, '1');
    return true;
  }
  return false;
}

function markMyPageOnboarded() {
  const key = myPageStorageKey('page_setup');
  if (key) localStorage.setItem(key, '1');
}

function getMyPendingBeatsLocal() {
  const key = myPageStorageKey('pending_beats');
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}

function getMyPendingBeats() {
  if (_myPendingBeatsCache !== null) return _myPendingBeatsCache;
  return getMyPendingBeatsLocal();
}

async function refreshMyPendingBeats(opts) {
  const force = opts && opts.force;
  if (!currentUser) {
    _myPendingBeatsCache = [];
    _myPendingBeatsCacheAt = 0;
    return [];
  }
  if (!force && _myPendingBeatsCache !== null && (Date.now() - _myPendingBeatsCacheAt) < PENDING_CACHE_TTL_MS) {
    return _myPendingBeatsCache;
  }
  if (_pendingRefreshInFlight) return _pendingRefreshInFlight;

  _pendingRefreshInFlight = (async () => {
    const token = await getAccessToken();
    if (!token) {
      _myPendingBeatsCache = getMyPendingBeatsLocal();
      return _myPendingBeatsCache;
    }
    try {
      const res = await fetch('/api/pending-beats', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        _myPendingBeatsCache = (data.pending || []).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        _myPendingBeatsCacheAt = Date.now();
        const key = myPageStorageKey('pending_beats');
        if (key) localStorage.removeItem(key);
        return _myPendingBeatsCache;
      }
    } catch (e) {
      console.warn('refreshMyPendingBeats failed:', e);
    }
    if (_myPendingBeatsCache === null) _myPendingBeatsCache = getMyPendingBeatsLocal();
    return _myPendingBeatsCache;
  })();

  try {
    return await _pendingRefreshInFlight;
  } finally {
    _pendingRefreshInFlight = null;
  }
}

function rerenderMyPageIfActive() {
  if (_myPageDrag || _myPagePointer) return;
  const add = document.getElementById('myPageAddBeat');
  if (add && add.style.display !== 'none') return;
  if (!document.getElementById('submitScreen')?.classList.contains('active')) return;
  const main = document.getElementById('myPageMain');
  if (!main || !currentUser) return;
  if (!isMyPageOnboarded()) {
    main.innerHTML = renderMyPageOnboarding();
  } else {
    main.innerHTML = renderMyPageDashboard();
  }
  updateMyPageLeftRail();
  renderMyPageSidePanel();
}

function addMyPendingBeat(title) {
  const entry = { title, submittedAt: Date.now() };
  if (_myPendingBeatsCache !== null) {
    _myPendingBeatsCache = [..._myPendingBeatsCache, entry];
    return;
  }
  const key = myPageStorageKey('pending_beats');
  if (!key) return;
  const list = getMyPendingBeatsLocal();
  list.push(entry);
  localStorage.setItem(key, JSON.stringify(list));
}

function parseBeatOrder(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter(Boolean) : null;
  } catch (e) { return null; }
}

function getStoredBeatOrderIds() {
  const fromProfile = parseBeatOrder(_userProfile?.beat_order);
  if (fromProfile?.length) return fromProfile;
  const key = myPageStorageKey('beat_order');
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}

function sortBeatsByOrder(beats, orderIds) {
  if (!orderIds?.length) return beats.slice();
  const orderMap = new Map(orderIds.map((id, i) => [id, i]));
  return beats.slice().sort((a, b) => {
    const ai = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
    const bi = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
    if (ai !== bi) return ai - bi;
    return (a.title || '').localeCompare(b.title || '');
  });
}

function getBeatOrderForProducer(producerName, profile) {
  const own = (_userProfile?.producer_name || '').trim() === (producerName || '').trim();
  if (own) return getStoredBeatOrderIds();
  return parseBeatOrder(profile?.beat_order) || [];
}

async function persistBeatOrder(ids) {
  const order = Array.isArray(ids) ? ids.filter(Boolean) : [];
  const key = myPageStorageKey('beat_order');
  if (key) localStorage.setItem(key, JSON.stringify(order));
  const token = await getAccessToken();
  if (!token || !currentUser) return;
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPA_KEY,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ id: currentUser.id, beat_order: order, updated_at: new Date().toISOString() })
    });
    if (res.ok) _userProfile = { ..._userProfile, beat_order: order };
  } catch (e) {}
}

function syncBeatOrderWithLive(liveBeats) {
  const ids = liveBeats.map(b => b.id);
  const stored = getStoredBeatOrderIds().filter(id => ids.includes(id));
  ids.forEach(id => { if (!stored.includes(id)) stored.push(id); });
  if (stored.length) void persistBeatOrder(stored);
  return stored;
}

function getMyLiveBeats() {
  const name = _userProfile?.producer_name?.trim();
  if (!name) return [];
  const beats = Object.values(_rawDb || {}).flat().filter(b => b.producer === name);
  return sortBeatsByOrder(beats, getStoredBeatOrderIds());
}

function findMyBeatById(beatId) {
  return getMyLiveBeats().find(b => b.id === beatId) || Object.values(_rawDb || {}).flat().find(b => b.id === beatId);
}

function parseBpmValue(bpmStr) {
  if (!bpmStr || bpmStr === '--- BPM') return '';
  const n = parseInt(String(bpmStr).replace(/\s*BPM/i, ''), 10);
  return Number.isNaN(n) ? '' : String(n);
}

function parseKeyValue(keyStr) {
  if (!keyStr || keyStr === 'N/A') return '';
  return keyStr;
}

function formatMyBeatMeta(beat) {
  const parts = [];
  const bpm = parseBpmValue(beat.bpm);
  if (bpm) parts.push(bpm + ' BPM');
  if (beat.genre) parts.push(beat.genre);
  if (beat.type) parts.push(beat.type);
  return parts.join(' · ');
}

let _editingBeatId = null;
let _myPageBeatDragging = false;

function openBeatEditModal(beatId) {
  const beat = findMyBeatById(beatId);
  if (!beat) return;
  _editingBeatId = beatId;
  _editCoverFile = null;
  revokeCoverPreview(_editCoverPreview);
  _editCoverPreview = '';
  _editCoverCleared = false;
  document.getElementById('beat-edit-title').value = beat.title || '';
  document.getElementById('beat-edit-genre').value = beat.genre && beat.genre !== 'Other' ? beat.genre : (beat.genre || '');
  document.getElementById('beat-edit-type').value = beat.type || '';
  document.getElementById('beat-edit-bpm').value = parseBpmValue(beat.bpm);
  document.getElementById('beat-edit-key').value = parseKeyValue(beat.key);
  mountBuyStoreField('beatEditBuyStore', {
    wrapId: 'edit',
    platform: detectBuyPlatform(beat.buy),
    buyLink: beat.buy || ''
  });
  renderEditCoverPick(beat);
  document.getElementById('beatEditModal')?.classList.add('open');
}

function closeBeatEditModal() {
  revokeCoverPreview(_editCoverPreview);
  _editCoverFile = null;
  _editCoverPreview = '';
  _editCoverCleared = false;
  _editingBeatId = null;
  document.getElementById('beatEditModal')?.classList.remove('open');
}

function parseManageBeatError(raw) {
  if (!raw) return 'Request failed';
  const text = String(raw);
  try {
    const j = JSON.parse(text);
    if (j?.error?.message) return j.error.message;
    if (j?.error) return String(j.error);
  } catch (_) {}
  return text;
}

async function manageBeatRequest(action, beatId, fields) {
  const token = await getAccessToken();
  if (!token) throw new Error('Session expired — please sign in again.');
  const res = await fetch('/api/manage-beat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action, beatId, fields })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseManageBeatError(data.error) || 'Request failed');
  return data;
}

async function saveBeatEdit() {
  if (!_editingBeatId) return;
  const title = document.getElementById('beat-edit-title')?.value.trim();
  const genre = document.getElementById('beat-edit-genre')?.value.trim();
  const type = document.getElementById('beat-edit-type')?.value.trim();
  const bpm = document.getElementById('beat-edit-bpm')?.value.trim();
  const key = document.getElementById('beat-edit-key')?.value.trim();
  const buyState = getResolvedBuyState('edit');
  if (!title) { showToast('Title is required.', 'error'); return; }
  if (!genre || !type) { showToast('Genre and type are required.', 'error'); return; }
  const bpmErr = validateBpm(bpm);
  if (bpmErr) { showToast(bpmErr, 'error'); return; }
  if (buyState.error) { showToast(buyState.error, 'error'); return; }

  const btn = document.getElementById('beatEditSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Saving...';
  }
  try {
    const fields = {
      title, genre, type, bpm, key, buy: normalizeBuyLink(buyState.buyLink)
    };
    if (_editCoverCleared) fields.cover = null;
    else if (_editCoverFile) {
      const blob = await fileToCoverBlob(_editCoverFile);
      fields.cover = await uploadCoverBlob(blob);
    }
    const result = await manageBeatRequest('update', _editingBeatId, fields);
    closeBeatEditModal();
    showToast(result?.coverSkipped ? 'Beat updated. Cover could not be saved yet.' : 'Beat updated!', result?.coverSkipped ? 'info' : 'success');
    await loadBeats({ force: true });
    renderMyPage();
  } catch (e) {
    showToast(e.message || 'Could not update beat.', 'error', 3600);
  }
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-check"></i> Save';
  }
}

async function deleteMyBeat(beatId) {
  const beat = findMyBeatById(beatId);
  if (!beat) return;
  if (!confirm(`Remove "${beat.title}" from your live portfolio?`)) return;
  try {
    await manageBeatRequest('delete', beatId);
    const nextOrder = getStoredBeatOrderIds().filter(id => id !== beatId);
    await persistBeatOrder(nextOrder);
    closeBeatEditModal();
    showToast('Beat removed.', 'success');
    await loadBeats({ force: true });
    renderMyPage();
  } catch (e) {
    showToast(e.message || 'Could not remove beat.', 'error', 3600);
  }
}

function deleteMyBeatFromModal() {
  if (!_editingBeatId) return;
  void deleteMyBeat(_editingBeatId);
}

async function applyMyBeatOrder(ids) {
  await persistBeatOrder(ids);
  renderMyPage();
}

function moveMyBeat(beatId, direction) {
  const live = getMyLiveBeats();
  const ids = live.map(b => b.id);
  const idx = ids.indexOf(beatId);
  if (idx < 0) return;
  const next = idx + direction;
  if (next < 0 || next >= ids.length) return;
  [ids[idx], ids[next]] = [ids[next], ids[idx]];
  void applyMyBeatOrder(ids);
}

const MY_PAGE_DRAG_THRESHOLD = 8;
let _myPagePointer = null;
let _myPageDrag = null;
let _myPageTouchGesture = false;

function myPageSortableFromTarget(target) {
  const row = target?.closest?.('.my-page-beat-row--sortable');
  if (!row) return null;
  const list = row.closest('.my-page-beat-list--sortable');
  if (!list) return null;
  return { row, list };
}

function myPageRowAtY(list, clientY) {
  for (const row of list.querySelectorAll('.my-page-beat-row--live')) {
    const r = row.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) return row;
  }
  return null;
}

function myPageSwapRows(list, dragRow, overRow) {
  if (!dragRow || !overRow || dragRow === overRow) return;
  const rows = [...list.querySelectorAll('.my-page-beat-row--live')];
  const dragIdx = rows.indexOf(dragRow);
  const overIdx = rows.indexOf(overRow);
  if (dragIdx < 0 || overIdx < 0 || dragIdx === overIdx) return;
  if (dragIdx < overIdx) overRow.after(dragRow);
  else overRow.before(dragRow);
}

function myPageBeatOrderFromList(list) {
  return [...list.querySelectorAll('.my-page-beat-row--live')].map(r => r.dataset.beatId).filter(Boolean);
}

function startMyPageBeatDrag(state) {
  const { list, row, gid } = state;
  _myPageDrag = {
    list,
    dragId: row.dataset.beatId,
    row,
    gid,
    lastOverId: null
  };
  _myPagePointer = null;
  _myPageBeatDragging = true;
  row.classList.add('my-page-beat-row--dragging');
  list.classList.add('my-page-beat-list--dragging');
  myPageLockScroll(list, true);
}

function myPageDragAtY(clientY) {
  if (!_myPageDrag) return;
  const { list, dragId, row } = _myPageDrag;
  const over = myPageRowAtY(list, clientY);
  list.querySelectorAll('.my-page-beat-row--drag-over').forEach(el => el.classList.remove('my-page-beat-row--drag-over'));
  const overId = over?.dataset?.beatId;
  if (over && overId && overId !== dragId) {
    over.classList.add('my-page-beat-row--drag-over');
    if (_myPageDrag.lastOverId !== overId) {
      myPageSwapRows(list, row, over);
      _myPageDrag.lastOverId = overId;
    }
  } else {
    _myPageDrag.lastOverId = null;
  }
}

function endMyPageBeatDrag(gid) {
  if (!_myPageDrag || _myPageDrag.gid !== gid) return;
  const { list, row } = _myPageDrag;
  row.classList.remove('my-page-beat-row--dragging');
  list.classList.remove('my-page-beat-list--dragging');
  list.querySelectorAll('.my-page-beat-row--drag-over').forEach(el => el.classList.remove('my-page-beat-row--drag-over'));
  myPageLockScroll(list, false);
  const ids = myPageBeatOrderFromList(list);
  _myPageDrag = null;
  setTimeout(() => { _myPageBeatDragging = false; }, 150);
  if (ids.length) void persistBeatOrder(ids);
}

const MY_PAGE_LONG_PRESS_MS = 320;
let _myPagePressTimer = null;

function clearMyPagePressTimer() {
  if (_myPagePressTimer) {
    clearTimeout(_myPagePressTimer);
    _myPagePressTimer = null;
  }
}

function myPageLockScroll(list, on) {
  const scroll = list?.closest('.submit-scroll') || list?.closest('.page-inner');
  if (scroll) scroll.style.overflow = on ? 'hidden' : '';
}

function myPageBeatGestureDown(row, list, gid, x, y, e) {
  if (_myPageDrag) return;
  const isTouch = typeof gid === 'string' && gid.startsWith('touch-');
  _myPagePointer = { row, list, gid, startX: x, startY: y };
  if (!isTouch) return;
  clearMyPagePressTimer();
  _myPagePressTimer = setTimeout(() => {
    _myPagePressTimer = null;
    if (!_myPagePointer || _myPagePointer.gid !== gid) return;
    startMyPageBeatDrag(_myPagePointer);
  }, MY_PAGE_LONG_PRESS_MS);
}

function myPageBeatGestureMove(gid, x, y, e) {
  if (_myPageDrag) {
    if (_myPageDrag.gid !== gid) return;
    if (e?.cancelable) e.preventDefault();
    myPageDragAtY(y);
    return;
  }
  if (!_myPagePointer || _myPagePointer.gid !== gid) return;
  const moved = Math.hypot(x - _myPagePointer.startX, y - _myPagePointer.startY);
  if (moved < MY_PAGE_DRAG_THRESHOLD) return;
  if (gid.startsWith('touch-')) {
    clearMyPagePressTimer();
    _myPagePointer = null;
    return;
  }
  if (e?.cancelable) e.preventDefault();
  startMyPageBeatDrag(_myPagePointer);
  myPageDragAtY(y);
}

function myPageBeatGestureUp(gid, x, y) {
  clearMyPagePressTimer();
  if (_myPageDrag && _myPageDrag.gid === gid) {
    endMyPageBeatDrag(gid);
    return;
  }
  if (!_myPagePointer || _myPagePointer.gid !== gid) return;
  const { row, startX, startY } = _myPagePointer;
  const beatId = row.dataset.beatId;
  const moved = Math.hypot(x - startX, y - startY);
  _myPagePointer = null;
  if (moved < MY_PAGE_DRAG_THRESHOLD && beatId) openBeatEditModal(beatId);
}

function myPageBeatGestureCancel(gid) {
  clearMyPagePressTimer();
  if (_myPageDrag && _myPageDrag.gid === gid) endMyPageBeatDrag(gid);
  if (_myPagePointer && _myPagePointer.gid === gid) _myPagePointer = null;
}

function ensureMyPageBeatDrag() {
  if (window._myPageBeatDragReady) return;
  window._myPageBeatDragReady = true;

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const hit = myPageSortableFromTarget(e.target);
    if (!hit) return;
    _myPageTouchGesture = true;
    const t = e.touches[0];
    myPageBeatGestureDown(hit.row, hit.list, 'touch-' + t.identifier, t.clientX, t.clientY, e);
  }, { capture: true, passive: false });

  document.addEventListener('touchmove', e => {
    if (!_myPagePointer && !_myPageDrag) return;
    const activeGid = _myPageDrag?.gid || _myPagePointer?.gid;
    if (!activeGid || !activeGid.startsWith('touch-')) return;
    const touchId = Number(activeGid.slice(6));
    const t = [...e.touches].find(touch => touch.identifier === touchId);
    if (!t) return;
    myPageBeatGestureMove(activeGid, t.clientX, t.clientY, e);
  }, { passive: false });

  document.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      const gid = 'touch-' + t.identifier;
      if ((_myPagePointer && _myPagePointer.gid === gid) || (_myPageDrag && _myPageDrag.gid === gid)) {
        myPageBeatGestureUp(gid, t.clientX, t.clientY);
      }
    }
    _myPageTouchGesture = false;
  });

  document.addEventListener('touchcancel', e => {
    const t = e.changedTouches[0];
    if (t) myPageBeatGestureCancel('touch-' + t.identifier);
    _myPageTouchGesture = false;
  });

  document.addEventListener('pointerdown', e => {
    if (_myPageTouchGesture || e.pointerType === 'touch') return;
    if (_myPageDrag) return;
    const hit = myPageSortableFromTarget(e.target);
    if (!hit) return;
    if (e.button !== 0) return;
    myPageBeatGestureDown(hit.row, hit.list, 'ptr-' + e.pointerId, e.clientX, e.clientY, null);
  }, true);

  document.addEventListener('pointermove', e => {
    if (_myPageTouchGesture || e.pointerType === 'touch') return;
    myPageBeatGestureMove('ptr-' + e.pointerId, e.clientX, e.clientY, e);
  }, { passive: false });

  document.addEventListener('pointerup', e => {
    if (_myPageTouchGesture || e.pointerType === 'touch') return;
    myPageBeatGestureUp('ptr-' + e.pointerId, e.clientX, e.clientY);
  });

  document.addEventListener('pointercancel', e => {
    if (_myPageTouchGesture || e.pointerType === 'touch') return;
    myPageBeatGestureCancel('ptr-' + e.pointerId);
  });
}

function getMyPageUrl() {
  const name = _userProfile?.producer_name?.trim();
  if (!name) return '';
  return 'https://beatswipe.app/p/' + portfolioSlugFromName(name);
}

let _myPageStats = null;

function fmtMyPageStat(n) {
  const v = Number(n) || 0;
  if (v >= 10000) return Math.round(v / 1000) + 'k';
  return String(v);
}

function buildMyPageStatsHTML(stats) {
  if (!stats) return '';
  const total = (stats.views || 0) + (stats.saves || 0) + (stats.buys || 0);
  if (total < 1) {
    return `<div class="my-page-stats my-page-stats--empty">
      <div class="my-page-stats-label">Page stats</div>
      <p class="my-page-stats-empty">Stats appear once fans visit your link.</p>
    </div>`;
  }
  return `<div class="my-page-stats">
    <div class="my-page-stats-label">Page stats</div>
    <div class="my-page-stats-grid">
      <div class="my-page-stat"><div class="my-page-stat-num">${fmtMyPageStat(stats.views)}</div><div class="my-page-stat-lbl">Views</div></div>
      <div class="my-page-stat"><div class="my-page-stat-num">${fmtMyPageStat(stats.saves)}</div><div class="my-page-stat-lbl">Saves</div></div>
      <div class="my-page-stat"><div class="my-page-stat-num">${fmtMyPageStat(stats.buys)}</div><div class="my-page-stat-lbl">Buy clicks</div></div>
    </div>
  </div>`;
}

async function fetchMyPageStats() {
  if (!currentUser) return null;
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/stats', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function refreshMyPageStats() {
  if (!currentUser || !isMyPageOnboarded()) return;
  _myPageStats = await fetchMyPageStats();
  document.querySelectorAll('[data-my-page-stats]').forEach(el => {
    el.innerHTML = buildMyPageStatsHTML(_myPageStats);
  });
}

function myPageDesktopSide() {
  return typeof isDesktop === 'function' && isDesktop() && window.matchMedia('(min-width: 1100px)').matches;
}

function buildMyPageLinkBoxHTML() {
  const url = getMyPageUrl();
  if (!url) return '';
  return `
      <div class="my-page-link-box">
        <div class="my-page-link-label">Your bio link</div>
        <div class="my-page-link-url">${escHtml(url.replace('https://', ''))}</div>
        <div class="my-page-link-actions">
          <button type="button" class="btn-primary" onclick="copyPortfolioLink(event)"><i class="ti ti-link"></i> Copy link</button>
          <button type="button" class="btn-secondary" onclick="openPortfolioQR()"><i class="ti ti-qrcode"></i> QR code</button>
          <button type="button" class="btn-secondary" onclick="previewMyPage()"><i class="ti ti-eye"></i> Preview</button>
        </div>
        <div data-my-page-stats>${buildMyPageStatsHTML(_myPageStats)}</div>
      </div>`;
}

function updateMyPageLeftRail() {
  if (!document.body.classList.contains('mypage-active')) return;
  const liveEl = document.getElementById('mlrLive');
  const pendingEl = document.getElementById('mlrPending');
  const stepEl = document.getElementById('mlrStep');
  if (liveEl) liveEl.textContent = String(getMyLiveBeats().length);
  const pendingCount = getMyPendingBeats().length;
  if (pendingEl) pendingEl.textContent = String(pendingCount);
  const pendingStat = document.getElementById('mlrPendingStat');
  if (pendingStat) pendingStat.hidden = pendingCount === 0;
  if (stepEl) {
    if (!currentUser) {
      stepEl.textContent = (typeof hasProducerSetupIntent === 'function' && hasProducerSetupIntent())
        ? 'Step 2 of 5'
        : 'Sign in';
    }
    else if (!isMyPageOnboarded()) {
      const step = _myPageObStep === 0 ? 3 : (_myPageObStep === 1 ? 4 : 5);
      stepEl.textContent = `Step ${step} of 5`;
    }
    else stepEl.textContent = 'Live';
  }
}

function renderMyPageSidePanel() {
  const panel = document.getElementById('myPageSidePanel');
  if (!panel) return;
  if (!myPageDesktopSide() || document.body.classList.contains('mypage-add-open') || !currentUser || !isMyPageOnboarded()) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.style.marginTop = '';
    return;
  }
  const linkHTML = buildMyPageLinkBoxHTML();
  if (!linkHTML) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.style.marginTop = '';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `
    <div class="my-page-side-card">
      ${linkHTML}
      <p class="my-page-side-tip">Fans swipe your beats from this link. Add at least 3 before sharing in your bio.</p>
    </div>`;
  const statsHost = panel.querySelector('[data-my-page-stats]');
  if (statsHost && _myPageStats) statsHost.innerHTML = buildMyPageStatsHTML(_myPageStats);
  // My Page renders its title inside the main column (unlike Profile/Favorites, where the
  // shared page head sits above the two-column row) — offset the sidebar by the head's
  // height so it starts level with the actual content, not the title text.
  const head = document.querySelector('#myPageMain .site-page-head');
  panel.style.marginTop = head ? head.offsetHeight + 'px' : '';
}

function showMyPageAddBeat() {
  const main = document.getElementById('myPageMain');
  const add = document.getElementById('myPageAddBeat');
  if (main) main.style.display = 'none';
  if (add) add.style.display = 'flex';
  document.body.classList.add('mypage-add-open');
  const prodEl = document.getElementById('f-producer');
  if (prodEl) prodEl.value = _userProfile?.producer_name || '';
  const backLabel = document.getElementById('addBeatBackLabel');
  if (backLabel) backLabel.textContent = isMyPageOnboarded() ? 'My Page' : 'Back';
  const successMsg = document.getElementById('successMsg');
  if (successMsg) successMsg.style.display = 'none';
  clearMp3Queue();
  resetAddBeatForm();
  if (currentUser) {
    const loggedIn = document.getElementById('uploadLoggedIn');
    const loginHint = document.getElementById('uploadLoginHint');
    if (loggedIn) loggedIn.style.display = 'flex';
    if (loginHint) loginHint.style.display = 'none';
  }
  updatePreviewLabel();
  syncSubmitBtnLabel();
  const pt = document.getElementById('f-preview-type')?.value;
  if (pt === 'YouTube' || pt === 'SoundCloud') {
    document.getElementById('f-title')?.focus();
  }
}

function hideMyPageAddBeat() {
  const main = document.getElementById('myPageMain');
  const add = document.getElementById('myPageAddBeat');
  if (add) add.style.display = 'none';
  if (main) main.style.display = 'block';
  document.body.classList.remove('mypage-add-open');
  renderMyPage();
}

function previewMyPage() {
  const name = _userProfile?.producer_name?.trim();
  if (!name) return;
  openPortfolio(name, { preview: true });
}

async function saveOnboardingProfile() {
  if (!currentUser) return;
  const name = document.getElementById('ob-name')?.value.trim();
  const bio = document.getElementById('ob-bio')?.value.trim();
  if (!name) { showToast('Producer name is required.', 'error'); return; }
  const slug = typeof portfolioSlugFromName === 'function'
    ? decodeURIComponent(portfolioSlugFromName(name))
    : name;
  if (typeof isDemoPortfolioSlug === 'function' && (isDemoPortfolioSlug(name) || isDemoPortfolioSlug(slug))) {
    showToast('“demo” is reserved for the public sample page. Pick another name.', 'error');
    return;
  }

  const btn = document.getElementById('obSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Saving...';
  }

  const token = await getAccessToken();
  if (!token) {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Continue'; }
    showToast('Session expired — please sign in again.', 'error');
    return;
  }

  const updates = {
    id: currentUser.id,
    producer_name: name,
    bio: bio || null,
    updated_at: new Date().toISOString()
  };

  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPA_KEY,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      _userProfile = { ..._userProfile, ...updates };
      _myPageObStep = 1;
      renderMyPage();
    } else {
      showToast('Error saving profile. Please try again.', 'error');
    }
  } catch(e) {
    showToast('Error: ' + e.message, 'error', 3600);
  }
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = 'Continue';
  }
}

function finishMyPageOnboarding() {
  const live = getMyLiveBeats().length;
  const pending = getMyPendingBeats().length;
  const total = live + pending;
  if (total < 1) {
    showToast('Add at least one beat before continuing.', 'error');
    return;
  }
  _myPageObStep = 2;
  renderMyPage();
}

function completeMyPageOnboarding() {
  markMyPageOnboarded();
  if (typeof clearProducerSetupIntent === 'function') clearProducerSetupIntent();
  try { localStorage.setItem('bs_onboarded', '1'); } catch (e) {}
  _myPageObStep = 0;
  renderMyPage();
}

function updateOnboardingSlugPreview() {
  const name = document.getElementById('ob-name')?.value.trim() || '';
  const slug = name && typeof portfolioSlugFromName === 'function'
    ? decodeURIComponent(portfolioSlugFromName(name))
    : 'yourname';
  const el = document.getElementById('ob-slug');
  if (el) el.textContent = 'beatswipe.app/p/' + slug;
}

function renderMyPageBeatRows(opts) {
  const sortable = !opts || opts.sortable !== false;
  const stagger = !!(opts && opts.stagger);
  const live = getMyLiveBeats();
  if (sortable && live.length) syncBeatOrderWithLive(live);
  const pending = getMyPendingBeats();
  const pendingFiltered = pending.filter(p => !live.find(b => b.title === p.title));
  if (!live.length && !pendingFiltered.length) {
    return `<div class="my-page-empty"><i class="ti ti-music-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:0.5"></i>No beats yet.<br>Tap Add beat to upload your first one.</div>`;
  }

  let html = '<div class="my-page-beat-groups">';

  if (live.length) {
    html += `<div class="my-page-beat-group">
      <div class="my-page-beat-group-head">
        <span class="my-page-beat-group-label">Live <span class="my-page-beat-group-count">${live.length}</span></span>
        ${sortable ? '<span class="my-page-beat-group-hint">Hold to reorder</span>' : ''}
      </div>
      <div class="my-page-beat-group-card${sortable ? ' my-page-beat-list--sortable' : ''}">`;
    live.forEach((b, idx) => {
      const idEsc = escHtml(b.id);
      const meta = formatMyBeatMeta(b);
      const sortCls = sortable ? ' my-page-beat-row--sortable' : '';
      const enterCls = stagger ? ' list-enter' : '';
      const staggerStyle = stagger ? ` style="--i:${Math.min(idx, 7)}"` : '';
      const keyAttrs = sortable
        ? ` tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openBeatEditModal('${idEsc}')}"`
        : '';
      html += `<div class="my-page-beat-row my-page-beat-row--live${sortCls}${enterCls}" data-beat-id="${idEsc}"${staggerStyle}${keyAttrs}>
        <div class="mini-cover my-page-beat-cover">${beatCoverHTML(b, '', 'my' + idx)}</div>
        <div class="my-page-beat-body">
          <div class="my-page-beat-title">${escHtml(b.title)}</div>
          <div class="my-page-beat-meta">${meta ? escHtml(meta) : (sortable ? 'Tap to edit · drag to reorder' : 'Live on your page')}</div>
        </div>
        ${sortable
          ? '<i class="ti ti-chevron-right my-page-beat-chev" aria-hidden="true"></i>'
          : '<span class="my-page-status my-page-status--live">Live</span>'}
      </div>`;
    });
    html += '</div></div>';
  }

  if (pendingFiltered.length) {
    html += `<div class="my-page-beat-group">
      <div class="my-page-beat-group-head">
        <span class="my-page-beat-group-label">Pending <span class="my-page-beat-group-count">${pendingFiltered.length}</span></span>
        <span class="my-page-beat-group-hint">Under review</span>
      </div>
      <div class="my-page-beat-group-card">`;
    pendingFiltered.forEach((p, idx) => {
      const enterCls = stagger ? ' list-enter' : '';
      const staggerStyle = stagger ? ` style="--i:${Math.min(live.length + idx, 7)}"` : '';
      html += `<div class="my-page-beat-row my-page-beat-row--pending${enterCls}"${staggerStyle}>
        <span class="my-page-beat-dot my-page-beat-dot--pending" aria-hidden="true"></span>
        <div class="my-page-beat-body">
          <div class="my-page-beat-title">${escHtml(p.title)}</div>
          <div class="my-page-beat-meta">Usually under 48h</div>
        </div>
        <span class="my-page-status my-page-status--pending">Pending</span>
      </div>`;
    });
    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

function renderMyPageDashboard(stagger) {
  const url = getMyPageUrl();
  const liveCount = getMyLiveBeats().length;
  const linkInMain = url && !myPageDesktopSide();

  return `
    <div class="site-page-head">
      <h1 class="site-page-title">My Page</h1>
      <p class="site-page-desc">Manage your swipe portfolio and bio link.</p>
    </div>
    <div class="submit-scroll">
      <button type="button" class="submit-btn my-page-add-btn" onclick="showMyPageAddBeat()"><i class="ti ti-plus"></i> Add new beat</button>
      ${linkInMain ? buildMyPageLinkBoxHTML() : ''}
      ${liveCount < 3 ? `<div class="my-page-hint"><strong>Tip:</strong> Add at least 3 beats before sharing your link in your bio.</div>` : ''}
      ${renderMyPageBeatRows({ stagger })}
      <div style="font-size:12px;color:var(--text-3);text-align:center;margin-top:14px;line-height:1.5">Edit avatar & bio in <a onclick="goTo('profileScreen','navProfile')" style="color:var(--accent-mid);cursor:pointer">Profile</a></div>
    </div>`;
}

function renderMyPageOnboarding(stagger) {
  const name = _userProfile?.producer_name?.trim() || '';
  const bio = _userProfile?.bio?.trim() || '';
  const slug = name && typeof portfolioSlugFromName === 'function'
    ? decodeURIComponent(portfolioSlugFromName(name))
    : 'yourname';
  const live = getMyLiveBeats().length;
  const pending = getMyPendingBeats().length;
  const total = live + pending;
  const stepper = typeof producerSetupStepperHTML === 'function' ? producerSetupStepperHTML : () => '';

  if (_myPageObStep === 0) {
    return `
      <div class="site-page-head">
        <h1 class="site-page-title">Get your free page</h1>
        <p class="site-page-desc">Set up your producer portfolio in a few steps.</p>
      </div>
      <div class="submit-scroll">
        ${stepper(2)}
        <div class="submit-title" style="margin-bottom:6px">Create your page</div>
        <div class="submit-sub" style="margin-bottom:18px">Fans see this at the top of your swipe page.</div>
        <div class="field-group">
          <label class="field-label">Producer name *</label>
          <input type="text" id="ob-name" value="${escHtml(name)}" placeholder="Your alias" oninput="updateOnboardingSlugPreview()">
        </div>
        <div class="field-group">
          <label class="field-label">Bio</label>
          <textarea id="ob-bio" placeholder="One line about your sound…" rows="2">${escHtml(bio)}</textarea>
        </div>
        <div class="field-group">
          <label class="field-label">Your link</label>
          <div id="ob-slug" style="font-size:14px;color:var(--accent-mid);font-weight:600;padding:10px 0">beatswipe.app/p/${escHtml(slug)}</div>
        </div>
        <button type="button" class="submit-btn" id="obSaveBtn" onclick="saveOnboardingProfile()">Continue</button>
      </div>`;
  }

  if (_myPageObStep === 1) {
    return `
      <div class="site-page-head">
        <h1 class="site-page-title">Get your free page</h1>
        <p class="site-page-desc">Add preview clips to your portfolio — not full masters.</p>
      </div>
      <div class="submit-scroll">
        ${stepper(3)}
        <div class="submit-title" style="margin-bottom:6px">Add your beats</div>
        <div class="my-page-hint"><strong>Add at least one beat</strong> to finish setup. 3 is recommended before you share your link in your bio. Upload short previews only (~30–60s for MP3) — not full masters. Beats go live on your page right away.</div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:12px">${total} beat${total === 1 ? '' : 's'} added${live ? ` (${live} live)` : ''}</div>
        <button type="button" class="submit-btn my-page-add-btn" onclick="showMyPageAddBeat()" style="margin-bottom:10px"><i class="ti ti-plus"></i> Add beat</button>
        ${renderMyPageBeatRows({ sortable: false, stagger })}
        <button type="button" class="submit-btn" onclick="finishMyPageOnboarding()" style="margin-top:10px">Continue</button>
      </div>`;
  }

  const url = getMyPageUrl();
  return `
    <div class="site-page-head">
      <h1 class="site-page-title">You're all set</h1>
      <p class="site-page-desc">Copy your bio link — then manage beats on My Page.</p>
    </div>
    <div class="submit-scroll" style="text-align:center;padding-top:12px">
      ${stepper(4)}
      <div class="my-page-ready-icon"><i class="ti ti-circle-check"></i></div>
      <div class="submit-title" style="margin-bottom:8px">Your page is ready</div>
      <div class="submit-sub" style="margin-bottom:20px;max-width:280px;margin-inline:auto">Share beatswipe.app/p/yourname in your Instagram bio. Add more beats anytime — they go live immediately.</div>
      ${url ? `
      <div class="my-page-link-box" style="text-align:left">
        <div class="my-page-link-label">Your bio link</div>
        <div class="my-page-link-url">${escHtml(url.replace('https://', ''))}</div>
        <div class="my-page-link-actions">
          <button type="button" class="btn-primary" onclick="copyPortfolioLink(event)"><i class="ti ti-link"></i> Copy link</button>
          <button type="button" class="btn-secondary" onclick="openPortfolioQR()"><i class="ti ti-qrcode"></i> QR code</button>
          <button type="button" class="btn-secondary" onclick="previewMyPage()"><i class="ti ti-eye"></i> Preview</button>
        </div>
      </div>` : ''}
      <button type="button" class="submit-btn" onclick="completeMyPageOnboarding()">Go to My Page</button>
    </div>`;
}

async function renderMyPage() {
  const main = document.getElementById('myPageMain');
  const add = document.getElementById('myPageAddBeat');
  if (!main) return;
  if (add && add.style.display !== 'none') return;

  if (currentUser && !_userProfile) await loadUserProfile();

  main.style.display = 'flex';

  if (!currentUser) {
    const setup = typeof hasProducerSetupIntent === 'function' && hasProducerSetupIntent();
    const stepper = setup && typeof producerSetupStepperHTML === 'function'
      ? producerSetupStepperHTML(1)
      : '';
    const authBox = typeof buildAuthBoxHTML === 'function' ? buildAuthBoxHTML({ setup: true }) : '';
    main.innerHTML = setup ? `
      <div class="site-page-head">
        <h1 class="site-page-title">Get your free page</h1>
        <p class="site-page-desc">Create an account to claim your swipe page. Google is fastest.</p>
      </div>
      <div class="submit-scroll my-page-setup">
        ${stepper}
        ${authBox}
      </div>` : `
      <div class="site-page-head">
        <h1 class="site-page-title">My Page</h1>
        <p class="site-page-desc">Your free swipe portfolio for your bio.</p>
      </div>
      <div class="submit-scroll my-page-setup">
        <div class="submit-title" style="margin-bottom:6px">Sign in to get your page</div>
        <div class="submit-sub" style="margin-bottom:18px">Create a free account, add preview clips (~30–60s), and share one link in your Instagram bio.</div>
        ${authBox}
      </div>`;
    updateMyPageLeftRail();
    renderMyPageSidePanel();
    return;
  }

  const stagger = typeof window.takeListEnter === 'function' && window.takeListEnter();

  if (!isMyPageOnboarded()) {
    if (_myPageObStep === 0) {
      const hasName = !!_userProfile?.producer_name?.trim();
      const beatCount = getMyLiveBeats().length + getMyPendingBeats().length;
      if (hasName && beatCount >= 1) _myPageObStep = 2;
      else if (hasName) _myPageObStep = 1;
    }
    main.innerHTML = renderMyPageOnboarding(stagger);
  } else {
    if (typeof clearProducerSetupIntent === 'function') clearProducerSetupIntent();
    _myPageObStep = 0;
    main.innerHTML = renderMyPageDashboard(stagger);
  }

  ensureMyPageBeatDrag();
  updateMyPageLeftRail();
  renderMyPageSidePanel();
  void refreshMyPendingBeats().then(() => rerenderMyPageIfActive());
  void refreshMyPageStats();
}
