// BeatSwipe moderation — admin review queue (Luca only)

let _isModerator = false;
let _moderatePendingCount = 0;
let _moderateQueue = [];
let _moderateBusyId = null;

function isModerator() {
  return _isModerator;
}

async function checkModeratorAccess() {
  if (!currentUser) {
    _isModerator = false;
    _moderatePendingCount = 0;
    return false;
  }
  const token = await getAccessToken();
  if (!token) {
    _isModerator = false;
    _moderatePendingCount = 0;
    return false;
  }
  try {
    const res = await fetch('/api/moderate-beats', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) {
      _isModerator = false;
      _moderatePendingCount = 0;
      return false;
    }
    const data = await res.json();
    _isModerator = true;
    _moderatePendingCount = data.count ?? (data.pending?.length || 0);
    _moderateQueue = data.pending || [];
    return true;
  } catch (_) {
    _isModerator = false;
    _moderatePendingCount = 0;
    return false;
  }
}

function formatModerateDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch (_) {
    return '';
  }
}

function buildModeratePreviewHTML(beat) {
  const url = beat.previewUrl || '';
  const type = beat.previewType || '';
  if (type === 'MP3' && url) {
    return `<audio controls preload="none" class="moderate-audio" src="${escHtml(url)}"></audio>`;
  }
  if (url && typeof isYouTube === 'function' && isYouTube(url)) {
    return `<a href="${escHtml(url)}" target="_blank" rel="noopener" class="moderate-preview-link"><i class="ti ti-brand-youtube"></i> Open on YouTube</a>`;
  }
  if (url && typeof isSoundCloud === 'function' && isSoundCloud(url)) {
    return `<a href="${escHtml(url)}" target="_blank" rel="noopener" class="moderate-preview-link"><i class="ti ti-brand-soundcloud"></i> Open on SoundCloud</a>`;
  }
  if (url) {
    return `<a href="${escHtml(url)}" target="_blank" rel="noopener" class="moderate-preview-link"><i class="ti ti-external-link"></i> Open preview</a>`;
  }
  return `<span class="moderate-preview-missing">No preview URL</span>`;
}

function renderModerateCard(beat) {
  const busy = _moderateBusyId === beat.id;
  const meta = [
    escHtml(beat.genre),
    escHtml(beat.type),
    beat.bpm ? `${beat.bpm} BPM` : null,
    beat.key && beat.key !== 'N/A' ? escHtml(beat.key) : null
  ].filter(Boolean).join(' · ');
  const buy = beat.buyLink
    ? `<a href="${escHtml(beat.buyLink)}" target="_blank" rel="noopener" class="moderate-buy-link"><i class="ti ti-shopping-cart"></i> Buy link</a>`
    : '';
  return `
    <article class="moderate-card profile-glass" id="moderate-card-${beat.id}">
      <div class="moderate-card-head">
        <div class="moderate-card-title">${escHtml(beat.title)}</div>
        <div class="moderate-card-producer">@${escHtml(beat.producer)}</div>
      </div>
      <div class="moderate-card-meta">${meta}${beat.createdAt ? ` · ${formatModerateDate(beat.createdAt)}` : ''}</div>
      <div class="moderate-card-preview">${buildModeratePreviewHTML(beat)}</div>
      ${buy ? `<div class="moderate-card-buy">${buy}</div>` : ''}
      <div class="moderate-card-actions">
        <button type="button" class="moderate-btn moderate-btn--approve" onclick="moderateBeat('${beat.id}','approve')" ${busy ? 'disabled' : ''}>
          <i class="ti ti-check"></i> Approve
        </button>
        <button type="button" class="moderate-btn moderate-btn--reject" onclick="moderateBeat('${beat.id}','reject')" ${busy ? 'disabled' : ''}>
          <i class="ti ti-x"></i> Reject
        </button>
      </div>
    </article>`;
}

function renderModerateScreen() {
  const wrap = document.getElementById('moderateWrap');
  if (!wrap) return;

  if (!currentUser) {
    wrap.innerHTML = `
      <div class="moderate-empty profile-glass">
        <i class="ti ti-lock"></i>
        <div>Sign in to access moderation.</div>
      </div>`;
    return;
  }

  if (!_isModerator) {
    wrap.innerHTML = `
      <div class="moderate-empty profile-glass">
        <i class="ti ti-shield-x"></i>
        <div>Admin access only.</div>
      </div>`;
    return;
  }

  if (!_moderateQueue.length) {
    wrap.innerHTML = `
      <div class="moderate-empty profile-glass">
        <i class="ti ti-circle-check"></i>
        <div>No pending beats — queue is clear.</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="moderate-queue-head">${_moderateQueue.length} pending</div>
    <div class="moderate-queue">${_moderateQueue.map(renderModerateCard).join('')}</div>`;
}

async function loadModerateQueue() {
  const token = await getAccessToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/moderate-beats', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) return false;
    const data = await res.json();
    _moderateQueue = data.pending || [];
    _moderatePendingCount = data.count ?? _moderateQueue.length;
    return true;
  } catch (_) {
    return false;
  }
}

async function moderateBeat(beatId, action) {
  if (_moderateBusyId) return;
  const label = action === 'approve' ? 'Approve' : 'Reject';
  if (!confirm(`${label} this beat?`)) return;

  const token = await getAccessToken();
  if (!token) {
    showToast('Sign in required.', 'error');
    return;
  }

  _moderateBusyId = beatId;
  renderModerateScreen();

  try {
    const res = await fetch('/api/moderate-beats', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, beatId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Could not update beat.', 'error');
      await loadModerateQueue();
      renderModerateScreen();
      return;
    }
    _moderateQueue = _moderateQueue.filter(b => b.id !== beatId);
    _moderatePendingCount = _moderateQueue.length;
    showToast(action === 'approve' ? 'Beat approved.' : 'Beat rejected.', 'success');
    renderModerateScreen();
    const countEl = document.getElementById('moderatePendingCount');
    if (countEl) {
      countEl.textContent = _moderatePendingCount
        ? `${_moderatePendingCount} pending`
        : 'Queue clear';
    }
  } catch (_) {
    showToast('Network error.', 'error');
    await loadModerateQueue();
    renderModerateScreen();
  } finally {
    _moderateBusyId = null;
  }
}

async function openModerateScreen() {
  if (!currentUser) {
    goTo('profileScreen', 'navProfile');
    return;
  }
  const ok = await checkModeratorAccess();
  if (!ok) {
    showToast('Admin access only.', 'error');
    return;
  }
  goTo('moderateScreen', null);
}

function resetModeratorState() {
  _isModerator = false;
  _moderatePendingCount = 0;
  _moderateQueue = [];
  _moderateBusyId = null;
}
