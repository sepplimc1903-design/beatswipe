/* BeatSwipe My Page module — upload, dashboard, beat order */
// ─── MAKE.COM WEBHOOK ─────────────────────────────────────────────────────
const WEBHOOK_URL = 'https://hook.eu1.make.com/emrsw3rs980mwsi3a1b3kyfcobec3ahb';

// ─── PREVIEW TYPE + MP3 UPLOAD ────────────────────────────────────────────
let _mp3File = null;
let _mp3PublicUrl = null;
let _mp3Queue = [];
let _mp3QueueId = 0;

const MAX_FILE_MB = 15;
const MAX_MP3_QUEUE = 10;
const MP3_PREVIEW_HINT = 'Preview only — short clip (~30–60s), not the full beat.';
const ALLOWED_MIME = 'audio/mpeg';
const SUPA_BUCKET  = 'beats';

function titleFromFilename(name) {
  let t = name.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ').trim();
  if (t.length > 80) t = t.slice(0, 80);
  return t || 'Untitled';
}

function resetAddBeatForm() {
  ['f-title', 'f-bpm', 'f-key', 'f-preview', 'f-buy', 'f-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['f-genre', 'f-type'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  const pt = document.getElementById('f-preview-type');
  if (pt) pt.value = currentUser ? 'MP3' : '';
}

function syncSubmitBtnLabel() {
  const btn = document.getElementById('submitBeatBtn');
  if (!btn || btn.disabled) return;
  const pt = document.getElementById('f-preview-type')?.value;
  const n = _mp3Queue.length;
  if (pt === 'MP3' && n > 1) {
    btn.innerHTML = `<i class="ti ti-upload"></i> Upload all ${n} beats`;
  } else {
    btn.innerHTML = '<i class="ti ti-plus"></i> Add beat';
  }
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

  if (!type) return;

  if (type === 'YouTube') {
    urlGroup.style.display = 'block';
    if (titleGroup) titleGroup.style.display = 'block';
    label.textContent = 'YouTube Link *';
    input.placeholder = 'https://youtube.com/watch?v=...';
    hint.textContent = 'Preview link only — fans hear a snippet, not the full beat';
    clearMp3Queue();
  } else if (type === 'SoundCloud') {
    urlGroup.style.display = 'block';
    if (titleGroup) titleGroup.style.display = 'block';
    label.textContent = 'SoundCloud Link *';
    input.placeholder = 'https://soundcloud.com/...';
    hint.textContent = 'Preview link only — fans hear a snippet, not the full beat';
    clearMp3Queue();
  } else if (type === 'MP3') {
    mp3Group.style.display = 'block';
    const mp3Hint = document.getElementById('preview-mp3-hint');
    if (mp3Hint) mp3Hint.textContent = MP3_PREVIEW_HINT;
    const loginHint  = document.getElementById('uploadLoginHint');
    const loggedInEl = document.getElementById('uploadLoggedIn');
    if (currentUser) {
      loginHint.style.display  = 'none';
      loggedInEl.style.display = 'block';
      if (!_mp3Queue.length) resetUploadUI();
    } else {
      loginHint.style.display  = 'block';
      loggedInEl.style.display = 'none';
    }
  }
  syncSubmitBtnLabel();
  syncQueueFormLayout();
}

const SUBMIT_GENRES = ['Trap','Drill','R&B','Lo-Fi','Afrobeats','Synthwave','Acoustic','Boom Bap','Other'];
const SUBMIT_TYPES = ['Full Beat','Loop','Drum Kit','Sample'];

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

function buildQueueSummary(item, index) {
  const parts = [item.title?.trim() || 'Untitled'];
  if (item.bpm) parts.push(item.bpm + ' BPM');
  if (item.genre) parts.push(item.genre);
  return `Track ${index + 1} · ${parts.join(' · ')}`;
}

function syncQueueFormLayout() {
  const hasQueue = _mp3Queue.length > 0;
  const isMp3 = document.getElementById('f-preview-type')?.value === 'MP3';
  const singleFields = document.getElementById('submitSingleFields');
  const noteHint = document.getElementById('batchNoteHint');
  if (singleFields) singleFields.style.display = (isMp3 && hasQueue) ? 'none' : 'block';
  if (noteHint) noteHint.textContent = (isMp3 && hasQueue) ? '(applies to whole batch)' : '';
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
  wrap.innerHTML = _mp3Queue.map((item, index) => {
    const openClass = item.expanded ? ' open' : '';
    const chev = item.expanded ? 'ti-chevron-down' : 'ti-chevron-right';
    return `
    <div class="upload-queue-acc${openClass}" data-id="${item.id}">
      <button type="button" class="upload-queue-head" onclick="toggleQueueExpand('${item.id}')">
        <i class="ti upload-queue-chevron ${chev}"></i>
        <span class="upload-queue-summary" id="summary-${item.id}">${escHtml(buildQueueSummary(item, index))}</span>
        <span class="upload-queue-file">${escHtml(item.file.name)}</span>
      </button>
      <div class="upload-queue-body" style="display:${item.expanded ? 'block' : 'none'}">
        <div class="upload-queue-fields">
          <div>
            <label class="field-label">Title *</label>
            <input type="text" value="${escHtml(item.title)}" placeholder="Track title"
              oninput="updateQueueField('${item.id}', 'title', this.value)">
          </div>
          <div class="upload-queue-row">
            <div>
              <label class="field-label">BPM <span style="color:var(--text-3);font-weight:400">(optional)</span></label>
              <input type="number" value="${escHtml(item.bpm || '')}" placeholder="140"
                oninput="updateQueueField('${item.id}', 'bpm', this.value)">
            </div>
            <div>
              <label class="field-label">Key <span style="color:var(--text-3);font-weight:400">(optional)</span></label>
              <input type="text" value="${escHtml(item.key || '')}" placeholder="F# Min"
                oninput="updateQueueField('${item.id}', 'key', this.value)">
            </div>
          </div>
          <div>
            <label class="field-label">Genre *</label>
            ${genreSelectHtml(item.genre, 'qg-' + item.id, `updateQueueField('${item.id}', 'genre', this.value)`)}
          </div>
          <div>
            <label class="field-label">Type *</label>
            ${typeSelectHtml(item.type, 'qt-' + item.id, `updateQueueField('${item.id}', 'type', this.value)`)}
          </div>
          <div>
            <label class="field-label">Buy link <span style="color:var(--text-3);font-weight:400">(optional)</span></label>
            <input type="url" value="${escHtml(item.buyLink || '')}" placeholder="https://beatstars.com/beat/..."
              oninput="updateQueueField('${item.id}', 'buyLink', this.value)">
            <div style="font-size:11px;color:var(--text-3);margin-top:4px">Where fans buy the full beat — BeatStars, Splice, etc.</div>
          </div>
          <button type="button" class="upload-queue-remove" onclick="removeQueueItem('${item.id}')"><i class="ti ti-trash"></i> Remove</button>
        </div>
      </div>
    </div>`;
  }).join('');
  syncQueueFormLayout();
  syncSubmitBtnLabel();
}

function updateQueueField(id, field, value) {
  const item = _mp3Queue.find(q => q.id === id);
  if (!item) return;
  item[field] = value;
  if (field === 'title' || field === 'bpm' || field === 'genre') {
    const idx = _mp3Queue.findIndex(q => q.id === id);
    const el = document.getElementById('summary-' + id);
    if (el && idx >= 0) el.textContent = buildQueueSummary(item, idx);
  }
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
  _mp3Queue = _mp3Queue.filter(q => q.id !== id);
  renderUploadQueue();
  if (!_mp3Queue.length) resetUploadUI();
}

function clearMp3Queue() {
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

async function postBeatWebhook(payload) {
  const controller = new AbortController();
  const webhookTimeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload)
    });
    if (!res.ok) console.warn('[BeatSwipe] Webhook returned non-ok — treating as success');
    return true;
  } catch (fetchErr) {
    console.warn('[BeatSwipe] Webhook failed (file may already be uploaded):', fetchErr.message);
    return true;
  } finally {
    clearTimeout(webhookTimeout);
  }
}

function getResolvedBuyLink() {
  return document.getElementById('f-buy')?.value.trim() || '';
}

function setSubmitBtnLoading(loading, label) {
  const btn = document.getElementById('submitBeatBtn');
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = `<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> ${label || 'Sending...'}`;
  } else {
    syncSubmitBtnLabel();
  }
}

function clearBeatFormAfterSubmit() {
  ['f-title', 'f-bpm', 'f-key', 'f-preview', 'f-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  clearMp3Queue();
  resetUploadUI();
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────
async function doSubmitForm() {
  const producer = (_userProfile?.producer_name || document.getElementById('f-producer')?.value || '').trim();
  if (!producer) {
    showToast('Complete your page setup first — add your producer name.', 'error');
    hideMyPageAddBeat();
    renderMyPage();
    return;
  }
  const prodEl = document.getElementById('f-producer');
  if (prodEl) prodEl.value = producer;

  const previewType = document.getElementById('f-preview-type').value;
  if (!previewType) {
    showToast('Please select a preview type.', 'error');
    return;
  }

  const buyLink = getResolvedBuyLink();
  const note = document.getElementById('f-note').value.trim();

  if (previewType === 'MP3') {
    if (!_mp3Queue.length) {
      showToast('Please add at least one MP3 file.', 'error');
      return;
    }
    for (const item of _mp3Queue) {
      const label = item.title.trim() || item.file.name;
      if (!item.title.trim()) {
        showToast('Please add a title for each track.', 'error');
        expandQueueItem(item.id);
        return;
      }
      if (!item.genre.trim()) {
        showToast(`Select a genre for "${label}".`, 'error');
        expandQueueItem(item.id);
        return;
      }
      if (!item.type.trim()) {
        showToast(`Select a type for "${label}".`, 'error');
        expandQueueItem(item.id);
        return;
      }
    }
    return doSubmitMp3Batch({ producer, note });
  }

  const genre = document.getElementById('f-genre').value.trim();
  const type = document.getElementById('f-type').value.trim();
  if (!genre || !type) {
    showToast('Please fill in genre and type.', 'error');
    return;
  }

  const bpm = document.getElementById('f-bpm').value.trim();
  const key = document.getElementById('f-key').value.trim();

  const title = document.getElementById('f-title').value.trim();
  if (!title) { showToast('Please enter a track title.', 'error'); return; }

  let previewUrl = '';
  if (previewType === 'YouTube' || previewType === 'SoundCloud') {
    previewUrl = document.getElementById('f-preview')?.value.trim() || '';
    if (!previewUrl) { showToast('Please enter a preview link.', 'error'); return; }
  }

  setSubmitBtnLoading(true, 'Sending...');

  try {
    await postBeatWebhook({
      Producer: producer,
      Title: title,
      BPM: parseFloat(bpm) || 0,
      Key: key,
      Genre: genre,
      Type: type,
      PreviewType: previewType,
      PreviewURL: previewUrl,
      BuyLink: buyLink,
      Note: note,
      Status: 'New'
    });

    addMyPendingBeat(title);
    finishSubmitSuccess(1);
  } catch (e) {
    console.error('[BeatSwipe] submitForm error:', e);
    setSubmitBtnLoading(false);
    const errEl = document.getElementById('uploadError');
    if (errEl) {
      errEl.textContent = 'Error: ' + (e.message || 'Something went wrong');
      errEl.style.display = 'block';
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      showToast('Error: ' + (e.message || 'Something went wrong'), 'error', 3600);
    }
  }
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
      await postBeatWebhook({
        Producer: shared.producer,
        Title: item.title.trim(),
        BPM: parseFloat(item.bpm) || 0,
        Key: item.key || '',
        Genre: item.genre,
        Type: item.type,
        PreviewType: 'MP3',
        PreviewURL: previewUrl,
        BuyLink: (item.buyLink || '').trim(),
        Note: shared.note,
        Status: 'New'
      });
      addMyPendingBeat(item.title.trim());
      submitted.push(item.title.trim());
      progressFill.style.width = '100%';
    }

    finishSubmitSuccess(submitted.length);
  } catch (e) {
    console.error('[BeatSwipe] batch submit error:', e);
    setSubmitBtnLoading(false);
    if (progressWrap) progressWrap.style.display = 'none';
    if (errEl) {
      errEl.textContent = submitted.length
        ? `${submitted.length} uploaded. Failed on next: ${e.message}`
        : e.message;
      errEl.style.display = 'block';
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      showToast(e.message || 'Upload failed', 'error', 3600);
    }
    if (submitted.length) {
      _mp3Queue = _mp3Queue.filter(q => !submitted.includes(q.title.trim()));
      renderUploadQueue();
      renderMyPage();
    }
  }
}

function finishSubmitSuccess(count) {
  const successMsg = document.getElementById('successMsg');
  if (successMsg) {
    const p = successMsg.querySelector('p');
    if (p) {
      p.textContent = count > 1
        ? `${count} beats submitted! We'll review them within 48h.`
        : 'Beat submitted! We\'ll review it within 48h.';
    }
    successMsg.style.display = 'block';
  }
  setSubmitBtnLoading(false);
  clearBeatFormAfterSubmit();

  setTimeout(async () => {
    if (successMsg) successMsg.style.display = 'none';
    hideMyPageAddBeat();
    await refreshMyPendingBeats({ force: true });
    renderMyPage();
  }, count > 1 ? 1600 : 1200);
}

function resetSubmitForAnother() {
  const successMsg = document.getElementById('successMsg');
  if (successMsg) successMsg.style.display = 'none';
  ['f-title', 'f-bpm', 'f-key', 'f-preview', 'f-note'].forEach(id => {
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
  const add = document.getElementById('myPageAddBeat');
  if (add && add.style.display !== 'none') return;
  if (!document.getElementById('submitScreen')?.classList.contains('active')) return;
  const main = document.getElementById('myPageMain');
  if (!main || !currentUser) return;
  if (!isMyPageOnboarded()) {
    main.innerHTML = renderMyPageOnboarding();
  } else {
    main.innerHTML = renderMyPageDashboard();
    initMyPageBeatDrag();
  }
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

let _editingBeatId = null;

function openBeatEditModal(beatId) {
  const beat = findMyBeatById(beatId);
  if (!beat) return;
  _editingBeatId = beatId;
  document.getElementById('beat-edit-title').value = beat.title || '';
  document.getElementById('beat-edit-genre').value = beat.genre && beat.genre !== 'Other' ? beat.genre : (beat.genre || '');
  document.getElementById('beat-edit-type').value = beat.type || '';
  document.getElementById('beat-edit-bpm').value = parseBpmValue(beat.bpm);
  document.getElementById('beat-edit-key').value = parseKeyValue(beat.key);
  document.getElementById('beat-edit-buy').value = beat.buy || '';
  document.getElementById('beatEditModal')?.classList.add('open');
}

function closeBeatEditModal() {
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
  const buy = document.getElementById('beat-edit-buy')?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  if (!genre || !type) { showToast('Genre and type are required.', 'error'); return; }

  const btn = document.getElementById('beatEditSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Saving...';
  }
  try {
    await manageBeatRequest('update', _editingBeatId, { title, genre, type, bpm, key, buy });
    closeBeatEditModal();
    showToast('Beat updated!', 'success');
    await loadBeats();
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
    showToast('Beat removed.', 'success');
    await loadBeats();
    renderMyPage();
  } catch (e) {
    showToast(e.message || 'Could not remove beat.', 'error', 3600);
  }
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

function initMyPageBeatDrag() {
  const list = document.querySelector('.my-page-beat-list--sortable');
  if (!list || list._dragInit) return;
  list._dragInit = true;
  let dragId = null;

  list.querySelectorAll('.my-page-beat-row--live').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragId = row.dataset.beatId;
      row.classList.add('my-page-beat-row--dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      dragId = null;
      row.classList.remove('my-page-beat-row--dragging');
      list.querySelectorAll('.my-page-beat-row--drag-over').forEach(el => el.classList.remove('my-page-beat-row--drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragId || row.dataset.beatId === dragId) return;
      row.classList.add('my-page-beat-row--drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('my-page-beat-row--drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('my-page-beat-row--drag-over');
      const targetId = row.dataset.beatId;
      if (!dragId || !targetId || dragId === targetId) return;
      const live = getMyLiveBeats();
      const ids = live.map(b => b.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      ids.splice(from, 1);
      ids.splice(to, 0, dragId);
      void applyMyBeatOrder(ids);
    });
  });
}

function getMyPageUrl() {
  const name = _userProfile?.producer_name?.trim();
  if (!name) return '';
  return 'https://beatswipe.app/p/' + portfolioSlugFromName(name);
}

function showMyPageAddBeat() {
  const main = document.getElementById('myPageMain');
  const add = document.getElementById('myPageAddBeat');
  if (main) main.style.display = 'none';
  if (add) add.style.display = 'flex';
  const prodEl = document.getElementById('f-producer');
  if (prodEl) prodEl.value = _userProfile?.producer_name || '';
  const successMsg = document.getElementById('successMsg');
  if (successMsg) successMsg.style.display = 'none';
  clearMp3Queue();
  resetAddBeatForm();
  if (currentUser) {
    const loggedIn = document.getElementById('uploadLoggedIn');
    const loginHint = document.getElementById('uploadLoginHint');
    if (loggedIn) loggedIn.style.display = 'block';
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
    showToast('Add at least one beat before finishing setup.', 'error');
    return;
  }
  if (total < 3) {
    if (!confirm('We recommend at least 3 beats before sharing your link. Finish anyway?')) return;
  }
  markMyPageOnboarded();
  _myPageObStep = 2;
  renderMyPage();
}

function completeMyPageOnboarding() {
  markMyPageOnboarded();
  _myPageObStep = 0;
  renderMyPage();
}

function renderMyPageBeatRows(opts) {
  const sortable = !opts || opts.sortable !== false;
  const live = getMyLiveBeats();
  if (sortable && live.length) syncBeatOrderWithLive(live);
  const pending = getMyPendingBeats();
  const pendingFiltered = pending.filter(p => !live.find(b => b.title === p.title));
  if (!live.length && !pendingFiltered.length) {
    return `<div class="my-page-empty"><i class="ti ti-music-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:0.5"></i>No beats yet.<br>Tap below to add your first one.</div>`;
  }
  const listClass = sortable && live.length ? 'my-page-beat-list my-page-beat-list--sortable' : 'my-page-beat-list';
  let html = `<div class="${listClass}">`;
  live.forEach((b, i) => {
    const idEsc = escHtml(b.id);
    html += `<div class="my-page-beat-row my-page-beat-row--live" data-beat-id="${idEsc}"${sortable ? ' draggable="true"' : ''}>
      ${sortable ? `<button type="button" class="my-page-beat-grip" aria-label="Drag to reorder" tabindex="-1"><i class="ti ti-grip-vertical"></i></button>` : ''}
      <div class="my-page-beat-icon"><i class="ti ti-music"></i></div>
      <div class="my-page-beat-title">${escHtml(b.title)}</div>
      ${sortable ? `<div class="my-page-beat-actions">
        <button type="button" class="my-page-beat-act" onclick="moveMyBeat('${idEsc}', -1)" aria-label="Move up"${i === 0 ? ' disabled' : ''}><i class="ti ti-chevron-up"></i></button>
        <button type="button" class="my-page-beat-act" onclick="moveMyBeat('${idEsc}', 1)" aria-label="Move down"${i === live.length - 1 ? ' disabled' : ''}><i class="ti ti-chevron-down"></i></button>
        <button type="button" class="my-page-beat-act" onclick="openBeatEditModal('${idEsc}')" aria-label="Edit beat"><i class="ti ti-pencil"></i></button>
        <button type="button" class="my-page-beat-act my-page-beat-act--danger" onclick="deleteMyBeat('${idEsc}')" aria-label="Remove beat"><i class="ti ti-trash"></i></button>
      </div>` : '<span class="my-page-status my-page-status--live">Live</span>'}
    </div>`;
  });
  pendingFiltered.forEach(p => {
    html += `<div class="my-page-beat-row">
      <div class="my-page-beat-icon"><i class="ti ti-clock"></i></div>
      <div class="my-page-beat-title">${escHtml(p.title)}</div>
      <span class="my-page-status my-page-status--pending">Pending</span>
    </div>`;
  });
  html += '</div>';
  return html;
}

function renderMyPageDashboard() {
  const name = _userProfile?.producer_name?.trim() || 'Producer';
  const url = getMyPageUrl();
  const liveCount = getMyLiveBeats().length;
  const pendingCount = getMyPendingBeats().filter(p => !getMyLiveBeats().find(b => b.title === p.title)).length;

  return `
    <div class="site-page-head">
      <h1 class="site-page-title">My Page</h1>
      <p class="site-page-desc">Manage your swipe portfolio and bio link.</p>
    </div>
    <div class="submit-header" style="padding-top:0">
      <div class="submit-title">${escHtml(name)}</div>
      <div class="submit-sub">${liveCount} live${pendingCount ? ` · ${pendingCount} pending review` : ''}</div>
    </div>
    <div class="submit-scroll">
      ${url ? `
      <div class="my-page-link-box">
        <div class="my-page-link-label">Your bio link</div>
        <div class="my-page-link-url">${escHtml(url.replace('https://', ''))}</div>
        <div class="my-page-link-actions">
          <button type="button" class="btn-primary" onclick="copyPortfolioLink(event)"><i class="ti ti-link"></i> Copy link</button>
          <button type="button" class="btn-secondary" onclick="previewMyPage()"><i class="ti ti-eye"></i> Preview</button>
        </div>
      </div>` : ''}
      ${liveCount < 3 ? `<div class="my-page-hint"><strong>Tip:</strong> Add at least 3 beats before sharing your link in your bio.</div>` : ''}
      <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;font-weight:600;margin-bottom:8px">Your beats${liveCount ? ' · drag or use arrows to reorder' : ''}</div>
      ${renderMyPageBeatRows()}
      <button type="button" class="submit-btn" onclick="showMyPageAddBeat()"><i class="ti ti-plus"></i> Add new beat</button>
      <div style="font-size:12px;color:var(--text-3);text-align:center;margin-top:14px;line-height:1.5">Edit avatar & bio in <a onclick="goTo('profileScreen','navProfile')" style="color:var(--accent-mid);cursor:pointer">Profile</a></div>
    </div>`;
}

function renderMyPageOnboarding() {
  const name = _userProfile?.producer_name?.trim() || '';
  const bio = _userProfile?.bio?.trim() || '';
  const slug = name ? portfolioSlugFromName(name) : 'yourname';
  const live = getMyLiveBeats().length;
  const pending = getMyPendingBeats().length;
  const total = live + pending;

  if (_myPageObStep === 0) {
    return `
      <div class="site-page-head">
        <h1 class="site-page-title">Get your free page</h1>
        <p class="site-page-desc">Set up your producer portfolio in a few steps.</p>
      </div>
      <div class="submit-scroll">
        <span class="my-page-step-pill">Step 1 of 3</span>
        <div class="submit-title" style="margin-bottom:6px">Create your page</div>
        <div class="submit-sub" style="margin-bottom:18px">Fans see this at the top of your swipe page.</div>
        <div class="field-group">
          <label class="field-label">Producer name *</label>
          <input type="text" id="ob-name" value="${escHtml(name)}" placeholder="Your alias">
        </div>
        <div class="field-group">
          <label class="field-label">Bio</label>
          <textarea id="ob-bio" placeholder="One line about your sound…" rows="2">${escHtml(bio)}</textarea>
        </div>
        <div class="field-group">
          <label class="field-label">Your link</label>
          <div style="font-size:14px;color:var(--accent-mid);font-weight:600;padding:10px 0">beatswipe.app/p/${escHtml(slug)}</div>
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
        <span class="my-page-step-pill">Step 2 of 3</span>
        <div class="submit-title" style="margin-bottom:6px">Add your beats</div>
        <div class="my-page-hint"><strong>Min. 3 beats</strong> recommended before you share your link in your bio. Upload short previews only (~30–60s for MP3) — not full masters. Each beat is reviewed within 48h.</div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:12px">${total} beat${total === 1 ? '' : 's'} added${live ? ` (${live} live)` : ''}</div>
        ${renderMyPageBeatRows({ sortable: false })}
        <button type="button" class="submit-btn" onclick="showMyPageAddBeat()" style="margin-bottom:10px"><i class="ti ti-plus"></i> Add beat</button>
        <button type="button" class="btn-secondary" onclick="finishMyPageOnboarding()" style="width:100%;justify-content:center;padding:13px;border-radius:14px;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;border:0.5px solid var(--border-2);background:none;color:var(--text)">Finish setup</button>
      </div>`;
  }

  const url = getMyPageUrl();
  return `
    <div class="site-page-head">
      <h1 class="site-page-title">You're all set</h1>
      <p class="site-page-desc">Your page is ready — beats go live after review.</p>
    </div>
    <div class="submit-scroll" style="text-align:center;padding-top:12px">
      <span class="my-page-step-pill">Step 3 of 3</span>
      <div class="my-page-ready-icon"><i class="ti ti-circle-check"></i></div>
      <div class="submit-title" style="margin-bottom:8px">Your page is ready</div>
      <div class="submit-sub" style="margin-bottom:20px;max-width:280px;margin-inline:auto">Share your link once you have a few beats live. Review usually takes under 48h.</div>
      ${url ? `
      <div class="my-page-link-box" style="text-align:left">
        <div class="my-page-link-label">Your bio link</div>
        <div class="my-page-link-url">${escHtml(url.replace('https://', ''))}</div>
        <div class="my-page-link-actions">
          <button type="button" class="btn-primary" onclick="copyPortfolioLink(event)"><i class="ti ti-link"></i> Copy link</button>
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
    main.innerHTML = `
      <div class="site-page-head">
        <h1 class="site-page-title">My Page</h1>
        <p class="site-page-desc">Your free swipe portfolio for your bio.</p>
      </div>
      <div class="my-page-login">
        <i class="ti ti-link" style="font-size:48px;color:var(--accent-mid)"></i>
        <div style="font-size:18px;font-weight:700">Sign in to get your page</div>
        <div style="font-size:14px;color:var(--text-2);line-height:1.6;max-width:300px">Create a free account, add preview clips (~30–60s), and share one link in your Instagram bio.</div>
        <button onclick="goTo('profileScreen','navProfile')" style="padding:13px 28px;border-radius:14px;background:var(--accent);border:none;color:#fff;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px">
          <i class="ti ti-user"></i> Sign in / Create account
        </button>
      </div>`;
    return;
  }

  if (!isMyPageOnboarded()) {
    if (_userProfile?.producer_name?.trim() && _myPageObStep === 0) _myPageObStep = 1;
    main.innerHTML = renderMyPageOnboarding();
  } else {
    _myPageObStep = 0;
    main.innerHTML = renderMyPageDashboard();
    initMyPageBeatDrag();
  }

  void refreshMyPendingBeats().then(() => rerenderMyPageIfActive());
}
