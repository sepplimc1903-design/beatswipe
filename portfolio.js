/* BeatSwipe portfolio module — loaded between app script parts */
function spawnPortfolioConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = document.getElementById('portfolioCardSlot');
  if (!host) return;
  const wrap = document.createElement('div');
  wrap.className = 'portfolio-confetti';
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('span');
    p.className = 'portfolio-confetti-piece';
    p.style.setProperty('--cf-x', (Math.random() * 80 - 40) + 'px');
    p.style.setProperty('--cf-delay', (Math.random() * 0.25) + 's');
    p.style.left = (8 + Math.random() * 84) + '%';
    wrap.appendChild(p);
  }
  host.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2200);
}

function playPortfolioEnterAnim() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const header = document.getElementById('portfolioHeader');
  const cardWrap = document.getElementById('portfolioCardWrap');
  [header, cardWrap].forEach(el => el?.classList.remove('portfolio-enter-played'));
  void header?.offsetWidth;
  header?.classList.add('portfolio-enter-played');
  if (!isMobileUI()) cardWrap?.classList.add('portfolio-enter-played');
}

// ─── PORTFOLIO SWIPE (/p/name) ────────────────────────────────────────────
let _portfolioMode = false;
let _portfolioProducer = null;
let _portfolioBeats = [];
let _portfolioIdx = 0;
let _portfolioSkipped = [];
let _portfolioProfile = {};
let _portfolioSwipeLock = false;
let _prevScreen = 'discoverScreen';
let _prevNav = 'navDiscover';
let _portfolioShowBack = false;
let _portfolioPreview = false;
let _portfolioPreviewPassed = [];

function setPortfolioBackVisible(show) {
  _portfolioShowBack = !!show;
  document.body.classList.toggle('portfolio-has-back', _portfolioShowBack);
}

function closePortfolioPreview() {
  if (!_portfolioShowBack) return;
  try {
    history.back();
  } catch (e) {
    setPortfolioBackVisible(false);
    exitPortfolioMode();
    stopTrack();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    applyGoTo(_prevScreen || 'submitScreen', _prevNav || 'navSubmit');
    try { history.replaceState(null, '', '/'); } catch (err) {}
  }
}

function portfolioSlugFromName(name) {
  return encodeURIComponent(String(name).trim().toLowerCase().replace(/\s+/g, '-'));
}

function getPortfolioSlugFromURL() {
  const m = window.location.pathname.match(/^\/p\/([^/]+)\/?$/i);
  if (m) return decodeURIComponent(m[1]);
  const q = new URLSearchParams(window.location.search).get('producer');
  return q ? decodeURIComponent(q) : null;
}

function findProducerBySlug(slug) {
  if (!slug) return null;
  const norm = s => String(s).toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(slug);
  const allBeats = Object.values(_rawDb).flat();
  const names = [...new Set(allBeats.map(b => b.producer).filter(Boolean))];
  return names.find(p => norm(p) === target) || names.find(p => p.toLowerCase() === slug.toLowerCase()) || null;
}

async function findProducerInProfiles(slug) {
  if (!slug) return null;
  try {
    const { data } = await supa.from('profiles').select('producer_name').not('producer_name', 'is', null);
    if (!data?.length) return null;
    const norm = s => String(s).toLowerCase().replace(/[\s_-]+/g, '');
    const target = norm(slug);
    const match = data.find(p => {
      const name = p.producer_name;
      return norm(name) === target || portfolioSlugFromName(name) === slug.toLowerCase();
    });
    return match?.producer_name || null;
  } catch(e) { return null; }
}

const _SITE_META = {
  title: 'BeatSwipe – Free Swipe Portfolio for Producers',
  description: 'Your swipe page for the bio. Fans swipe through your beats, save favorites, and buy directly from you — free for producers.',
  url: 'https://beatswipe.app',
  image: 'https://beatswipe.app/og-image.png'
};

function setHeadMeta(nameOrProp, content, isProperty) {
  const sel = isProperty ? `meta[property="${nameOrProp}"]` : `meta[name="${nameOrProp}"]`;
  let el = document.querySelector(sel);
  if (!el) {
    el = document.createElement('meta');
    if (isProperty) el.setAttribute('property', nameOrProp);
    else el.setAttribute('name', nameOrProp);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(url) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

function updatePortfolioMeta(producerName, profile, slug) {
  const bio = (profile?.bio || '').trim() || 'Swipe through beats, save favorites, buy directly from the producer.';
  const title = producerName + ' – BeatSwipe';
  const url = 'https://beatswipe.app/p/' + slug;
  const image = (profile?.avatar_url && profile.avatar_url.startsWith('http')) ? profile.avatar_url : _SITE_META.image;
  document.title = title;
  setHeadMeta('description', bio, false);
  setHeadMeta('og:type', 'website', true);
  setHeadMeta('og:url', url, true);
  setHeadMeta('og:title', title, true);
  setHeadMeta('og:description', bio, true);
  setHeadMeta('og:image', image, true);
  setHeadMeta('twitter:card', 'summary_large_image', false);
  setHeadMeta('twitter:title', title, false);
  setHeadMeta('twitter:description', bio, false);
  setHeadMeta('twitter:image', image, false);
  setCanonical(url);
}

function resetSiteMeta() {
  document.title = _SITE_META.title;
  setHeadMeta('description', _SITE_META.description, false);
  setHeadMeta('og:type', 'website', true);
  setHeadMeta('og:url', _SITE_META.url, true);
  setHeadMeta('og:title', _SITE_META.title, true);
  setHeadMeta('og:description', _SITE_META.description, true);
  setHeadMeta('og:image', _SITE_META.image, true);
  setHeadMeta('twitter:title', _SITE_META.title, false);
  setHeadMeta('twitter:description', _SITE_META.description, false);
  setHeadMeta('twitter:image', _SITE_META.image, false);
  setCanonical(_SITE_META.url);
}

function getPortfolioList() {
  if (_portfolioPreview) {
    return _portfolioBeats.filter(b => !_portfolioPreviewPassed.includes(b.id));
  }
  const crateIds = new Set(crate.map(b => b.id));
  return _portfolioBeats.filter(b => !crateIds.has(b.id) && !_portfolioSkipped.includes(b.id));
}

function getPortfolioSavedBeats() {
  const ids = new Set(_portfolioBeats.map(b => b.id));
  return crate.filter(b => ids.has(b.id));
}

function buildPortfolioDoneHTML() {
  if (_portfolioPreview) {
    const skipped = _portfolioSkipped.length;
    const replayBtn = skipped > 0 ? `
      <button type="button" class="portfolio-replay-btn" onclick="replayPortfolioSkipped()">
        <i class="ti ti-refresh" style="font-size:15px;color:var(--accent-mid);vertical-align:-2px;margin-right:6px"></i>Replay ${skipped} skipped beat${skipped === 1 ? '' : 's'}
      </button>` : '';
    return `<div class="portfolio-surface"><div class="portfolio-done">
      <div class="portfolio-done-head"><i class="ti ti-check"></i>Preview complete</div>
      <div class="portfolio-done-sub">This is what fans see from your bio link. Saves here are not stored.</div>
      ${replayBtn}
    </div></div>`;
  }
  const saved = getPortfolioSavedBeats();
  const skipped = _portfolioSkipped.length;
  const replayBtn = skipped > 0 ? `
    <button type="button" class="portfolio-replay-btn" onclick="replayPortfolioSkipped()">
      <i class="ti ti-refresh" style="font-size:15px;color:var(--accent-mid);vertical-align:-2px;margin-right:6px"></i>Replay ${skipped} skipped beat${skipped === 1 ? '' : 's'}
    </button>` : '';
  const guestHint = !currentUser && saved.length
    ? `<p class="portfolio-done-guest">Your saves stay on this device. Visit beatswipe.app to create a free account.</p>`
    : '';

  if (saved.length) {
    const savedList = saved.map(b => {
      const hasBuy = b.buy && b.buy.startsWith('http') && b.buy !== b.mp3;
      const buyUrl = hasBuy ? b.buy : ((isYouTube(b.mp3) || isSoundCloud(b.mp3)) ? b.mp3 : '');
      const buyLink = buyUrl
        ? `<a href="${buyUrl}" target="_blank" rel="noopener" class="portfolio-done-buy">Buy</a>`
        : '';
      return `<div class="portfolio-done-item">
        <div class="portfolio-done-meta">
          <div class="portfolio-done-title">${escHtml(b.title)}</div>
          <div class="portfolio-done-tags">${escHtml(b.bpm)} · ${escHtml(b.genre)} · ${escHtml(b.type)}</div>
        </div>
        ${buyLink}
      </div>`;
    }).join('');
    return `<div class="portfolio-surface"><div class="portfolio-done">
      <div class="portfolio-done-head"><i class="ti ti-flame"></i>You saved ${saved.length} beat${saved.length === 1 ? '' : 's'}</div>
      <div class="portfolio-done-sub">License directly from ${_portfolioProducer ? escHtml(_portfolioProducer) : 'the producer'}.</div>
      <div class="portfolio-done-list">${savedList}</div>
      ${guestHint}
      ${replayBtn}
    </div></div>`;
  }

  return `<div class="portfolio-surface"><div class="portfolio-done">
    <div class="portfolio-done-head"><i class="ti ti-check"></i>All caught up</div>
    <div class="portfolio-done-sub">You swiped through every beat from ${_portfolioProducer ? escHtml(_portfolioProducer) : 'this producer'}.</div>
    ${replayBtn}
  </div></div>`;
}

function setPortfolioDoneMode(on) {
  document.getElementById('portfolioPageInner')?.classList.toggle('page-inner--swipe-done', !!on);
  document.body.classList.toggle('portfolio-swipe-done', !!on);
}

function getPortfolioFlyEl() {
  return document.querySelector('#portfolioCardSlot .portfolio-surface:not(.portfolio-fly-clone)');
}

function afterPortfolioCardFly(cb) {
  const card = getPortfolioFlyEl();
  if (!card) { cb(); return; }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    card.removeEventListener('transitionend', onEnd);
    cb();
  };
  const onEnd = (e) => {
    if (e.target !== card || e.propertyName !== 'transform') return;
    finish();
  };
  card.addEventListener('transitionend', onEnd);
  setTimeout(finish, 420);
}

function flyOutPortfolioCard(dir, onReplaced) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  purgeOrphanSwipeNodes();
  document.getElementById('portfolioCardWrap')?.classList.remove('portfolio-enter-played');
  const flyEl = getPortfolioFlyEl();
  const wrap = document.getElementById('portfolioCardWrap');
  if (reduced || !flyEl || !wrap) {
    purgeOrphanSwipeNodes();
    onReplaced();
    _portfolioSwipeLock = false;
    return;
  }

  flyEl.classList.remove('swipe-drag-pinned', 'dragging', 'spring-snap', 'card-enter-portfolio');
  flyEl.style.position = '';
  flyEl.style.left = '';
  flyEl.style.top = '';
  flyEl.style.width = '';
  flyEl.style.margin = '';

  const wrapRect = wrap.getBoundingClientRect();
  const playerMinH = measureFlyPlayerHeight(flyEl);
  stripEmbedsForFly(flyEl);
  const { transform: dragTransform, rect: flyRect } = takePendingFlyMetrics(flyEl);
  const clone = buildFlyCardShell(flyEl, dragTransform, playerMinH);
  clone.style.willChange = 'transform, opacity';
  clone.classList.add('portfolio-fly-clone');
  clone.style.top = (flyRect.top - wrapRect.top) + 'px';
  clone.style.left = (flyRect.left - wrapRect.left) + 'px';
  clone.style.width = flyRect.width + 'px';

  wrap.appendChild(clone);
  void clone.offsetWidth;

  const flyClass = dir === 'left' ? 'fly-left' : 'fly-right';
  const startFly = () => clone.classList.add(flyClass);
  if (isMobileUI()) {
    onReplaced();
    void clone.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(startFly));
  } else {
    requestAnimationFrame(() => {
      startFly();
      setTimeout(onReplaced, 48);
    });
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clone.style.willChange = '';
    clone.remove();
    _portfolioSwipeLock = false;
  };
  clone.addEventListener('transitionend', e => {
    if (e.target !== clone || e.propertyName !== 'transform') return;
    finish();
  });
  setTimeout(finish, 480);
}

function flyOutDiscoverCard(dir, onReplaced) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flyEl = document.getElementById('theCard');
  const wrap = document.getElementById('cardWrap');
  if (reduced || !flyEl || !wrap) {
    onReplaced();
    return;
  }

  const playerMinH = measureFlyPlayerHeight(flyEl);
  stripEmbedsForFly(flyEl);
  const { transform: dragTransform, rect } = takePendingFlyMetrics(flyEl);
  const clone = buildFlyCardShell(flyEl, dragTransform, playerMinH);
  clone.style.willChange = 'transform, opacity';
  clone.classList.add('discover-fly-clone');

  const flyClass = dir === 'left' ? 'fly-left' : 'fly-right';
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clone.style.willChange = '';
    clone.remove();
  };
  clone.classList.add('discover-fly-clone--viewport');
  clone.style.position = 'fixed';
  clone.style.left = rect.left + 'px';
  clone.style.top = rect.top + 'px';
  clone.style.width = rect.width + 'px';
  clone.style.zIndex = '650';
  document.body.appendChild(clone);
  void clone.offsetWidth;
  flyEl.style.visibility = 'hidden';
  requestAnimationFrame(() => {
    clone.classList.add(flyClass);
    setTimeout(onReplaced, 48);
  });

  clone.addEventListener('transitionend', e => {
    if (e.target !== clone || e.propertyName !== 'transform') return;
    finish();
  });
  setTimeout(finish, 480);
}

function buildBeatCardHTML(d, opts) {
  const hideProducer = opts && opts.hideProducer;
  const portfolioWrap = opts && opts.portfolioWrap;
  const bars = Array(36).fill(0).map(() =>
    `<div class="wbar" style="height:${Math.round(Math.random()*14+3)}px;opacity:0.55"></div>`
  ).join('');
  const useYT = isYouTube(d.mp3);
  const useSC = isSoundCloud(d.mp3);
  const ytId = useYT ? getYtId(d.mp3) : null;
  const embedSrc = ytId ? getYtEmbedBase(ytId) : '';
  const scEmbedSrc = useSC ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(d.mp3)}&color=%237C3AED&auto_play=${_audioUnlocked ? 'true' : 'false'}&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false` : '';
  const hasBuy = d.buy && d.buy.startsWith('http') && d.buy !== d.mp3;
  const buyUrl = hasBuy ? d.buy : (useYT || useSC ? d.mp3 : d.buy);
  const playerHTML = useYT ? `
    <div class="yt-wrap">
      <iframe id="ytFrame" data-src="${embedSrc}" src="about:blank"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe>
      <div class="yt-overlay" id="ytOverlay" onclick="startVideo()">
        <div class="yt-play-icon"><i class="ti ti-player-play"></i></div>
      </div>
    </div>
    <div class="yt-footer">
      <span class="yt-hint"><i class="ti ti-brand-youtube" style="font-size:13px;color:#FF0000;vertical-align:middle;margin-right:3px"></i>Tap to preview</span>
      ${buyUrl ? `<a href="${buyUrl}" target="_blank" rel="noopener" class="yt-link">Buy <i class="ti ti-external-link" style="font-size:11px"></i></a>` : ''}
    </div>` : useSC ? `
    <div style="border-radius:14px;overflow:hidden;border:0.5px solid var(--border)">
      <iframe
        src="${scEmbedSrc}"
        width="100%" height="120" scrolling="no" frameborder="no" allow="autoplay"
        style="display:block;background:#000">
      </iframe>
    </div>
    <div class="yt-footer">
      <span class="yt-hint"><i class="ti ti-brand-soundcloud" style="font-size:13px;color:#FF5500;vertical-align:middle;margin-right:3px"></i>SoundCloud preview</span>
      ${buyUrl ? `<a href="${buyUrl}" target="_blank" rel="noopener" class="yt-link">Buy <i class="ti ti-external-link" style="font-size:11px"></i></a>` : ''}
    </div>` : `
    <div class="player-area">
      <div class="waveform-wrap" onclick="togglePlay()">
        <div class="waveform">${bars}</div>
      </div>
      <div class="player-controls">
        <button class="play-btn" id="playBtn" onclick="togglePlay()" aria-label="Play/Pause">
          <i class="ti ti-player-play" style="margin-left:2px"></i>
        </button>
        <div class="progress-wrap">
          <div class="progress-bar" id="progressBar" onpointerdown="startProgressScrub(event)">
            <div class="progress-fill" id="progressFill"></div>
            <div class="progress-thumb" id="progressThumb" aria-hidden="true"></div>
          </div>
          <div class="time-row">
            <span class="time-lbl" id="timeCur">0:00</span>
            <span class="time-lbl" id="timeDur">--:--</span>
          </div>
        </div>
        ${buyUrl ? `<a href="${buyUrl}" target="_blank" rel="noopener" class="buy-link"><i class="ti ti-shopping-cart" style="font-size:15px"></i>Buy</a>` : ''}
      </div>
    </div>`;
  const producerLine = hideProducer ? '' : `<div class="track-by" style="cursor:pointer;color:var(--accent-mid)" onclick="openProducerProfile('${d.producer.replace(/'/g,"\\'")}')">by ${d.producer} <i class="ti ti-arrow-right" style="font-size:10px"></i></div>`;
  const cardInner = `
      <div class="card-head">
        <span class="swipe-label swipe-label-skip" id="labelSkip">SKIP</span>
        <span class="swipe-label swipe-label-save" id="labelSave">SAVE</span>
        <div class="cover-box" style="background:${d.color}20;border:0.5px solid ${d.color}50">
          <i class="ti ti-${d.type==='Drums'?'circle':'music'}" style="font-size:24px;color:${d.color}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div class="track-name">${d.title}</div>
          ${producerLine}
        </div>
        <div class="card-head-meta">
          <span class="type-pill type-pill--head">${d.type}</span>
        </div>
      </div>
      <div class="tag-row">
        <span class="tag">${d.bpm}</span>
        <span class="tag">${d.key}</span>
        <span class="tag">${d.genre}</span>
      </div>
      ${playerHTML}`;
  if (portfolioWrap) return `<div class="card-stage portfolio-card-stage"><div class="card-glow" id="cardGlow" aria-hidden="true"></div><div class="portfolio-surface"><div class="portfolio-beat" id="theCard">${cardInner}</div></div></div>`;
  return `
    <div class="card-stage">
    <div class="card-glow" id="cardGlow" style="--glow-color:${d.color}"></div>
    <div class="beat-card" id="theCard">${cardInner}
    </div>
    </div>`;
}

async function loadPortfolioProfile(producerName) {
  let profile = {};
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/profiles?producer_name=eq.${encodeURIComponent(producerName)}&select=id,producer_name,bio,avatar_url,instagram,soundcloud,beatstars,youtube,beat_order&limit=1`,
      { headers: { apikey: SUPA_KEY, Accept: 'application/json' } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows[0]) profile = rows[0];
    }
  } catch (e) {}
  if (!profile.producer_name) {
    try {
      const { data } = await supa.from('profiles').select('*').eq('producer_name', producerName).single();
      if (data) profile = data;
    } catch (e) {}
  }
  _portfolioProfile = profile;
  return profile;
}

function buildSocialHref(platform, raw) {
  const v = (raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (platform === 'instagram') {
    return 'https://instagram.com/' + encodeURIComponent(v.replace(/^@/, ''));
  }
  if (platform === 'soundcloud') {
    if (v.includes('soundcloud.com')) return 'https://' + v.replace(/^https?:\/\//, '');
    return 'https://soundcloud.com/' + v.replace(/^@/, '');
  }
  if (platform === 'beatstars') {
    if (v.includes('beatstars.com')) return v.startsWith('http') ? v : 'https://' + v.replace(/^https?:\/\//, '');
    return 'https://www.beatstars.com/' + v.replace(/^@/, '');
  }
  if (platform === 'youtube') {
    if (v.includes('youtube.com') || v.includes('youtu.be')) return v.startsWith('http') ? v : 'https://' + v.replace(/^https?:\/\//, '');
    return 'https://youtube.com/@' + encodeURIComponent(v.replace(/^@/, ''));
  }
  return null;
}

function buildPortfolioSocialsHTML(profile) {
  const links = [
    { key: 'instagram', icon: 'ti-brand-instagram', label: 'Instagram' },
    { key: 'beatstars', icon: 'ti-music', label: 'BeatStars' },
    { key: 'soundcloud', icon: 'ti-brand-soundcloud', label: 'SoundCloud' },
    { key: 'youtube', icon: 'ti-brand-youtube', label: 'YouTube' },
  ];
  const items = links.map(l => {
    const href = buildSocialHref(l.key, profile[l.key]);
    if (!href) return '';
    return `<a class="portfolio-social-link" href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="${l.label}"><i class="ti ${l.icon}"></i></a>`;
  }).filter(Boolean).join('');
  return items ? `<div class="portfolio-socials">${items}</div>` : '';
}

function portfolioInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function slugToDisplayName(slug) {
  return decodeURIComponent(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Producer';
}

function portfolioCardSkeletonHTML() {
  return `<div class="portfolio-surface portfolio-surface--loading"><div class="card-skeleton">
    <div class="skel-row"><div class="skel-circle"></div><div class="skel-lines"><div class="skel-line skel-line--lg"></div><div class="skel-line skel-line--sm"></div></div></div>
    <div class="skel-tags"><div class="skel-pill"></div><div class="skel-pill"></div><div class="skel-pill"></div></div>
    <div class="skel-player"></div>
  </div></div>`;
}

function portfolioHeaderSkeletonHTML(displayName) {
  return `
    <div class="portfolio-header-main">
      <div class="portfolio-avatar-fallback portfolio-avatar-fallback--skel" aria-hidden="true"></div>
      <div class="portfolio-header-text">
        <div class="portfolio-name">${escHtml(displayName)}</div>
        <div class="portfolio-bio portfolio-bio--skel" aria-hidden="true">&nbsp;</div>
      </div>
      <div class="portfolio-counter portfolio-counter--skel" id="portfolioCounter">…</div>
    </div>
    <div class="portfolio-progress" aria-hidden="true"><div class="portfolio-progress-fill" id="portfolioProgressFill" style="width:0%"></div></div>`;
}

function showPortfolioLoadingState(slug) {
  _portfolioMode = true;
  document.documentElement.classList.remove('portfolio-route-boot');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('portfolioScreen')?.classList.add('active');
  document.body.classList.remove('discover-active', 'site-scroll');
  document.body.classList.add('portfolio-active');
  const header = document.getElementById('portfolioHeader');
  if (header) header.innerHTML = portfolioHeaderSkeletonHTML(slugToDisplayName(slug));
  const slot = document.getElementById('portfolioCardSlot');
  if (slot) slot.innerHTML = portfolioCardSkeletonHTML();
  setPortfolioGlow('#7C3AED');
}

function updatePortfolioProgress() {
  const list = getPortfolioList();
  const total = _portfolioBeats.length;
  const counter = document.getElementById('portfolioCounter');
  const fill = document.getElementById('portfolioProgressFill');
  if (!total) {
    if (counter) counter.textContent = '…';
    if (fill) fill.style.width = '0%';
    return;
  }
  if (!list.length) {
    if (counter) counter.textContent = 'Done';
    if (fill) fill.style.width = '100%';
    return;
  }
  const current = total - list.length + 1;
  const done = total - list.length;
  if (counter) counter.textContent = current + ' / ' + total;
  if (fill) fill.style.width = Math.min(100, (done / total) * 100) + '%';
}

function renderPortfolioHeader(producerName, profile, color) {
  const header = document.getElementById('portfolioHeader');
  if (!header) return;
  const hex = (color && String(color).startsWith('#')) ? color : '#7C3AED';
  const avatarEl = profile.avatar_url
    ? `<img src="${escHtml(profile.avatar_url)}" class="portfolio-avatar" alt="${escHtml(producerName)}">`
    : `<div class="portfolio-avatar-fallback" style="background:${hex}20;border-color:${hex}80;color:${hex}">${escHtml(portfolioInitials(producerName))}</div>`;
  const bio = profile.bio ? escHtml(profile.bio) : 'Independent producer';
  const socials = buildPortfolioSocialsHTML(profile);
  header.innerHTML = `
    <div class="portfolio-header-main">
      ${avatarEl}
      <div class="portfolio-header-text">
        <div class="portfolio-name">${escHtml(producerName)}</div>
        <div class="portfolio-bio">${bio}</div>
        ${socials}
      </div>
      <div class="portfolio-counter" id="portfolioCounter">1 / 1</div>
    </div>
    <div class="portfolio-progress"><div class="portfolio-progress-fill" id="portfolioProgressFill" style="width:0%"></div></div>`;
  updatePortfolioProgress();
}

function setPortfolioGlow(color) {
  const hex = (color && String(color).startsWith('#')) ? color : '#7C3AED';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  document.body.style.setProperty('--pf-glow', `rgba(${r}, ${g}, ${b}, 0.42)`);
}

function renderPortfolioCard() {
  purgeOrphanSwipeNodes();
  pauseTrackForCardSwap();
  _audioPanel = 'portfolio';
  const slot = document.getElementById('portfolioCardSlot');
  const list = getPortfolioList();

  if (!list.length) {
    setPortfolioDoneMode(true);
    setPortfolioGlow(_portfolioBeats[0]?.color || '#7C3AED');
    updatePortfolioProgress();
    if (!slot) return;
    if (!_portfolioBeats.length) {
      slot.innerHTML = `<div class="empty-card"><i class="ti ti-music-off"></i>No beats yet.<br><span style="font-size:12px;color:var(--text-3)">This producer hasn't published beats yet.</span></div>`;
    } else {
      slot.innerHTML = buildPortfolioDoneHTML();
      spawnPortfolioConfetti();
    }
    return;
  }

  setPortfolioDoneMode(false);
  updatePortfolioProgress();
  const d = list[0];
  const useYT = isYouTube(d.mp3);
  const useSC = isSoundCloud(d.mp3);
  setPortfolioGlow(d.color);
  if (slot) slot.innerHTML = buildBeatCardHTML(d, { hideProducer: true, portfolioWrap: true });

  if (!useYT && !useSC) {
    const mp3 = d.mp3;
    const startMp3 = () => {
      vizTimer = setInterval(() => {
        document.querySelectorAll('.wbar').forEach(b => {
          b.style.height = Math.round(Math.random() * 14 + 3) + 'px';
        });
      }, 600);
      loadTrack(mp3, 'portfolio');
      maybeAutoplayPreview(false, false);
    };
    if (isMobileUI()) setTimeout(startMp3, 120);
    else startMp3();
  }

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !isMobileUI()) {
    const card = getPortfolioFlyEl();
    if (card) {
      card.classList.add('card-enter-portfolio');
      card.addEventListener('animationend', () => card.classList.remove('card-enter-portfolio'), { once: true });
    }
  }
  if (!isMobileUI() || useYT || useSC) maybeAutoplayPreview(useYT, useSC);
}

document.addEventListener('touchend', e => {
  if (!_portfolioMode || _swipeDragging || _swipeCommitted) return;
  if (!e.target.closest('#portfolioScreen')) return;
  if (e.target.closest('.portfolio-action-row,.act-btn,iframe,button,a,.progress-bar,.waveform-wrap,.yt-overlay')) return;
  tryAutoplayFromGesture();
}, { passive: true });

function replayPortfolioSkipped() {
  if (_portfolioPreview) {
    const skippedSet = new Set(_portfolioSkipped);
    _portfolioPreviewPassed = _portfolioPreviewPassed.filter(id => !skippedSet.has(id));
  }
  _portfolioSkipped = [];
  setPortfolioDoneMode(false);
  renderPortfolioCard();
}

function showPortfolioNotFound(slug) {
  _portfolioMode = true;
  document.documentElement.classList.remove('portfolio-route-boot');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('portfolioScreen')?.classList.add('active');
  document.body.classList.add('portfolio-active');
  document.body.classList.remove('discover-active', 'site-scroll');
  const header = document.getElementById('portfolioHeader');
  if (header) header.innerHTML = `<div class="portfolio-name" style="flex:1">Producer not found</div>`;
  const slot = document.getElementById('portfolioCardSlot');
  if (slot) slot.innerHTML = `<div class="empty-card"><i class="ti ti-user-off"></i>No producer "<span style="color:var(--text)">${escHtml(slug)}</span>" yet.<br><span style="font-size:12px;color:var(--text-3)"><a onclick="goTo('landScreen','navHome')" style="color:var(--accent-mid);cursor:pointer">Get your own page</a> — add beats on My Page to go live.</span></div>`;
  updatePortfolioMeta(slug, { bio: 'Producer portfolio page on BeatSwipe.' }, portfolioSlugFromName(slug));
}

async function openPortfolio(producerName, opts) {
  opts = opts || {};
  const allBeats = Object.values(_rawDb).flat();
  const profile = await loadPortfolioProfile(producerName);
  const beats = sortBeatsByOrder(
    allBeats.filter(b => b.producer === producerName),
    getBeatOrderForProducer(producerName, profile)
  );
  if (!beats.length && !opts.fromRoute) return;

  if (!opts.fromRoute) {
    const activeScreen = document.querySelector('.screen.active');
    _prevScreen = activeScreen ? activeScreen.id : 'discoverScreen';
    const activeNav = document.querySelector('.nav-tab.active') || document.querySelector('.dtb-tab.active');
    _prevNav = activeNav ? activeNav.id.replace(/^dtb/, 'nav') : 'navDiscover';
  }

  setPortfolioBackVisible(!opts.fromRoute);

  _portfolioMode = true;
  _portfolioPreview = !!opts.preview;
  _portfolioProducer = producerName;
  _portfolioBeats = beats;
  _portfolioIdx = 0;
  _portfolioSkipped = [];
  _portfolioPreviewPassed = [];
  _portfolioSwipeLock = false;

  document.documentElement.classList.remove('portfolio-route-boot');
  stopTrack();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'screen-fade-out', 'screen-entering'));
  document.getElementById('portfolioScreen')?.classList.add('active');
  document.body.classList.remove('discover-active', 'site-scroll');
  document.body.classList.add('portfolio-active');

  const color = beats[0]?.color || 'var(--accent)';
  renderPortfolioHeader(producerName, profile, color);
  renderPortfolioCard();
  playPortfolioEnterAnim();

  const slug = portfolioSlugFromName(producerName);
  if (!opts.skipHistory) {
    const url = '/p/' + slug;
    const state = { portfolio: producerName };
    if (opts.fromRoute) history.replaceState(state, '', url);
    else history.pushState(state, '', url);
  }
  updatePortfolioMeta(producerName, profile, slug);
}

function openProducerProfile(producerName) {
  openPortfolio(producerName);
}

function exitPortfolioMode() {
  resetSwipeGestureState();
  setPortfolioBackVisible(false);
  _portfolioMode = false;
  _portfolioPreview = false;
  _portfolioPreviewPassed = [];
  _portfolioProducer = null;
  document.body.classList.remove('portfolio-active', 'portfolio-swipe-done');
  document.body.style.removeProperty('--pf-glow');
  resetSiteMeta();
}

async function handlePortfolioPopstate() {
  const slug = getPortfolioSlugFromURL();
  if (slug) {
    const producerName = findProducerBySlug(slug) || await findProducerInProfiles(slug);
    if (producerName) await openPortfolio(producerName, { fromRoute: true, skipHistory: true });
    else showPortfolioNotFound(slug);
    return;
  }
  if (_portfolioMode) {
    setPortfolioBackVisible(false);
    _portfolioMode = false;
    _portfolioPreview = false;
    _portfolioPreviewPassed = [];
    _portfolioProducer = null;
    document.body.classList.remove('portfolio-active', 'portfolio-swipe-done');
    resetSiteMeta();
    stopTrack();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    applyGoTo(_prevScreen || 'landScreen', _prevNav || 'navHome');
  }
}

function copyPortfolioLink(ev) {
  const name = _userProfile?.producer_name;
  if (!name) { showToast('Set your producer name in Profile first.', 'error'); return; }
  const url = 'https://beatswipe.app/p/' + portfolioSlugFromName(name);
  const btn = ev?.currentTarget || ev?.target?.closest?.('button');
  const pulseCopy = () => {
    if (!btn) return;
    btn.classList.remove('copy-pulse');
    void btn.offsetWidth;
    btn.classList.add('copy-pulse');
    setTimeout(() => btn.classList.remove('copy-pulse'), 560);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied!', 'success');
      pulseCopy();
    }).catch(() => {
      showToast('Couldn\'t copy — select the link manually.', 'error');
      prompt('Copy your portfolio link:', url);
    });
  } else {
    prompt('Copy your portfolio link:', url);
  }
}
