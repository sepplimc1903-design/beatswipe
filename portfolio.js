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
  description: 'Your bio link. Their next beat. Free swipe portfolio for producers — fans swipe, save favorites, and buy from your store.',
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
  const scEmbedSrc = useSC ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(d.mp3)}&color=%230A84FF&auto_play=${_audioUnlocked ? 'true' : 'false'}&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false` : '';
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
      `${SUPA_URL}/rest/v1/profiles?producer_name=eq.${encodeURIComponent(producerName)}&select=id,producer_name,bio,avatar_url,instagram,tiktok,spotify,airbit,soundcloud,beatstars,youtube,beat_order&limit=1`,
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
  if (platform === 'tiktok') {
    if (v.includes('tiktok.com')) return v.startsWith('http') ? v : 'https://' + v.replace(/^https?:\/\//, '');
    return 'https://www.tiktok.com/@' + encodeURIComponent(v.replace(/^@/, ''));
  }
  if (platform === 'spotify') {
    if (v.includes('spotify.com') || v.includes('open.spotify.com')) {
      return v.startsWith('http') ? v : 'https://' + v.replace(/^https?:\/\//, '');
    }
    return null;
  }
  if (platform === 'airbit') {
    if (v.includes('airbit.com')) return v.startsWith('http') ? v : 'https://' + v.replace(/^https?:\/\//, '');
    return 'https://www.airbit.com/' + v.replace(/^@/, '');
  }
  return null;
}

let _portfolioSocialIconSeq = 0;

function portfolioSocialIconHTML(platform) {
  const uid = ++_portfolioSocialIconSeq;
  switch (platform) {
    case 'instagram':
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="pfIgGrad${uid}" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FFDC80"/><stop offset="25%" stop-color="#F77737"/><stop offset="50%" stop-color="#E1306C"/><stop offset="75%" stop-color="#C13584"/><stop offset="100%" stop-color="#833AB4"/></linearGradient></defs><path fill="url(#pfIgGrad${uid})" d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>`;
    case 'tiktok':
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#25F4EE" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/><path fill="#FE2C55" d="M19.59 5.19a4.83 4.83 0 0 1-3.77-4.25V.5h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V7.9a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 18.6a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52V5.6a4.85 4.85 0 0 1-1-.1z"/><path fill="#FFFFFF" d="M19.59 6.19a4.83 4.83 0 0 1-3.77-4.25V1.5h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V8.9a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 19.6a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>`;
    case 'spotify':
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.13-10.54-1.1-.402.12-.779-.179-.899-.581-.12-.421.18-.78.58-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.021zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;
    case 'beatstars':
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="m17.217 11.996-3.308 1.079v3.478l-2.052-2.818-3.309 1.079 2.043-2.818-2.043-2.819 3.31 1.08 2.05-2.819v3.487zm0 0v7.277H6.854V4.584h10.363v7.412l4.585-1.49v-7.67L19.135 0H2.198v24h16.92l2.684-2.685v-7.83z"/></svg>`;
    case 'airbit':
      return `<svg viewBox="0 0 506.36 680.25" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M-714.09,311V461.92a24.73,24.73,0,0,1-24.73,24.73h-33.59a24.73,24.73,0,0,1-24.73-24.73V335.73A24.73,24.73,0,0,1-772.41,311h58.32Z" transform="translate(1220.45 -28.37)"/><path fill="currentColor" d="M-1220.45,311V461.92a24.73,24.73,0,0,0,24.73,24.73h33.59a24.73,24.73,0,0,0,24.73-24.73V335.73A24.73,24.73,0,0,0-1162.13,311h-58.32Z" transform="translate(1220.45 -28.37)"/><path fill="currentColor" d="M-967.27,28.37c-139.83,0-253.18,113.35-253.18,253.18h43a208.8,208.8,0,0,1,61.56-148.62A208.79,208.79,0,0,1-967.27,71.37a208.8,208.8,0,0,1,148.62,61.56,208.8,208.8,0,0,1,61.56,148.62h43C-714.09,141.72-827.44,28.37-967.27,28.37Z" transform="translate(1220.45 -28.37)"/><rect fill="currentColor" x="463.36" y="253.18" width="43" height="177.57"/><rect fill="currentColor" y="253.18" width="43" height="177.57"/><rect fill="currentColor" x="144.23" y="285.79" width="43" height="145.13"/><rect fill="currentColor" x="144.23" y="470.61" width="43" height="109.33"/><rect fill="currentColor" x="231.68" y="356.49" width="43" height="122.81"/><rect fill="currentColor" x="231.68" y="518.84" width="43" height="60.96"/><rect fill="currentColor" x="231.68" y="619.46" width="43" height="60.79"/><rect fill="currentColor" x="319.13" y="285.79" width="43" height="86.82"/><rect fill="currentColor" x="319.13" y="412.31" width="43" height="94.26"/><rect fill="currentColor" x="319.13" y="546.26" width="43" height="61.52"/></svg>`;
    case 'soundcloud':
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/></svg>`;
    case 'youtube':
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
    default:
      return '';
  }
}

function buildPortfolioSocialsHTML(profile) {
  const links = (typeof SOCIAL_PLATFORMS !== 'undefined' ? SOCIAL_PLATFORMS : [
    { key: 'instagram', label: 'Instagram' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'spotify', label: 'Spotify' },
    { key: 'beatstars', label: 'BeatStars' },
    { key: 'airbit', label: 'Airbit' },
    { key: 'soundcloud', label: 'SoundCloud' },
    { key: 'youtube', label: 'YouTube' },
  ]);
  const items = links.map(l => {
    const href = buildSocialHref(l.key, profile[l.key]);
    if (!href) return '';
    return `<a class="portfolio-social-link" data-platform="${l.key}" href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escHtml(l.label)}">${portfolioSocialIconHTML(l.key)}</a>`;
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
  setPortfolioGlow('#0A84FF');
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
  const avatarEl = p.avatar_url
    ? `<img src="${escHtml(p.avatar_url)}" class="portfolio-side-avatar" alt="">`
    : `<div class="portfolio-side-avatar-fallback">${escHtml(portfolioInitials(producerName))}</div>`;
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
  const avatarEl = profile.avatar_url
    ? `<img src="${escHtml(profile.avatar_url)}" class="portfolio-avatar" alt="${escHtml(producerName)}">`
    : `<div class="portfolio-avatar-fallback">${escHtml(portfolioInitials(producerName))}</div>`;
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
  const hex = (color && String(color).startsWith('#')) ? color : '#0A84FF';
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
    setPortfolioGlow(_portfolioBeats[0]?.color || '#0A84FF');
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
      color: { dark: '#ffffff', light: '#000000' }
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
