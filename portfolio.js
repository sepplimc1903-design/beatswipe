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
  let ld = document.getElementById('portfolioJsonLd');
  if (!ld) {
    ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'portfolioJsonLd';
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: title,
    description: bio,
    url,
    mainEntity: {
      '@type': 'MusicGroup',
      name: producerName,
      url,
      ...(image ? { image } : {})
    }
  });
}

function resetSiteMeta() {
  document.getElementById('portfolioJsonLd')?.remove();
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
  const beatMap = new Map(_portfolioBeats.map(b => [b.id, b]));
  return crate
    .filter(b => beatMap.has(b.id))
    .map(b => ({ ...b, ...beatMap.get(b.id) }));
}

let _portfolioDoneSelectedId = null;
let _portfolioDonePreviewOpen = false;

function isPortfolioDoneMobileFlow() {
  return typeof isMobileUI === 'function' && isMobileUI();
}

function syncPortfolioDonePreviewMode() {
  document.body.classList.toggle(
    'portfolio-done-preview-open',
    isPortfolioDoneMobileFlow() && _portfolioDonePreviewOpen
  );
}

function renderPortfolioDoneList() {
  const list = document.getElementById('portfolioDoneList');
  if (!list) return;
  const saved = getPortfolioSavedBeats();
  const mobile = isPortfolioDoneMobileFlow();
  list.innerHTML = saved.map(d => {
    const sel = !mobile && d.id === _portfolioDoneSelectedId ? ' crate-card--selected' : '';
    const action = beatBuyAction(d);
    const id = String(d.id).replace(/'/g, "\\'");
    const actionHTML = !mobile && action
      ? `<button class="crate-action-btn" data-portfolio-buy="1" data-beat-id="${escHtml(String(d.id))}" onclick="event.stopPropagation();window.open('${action.link.replace(/'/g, "\\'")}','_blank')">${action.html}</button>`
      : (mobile ? '<i class="ti ti-chevron-right portfolio-done-chevron"></i>' : '');
    return `<div class="crate-card${sel}" onclick="selectPortfolioDoneBeat('${id}')">
      <div class="mini-cover"><i class="ti ti-music"></i></div>
      <div class="crate-info">
        <div class="crate-name">${escHtml(d.title)}</div>
        <div class="crate-meta">${escHtml(d.bpm)} · ${escHtml(d.genre)} · ${escHtml(d.type)}</div>
      </div>
      ${actionHTML ? `<div class="crate-actions">${actionHTML}</div>` : ''}
    </div>`;
  }).join('');
}

function renderPortfolioDonePreview() {
  const panel = document.getElementById('portfolioDonePreviewPanel');
  if (!panel) return;
  const mobile = isPortfolioDoneMobileFlow();
  if (mobile && !_portfolioDonePreviewOpen) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const beat = getPortfolioSavedBeats().find(b => b.id === _portfolioDoneSelectedId);
  const previewHTML = beat ? buildCratePreviewHTML(beat, { prominentBuy: true, trackBuy: true }) : buildCratePreviewHTML(null);
  const backBtn = mobile
    ? `<button type="button" class="portfolio-done-back" onclick="backPortfolioDoneList()"><i class="ti ti-arrow-left"></i> Saved beats</button>`
    : '';
  panel.hidden = false;
  panel.innerHTML = backBtn + previewHTML;
  applyCratePreviewAudio(beat || null);
}

function selectPortfolioDoneBeat(id) {
  if (isPortfolioDoneMobileFlow()) {
    if (_portfolioDonePreviewOpen && _portfolioDoneSelectedId === id) return;
    _portfolioDoneSelectedId = id;
    _portfolioDonePreviewOpen = true;
    syncPortfolioDonePreviewMode();
    renderPortfolioDonePreview();
    return;
  }
  if (_portfolioDoneSelectedId === id) return;
  _portfolioDoneSelectedId = id;
  renderPortfolioDoneList();
  renderPortfolioDonePreview();
}

function backPortfolioDoneList() {
  _portfolioDonePreviewOpen = false;
  _portfolioDoneSelectedId = null;
  if (_audioPanel === 'crate') stopTrack();
  _previewLoadedId = null;
  syncPortfolioDonePreviewMode();
  renderPortfolioDoneList();
  renderPortfolioDonePreview();
}

function initPortfolioDoneView() {
  const saved = getPortfolioSavedBeats();
  if (!saved.length) return;
  const mobile = isPortfolioDoneMobileFlow();
  _portfolioDonePreviewOpen = false;
  _portfolioDoneSelectedId = mobile ? null : saved[0].id;
  syncPortfolioDonePreviewMode();
  renderPortfolioDoneList();
  renderPortfolioDonePreview();
}

function portfolioDoneProducerCtaHTML() {
  return `<div class="portfolio-done-producer">
    <p class="portfolio-done-producer-title">Want your own swipe page?</p>
    <p class="portfolio-done-producer-sub">Free for producers — one link in your bio.</p>
    <button type="button" class="portfolio-done-producer-btn" onclick="openProducerSignup()">
      <i class="ti ti-link"></i> Get your page free
    </button>
  </div>`;
}

function buildPortfolioDoneHTML() {
  _portfolioDoneSelectedId = null;
  if (_portfolioPreview) {
    const skipped = _portfolioSkipped.length;
    const replayBtn = skipped > 0 ? `
      <button type="button" class="portfolio-replay-btn" onclick="replayPortfolioSkipped()">
        <i class="ti ti-refresh"></i>Replay ${skipped} skipped beat${skipped === 1 ? '' : 's'}
      </button>` : '';
    return `<div class="portfolio-surface"><div class="portfolio-done portfolio-done--simple">
      <div class="portfolio-done-head"><i class="ti ti-check"></i>Preview complete</div>
      <div class="portfolio-done-sub">This is what fans see from your bio link. Saves here are not stored.</div>
      ${replayBtn ? `<div class="portfolio-done-foot">${replayBtn}</div>` : ''}
    </div></div>`;
  }
  const saved = getPortfolioSavedBeats();
  const skipped = _portfolioSkipped.length;
  const replayBtn = skipped > 0 ? `
    <button type="button" class="portfolio-replay-btn" onclick="replayPortfolioSkipped()">
      <i class="ti ti-refresh"></i>Replay ${skipped} skipped beat${skipped === 1 ? '' : 's'}
    </button>` : '';
  const guestHint = !currentUser && saved.length
    ? `<p class="portfolio-done-guest">Your saves stay on this device — bookmark this page to listen again.</p>`
    : '';
  const producerCta = portfolioDoneProducerCtaHTML();
  const doneFoot = (guestHint || replayBtn)
    ? `<div class="portfolio-done-foot">${guestHint}${replayBtn}</div>`
    : '';

  if (saved.length) {
    return `<div class="portfolio-done portfolio-done--results">
      <div class="portfolio-done-head"><i class="ti ti-flame"></i>You saved ${saved.length} beat${saved.length === 1 ? '' : 's'}</div>
      <div class="portfolio-done-sub">Tap a beat to preview · license from ${_portfolioProducer ? escHtml(_portfolioProducer) : 'the producer'}.</div>
      <div class="portfolio-done-layout">
        <div class="portfolio-done-main">
          <div class="portfolio-done-list-panel">
            <div class="portfolio-done-list" id="portfolioDoneList"></div>
          </div>
          ${doneFoot}
        </div>
        <div class="portfolio-done-side">
          <aside class="portfolio-done-preview-panel" id="portfolioDonePreviewPanel" aria-label="Beat preview"></aside>
          ${producerCta}
        </div>
      </div>
    </div>`;
  }

  return `<div class="portfolio-surface"><div class="portfolio-done portfolio-done--simple">
    <div class="portfolio-done-head"><i class="ti ti-check"></i>All caught up</div>
    <div class="portfolio-done-sub">You swiped through every beat from ${_portfolioProducer ? escHtml(_portfolioProducer) : 'this producer'}.</div>
    <div class="portfolio-done-foot">${replayBtn}${producerCta}</div>
  </div></div>`;
}

function setPortfolioDoneMode(on) {
  document.getElementById('portfolioPageInner')?.classList.toggle('page-inner--swipe-done', !!on);
  document.body.classList.toggle('portfolio-swipe-done', !!on);
  if (!on) {
    _portfolioDonePreviewOpen = false;
    _portfolioDoneSelectedId = null;
    document.body.classList.remove('portfolio-done-preview-open');
  }
  const keepSidePanel = on && _portfolioPreview && portfolioDesktopLayout();
  if (on && !keepSidePanel) {
    const sidePanel = document.getElementById('portfolioSidePanel');
    if (sidePanel) {
      sidePanel.hidden = true;
      sidePanel.innerHTML = '';
    }
  } else if (_portfolioProducer) {
    renderPortfolioSidePanel(_portfolioProducer, _portfolioProfile);
  }
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
  flyEl.style.visibility = 'hidden';
  void clone.offsetWidth;

  const flyClass = dir === 'left' ? 'fly-left' : 'fly-right';
  requestAnimationFrame(() => {
    clone.classList.add(flyClass);
    setTimeout(onReplaced, 48);
  });

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clone.style.willChange = '';
    clone.remove();
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
  const buyLink = resolveBeatBuyLink(d);
  const buyUrl = buyLink || ((useYT || useSC) ? d.mp3 : '');
  const buyTrack = buyLink ? ` data-portfolio-buy="1" data-beat-id="${escHtml(String(d.id))}"` : '';
  const playerHTML = useYT ? `
    <div class="yt-wrap">
      <iframe id="ytFrame" data-src="${embedSrc}" src="about:blank" tabindex="-1"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe>
      <div class="yt-overlay" id="ytOverlay" onclick="startVideo()">
        <div class="yt-play-icon"><i class="ti ti-player-play"></i></div>
      </div>
    </div>
    <div class="yt-footer">
      <span class="yt-hint"><i class="ti ti-brand-youtube" style="font-size:13px;color:#FF0000;vertical-align:middle;margin-right:3px"></i>Tap to preview</span>
      ${buyUrl ? `<a href="${buyUrl}" target="_blank" rel="noopener" class="yt-link"${buyTrack}>Buy <i class="ti ti-external-link" style="font-size:11px"></i></a>` : ''}
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
      ${buyUrl ? `<a href="${buyUrl}" target="_blank" rel="noopener" class="yt-link"${buyTrack}>Buy <i class="ti ti-external-link" style="font-size:11px"></i></a>` : ''}
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
        ${buyUrl ? `<a href="${buyUrl}" target="_blank" rel="noopener" class="buy-link"${buyTrack}><i class="ti ti-shopping-cart" style="font-size:15px"></i>Buy</a>` : ''}
      </div>
    </div>`;
  const producerLine = hideProducer ? '' : `<div class="track-by" style="cursor:pointer;color:var(--accent-mid)" onclick="openProducerProfile('${d.producer.replace(/'/g,"\\'")}')">by ${d.producer} <i class="ti ti-arrow-right" style="font-size:10px"></i></div>`;
  const cardInner = `
      <div class="card-head">
        <span class="swipe-label swipe-label-skip" id="labelSkip">SKIP</span>
        <span class="swipe-label swipe-label-save" id="labelSave">SAVE</span>
        <div class="cover-box">
          <i class="ti ti-${d.type==='Drums'?'circle':'music'}"></i>
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
  document.body.classList.remove('discover-active', 'crate-active', 'mypage-active', 'profile-active', 'site-scroll');
  document.body.classList.add('portfolio-active');
  const header = document.getElementById('portfolioHeader');
  if (header) header.innerHTML = portfolioHeaderSkeletonHTML(slugToDisplayName(slug));
  const slot = document.getElementById('portfolioCardSlot');
  if (slot) slot.innerHTML = portfolioCardSkeletonHTML();
  setPortfolioGlow('#7C3AED');
}

function portfolioDesktopLayout() {
  return typeof isDesktop === 'function' && isDesktop() && window.matchMedia('(min-width: 1100px)').matches;
}

function getPortfolioSessionSavedCount() {
  if (!_portfolioBeats.length) return 0;
  const ids = new Set(_portfolioBeats.map(b => b.id));
  return crate.filter(b => ids.has(b.id)).length;
}

function updatePortfolioLeftRail() {
  if (!_portfolioMode || !portfolioDesktopLayout()) return;
  const skippedEl = document.getElementById('plrSkipped');
  const savedEl = document.getElementById('plrSaved');
  const progressEl = document.getElementById('plrProgress');
  if (skippedEl) skippedEl.textContent = String(_portfolioSkipped.length);
  if (savedEl) savedEl.textContent = String(getPortfolioSessionSavedCount());
  if (progressEl) {
    const list = getPortfolioList();
    const total = _portfolioBeats.length;
    if (!total) progressEl.textContent = '—';
    else if (!list.length) progressEl.textContent = 'Done';
    else progressEl.textContent = `${total - list.length} / ${total} beats`;
  }
}

function clearPortfolioDesktopPanels() {
  const panel = document.getElementById('portfolioSidePanel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
}

function renderPortfolioSidePanel(producerName, profile) {
  const panel = document.getElementById('portfolioSidePanel');
  if (!panel) return;
  const previewDone = _portfolioPreview && document.body.classList.contains('portfolio-swipe-done');
  if (document.body.classList.contains('portfolio-swipe-done') && !previewDone) return;
  if (!_portfolioMode || !portfolioDesktopLayout() || !producerName) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const p = profile || _portfolioProfile || {};
  const hex = (_portfolioBeats[0]?.color && String(_portfolioBeats[0].color).startsWith('#'))
    ? _portfolioBeats[0].color : '#7C3AED';
  const avatarEl = p.avatar_url
    ? `<img src="${escHtml(p.avatar_url)}" class="portfolio-side-avatar" alt="">`
    : `<div class="portfolio-side-avatar-fallback" style="background:${hex}20;border-color:${hex}80;color:${hex}">${escHtml(portfolioInitials(producerName))}</div>`;
  const bio = p.bio ? escHtml(p.bio) : 'Independent producer';
  const socials = buildPortfolioSocialsHTML(p);
  const beatstarsHref = buildSocialHref('beatstars', p.beatstars);
  const storeBtn = beatstarsHref
    ? `<a href="${escHtml(beatstarsHref)}" target="_blank" rel="noopener" class="portfolio-side-store"><i class="ti ti-shopping-bag"></i> Shop beats</a>`
    : '';
  panel.hidden = false;
  panel.innerHTML = `
    <div class="portfolio-side-card">
      <div class="portfolio-side-head">
        ${avatarEl}
        <div class="portfolio-side-name">${escHtml(producerName)}</div>
      </div>
      <p class="portfolio-side-bio">${bio}</p>
      ${socials}
      ${storeBtn}
      <div class="portfolio-side-divider" aria-hidden="true"></div>
      <p class="portfolio-side-brand">Powered by <strong>BeatSwipe</strong></p>
      <button type="button" class="portfolio-side-cta" onclick="openProducerSignup()">Get your own page</button>
    </div>`;
}

function updatePortfolioProgress() {
  const list = getPortfolioList();
  const total = _portfolioBeats.length;
  const counter = document.getElementById('portfolioCounter');
  const fill = document.getElementById('portfolioProgressFill');
  if (!total) {
    if (counter) counter.textContent = '…';
    if (fill) fill.style.width = '0%';
    updatePortfolioLeftRail();
    return;
  }
  if (!list.length) {
    if (counter) counter.textContent = 'Done';
    if (fill) fill.style.width = '100%';
    updatePortfolioLeftRail();
    return;
  }
  const current = total - list.length + 1;
  const done = total - list.length;
  if (counter) counter.textContent = current + ' / ' + total;
  if (fill) fill.style.width = Math.min(100, (done / total) * 100) + '%';
  updatePortfolioLeftRail();
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
  renderPortfolioSidePanel(producerName, profile);
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
      requestAnimationFrame(() => initPortfolioDoneView());
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
      tryAutoplayFromGesture();
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
  maybeAutoplayPreview(useYT, useSC);
  if (_audioUnlocked) tryAutoplayFromGesture();
  if (isDesktop()) requestAnimationFrame(() => refocusSwipeShortcuts());
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
  _portfolioDoneSelectedId = null;
  stopTrack();
  setPortfolioDoneMode(false);
  renderPortfolioCard();
}

function showPortfolioNotFound(slug) {
  _portfolioMode = true;
  document.documentElement.classList.remove('portfolio-route-boot');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('portfolioScreen')?.classList.add('active');
  document.body.classList.add('portfolio-active');
  document.body.classList.remove('discover-active', 'crate-active', 'mypage-active', 'profile-active', 'site-scroll');
  const header = document.getElementById('portfolioHeader');
  if (header) header.innerHTML = `<div class="portfolio-name" style="flex:1">Producer not found</div>`;
  const slot = document.getElementById('portfolioCardSlot');
  if (slot) slot.innerHTML = `<div class="empty-card"><i class="ti ti-user-off"></i>No producer "<span style="color:var(--text)">${escHtml(slug)}</span>" yet.<br><span style="font-size:12px;color:var(--text-3)"><a onclick="openProducerSignup()" style="color:var(--accent-mid);cursor:pointer">Get your own page</a> — add beats on My Page to go live.</span></div>`;
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
  document.body.classList.remove('discover-active', 'crate-active', 'mypage-active', 'profile-active', 'site-scroll');
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
  if (!opts.preview && opts.fromRoute) trackPortfolioView(producerName);
}

function trackPortfolioView(producerName) {
  const slug = portfolioSlugFromName(producerName);
  try {
    if (sessionStorage.getItem('bs_pv_' + slug)) return;
    sessionStorage.setItem('bs_pv_' + slug, '1');
  } catch (_) {}
  trackPortfolioEvent(producerName, 'view');
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
  clearPortfolioDesktopPanels();
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
    clearPortfolioDesktopPanels();
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

let _qrScriptPromise = null;
function loadQRCodeScript() {
  if (window.QRCode) return Promise.resolve();
  if (_qrScriptPromise) return _qrScriptPromise;
  _qrScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js';
    s.async = true;
    s.onload = () => {
      if (window.QRCode?.toCanvas) resolve();
      else { _qrScriptPromise = null; reject(new Error('QR library unavailable')); }
    };
    s.onerror = () => { _qrScriptPromise = null; reject(new Error('QR library failed to load')); };
    document.head.appendChild(s);
  });
  return _qrScriptPromise;
}

function getProducerPortfolioUrl() {
  const name = _userProfile?.producer_name?.trim();
  if (!name) return '';
  return 'https://beatswipe.app/p/' + portfolioSlugFromName(name);
}

async function openPortfolioQR() {
  const url = typeof getMyPageUrl === 'function' ? getMyPageUrl() : getProducerPortfolioUrl();
  if (!url) {
    showToast('Set your producer name in Profile first.', 'error');
    return;
  }
  const modal = document.getElementById('portfolioQrModal');
  const canvas = document.getElementById('portfolioQrCanvas');
  const urlEl = document.getElementById('portfolioQrUrl');
  if (!modal || !canvas) return;
  if (urlEl) urlEl.textContent = url.replace('https://', '');
  modal.classList.add('open');
  document.body.classList.add('modal-open');
  try {
    await loadQRCodeScript();
    const qr = window.QRCode;
    if (!qr?.toCanvas) throw new Error('QR library unavailable');
    await qr.toCanvas(canvas, url, {
      width: 220,
      margin: 2,
      color: { dark: '#ffffff', light: '#050508' }
    });
  } catch (_) {
    showToast('Could not generate QR code.', 'error');
    closePortfolioQR();
  }
}

function closePortfolioQR() {
  const modal = document.getElementById('portfolioQrModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}

function closePortfolioQrIfBackdrop(e) {
  if (e.target?.id === 'portfolioQrModal') closePortfolioQR();
}

async function downloadPortfolioQR() {
  const canvas = document.getElementById('portfolioQrCanvas');
  if (!canvas) return;
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('export failed');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = portfolioSlugFromName(_userProfile?.producer_name || 'beatswipe');
    a.href = url;
    a.download = `beatswipe-${slug}-qr.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('QR code saved!', 'success');
  } catch (_) {
    showToast('Could not save QR code.', 'error');
  }
}

function initPortfolioBuyTracking() {
  const screen = document.getElementById('portfolioScreen');
  if (!screen || screen._buyTrackBound) return;
  screen._buyTrackBound = true;
  screen.addEventListener('click', e => {
    if (!_portfolioMode || _portfolioPreview || !_portfolioProducer) return;
    const el = e.target.closest('[data-portfolio-buy]');
    if (!el) return;
    trackPortfolioEvent(_portfolioProducer, 'buy_click', el.dataset.beatId || null);
  }, true);
}
initPortfolioBuyTracking();

let _portfolioLayoutTimer;
window.addEventListener('resize', () => {
  if (!_portfolioMode) return;
  clearTimeout(_portfolioLayoutTimer);
  _portfolioLayoutTimer = setTimeout(() => {
    if (_portfolioProducer) {
      if (document.body.classList.contains('portfolio-swipe-done')) {
        if (_portfolioPreview) renderPortfolioSidePanel(_portfolioProducer, _portfolioProfile);
        renderPortfolioDonePreview();
      } else {
        renderPortfolioSidePanel(_portfolioProducer, _portfolioProfile);
      }
      updatePortfolioLeftRail();
    }
  }, 120);
});
