/* BeatSwipe app core — discover, auth, favorites, profile, nav, swipe */
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let _toastHideTimer = null;
function showToast(message, type = 'info', duration = 2800) {
  const wrap = document.getElementById('bsToastWrap');
  if (!wrap || !message) return;
  if (_toastHideTimer) { clearTimeout(_toastHideTimer); _toastHideTimer = null; }
  const icons = { success: 'ti-check', error: 'ti-alert-circle', info: 'ti-info-circle' };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  wrap.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'bs-toast ' + (type || 'info');
  const icon = document.createElement('i');
  icon.className = 'ti ' + (icons[type] || icons.info);
  const span = document.createElement('span');
  span.textContent = message;
  el.appendChild(icon);
  el.appendChild(span);
  wrap.appendChild(el);
  _toastHideTimer = setTimeout(() => {
    if (reduced) { el.remove(); return; }
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  }, duration);
}

function positionNavIndicator(indicator, container, tab, opts) {
  if (!indicator || !container || !tab) return;
  opts = opts || {};
  const padX = opts.padX ?? 6;
  const pillH = opts.pillH ?? 36;
  const barRect = container.getBoundingClientRect();
  const tabRect = tab.getBoundingClientRect();
  const w = Math.max(0, tabRect.width - padX * 2);
  const x = tabRect.left - barRect.left + padX;
  const y = opts.centerInNav
    ? (barRect.height - pillH) / 2
    : tabRect.top - barRect.top + (tabRect.height - pillH) / 2;
  indicator.style.width = w + 'px';
  indicator.style.transform = `translate(${x}px, ${y}px)`;
  indicator.classList.add('visible');
}

function positionCatIndicator() {
  const segment = document.getElementById('catSegment');
  const indicator = document.getElementById('catSegmentIndicator');
  const active = document.querySelector('#catRow .cat-pill.active');
  if (!segment || !indicator || !active || segment.offsetParent === null) return;
  const inset = 3;
  const segRect = segment.getBoundingClientRect();
  const tabRect = active.getBoundingClientRect();
  indicator.style.width = tabRect.width + 'px';
  indicator.style.height = (segRect.height - inset * 2) + 'px';
  indicator.style.transform = `translate(${tabRect.left - segRect.left}px, ${inset}px)`;
  indicator.classList.add('visible');
}

function setActiveCat(catKey) {
  document.querySelectorAll('#catRow .cat-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === catKey);
  });
  cat = catKey;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => positionCatIndicator());
  });
}

function updateNavIndicator(navId) {
  if (!navId) return;
  const dtbId = navId.replace(/^nav/, 'dtb');
  const mobileTab = document.getElementById(navId);
  const mobileBar = document.querySelector('.nav-bar');
  const mobileInd = document.getElementById('navIndicator');
  if (mobileTab && mobileBar && mobileInd && mobileBar.offsetParent !== null) {
    positionNavIndicator(mobileInd, mobileBar, mobileTab, { padX: 10, pillH: 52 });
  }
  const dtbTab = document.getElementById(dtbId);
  const dtbNav = document.querySelector('.dtb-nav');
  const dtbInd = document.getElementById('dtbNavIndicator');
  if (dtbTab && dtbNav && dtbInd && dtbNav.offsetParent !== null) {
    positionNavIndicator(dtbInd, dtbNav, dtbTab, { padX: 8, pillH: 36, centerInNav: true });
  }
}

function setActiveNav(navId) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dtb-tab').forEach(t => t.classList.remove('active'));
  if (!navId) return;
  document.getElementById(navId)?.classList.add('active');
  const dtbId = navId.replace(/^nav/, 'dtb');
  document.getElementById(dtbId)?.classList.add('active');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => updateNavIndicator(navId));
  });
}

let _navIndicatorResizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_navIndicatorResizeTimer);
  _navIndicatorResizeTimer = setTimeout(() => {
    const active = document.querySelector('.nav-tab.active');
    if (active?.id) updateNavIndicator(active.id);
    if (document.getElementById('discoverScreen')?.classList.contains('active')) positionCatIndicator();
  }, 120);
});

function updateDesktopTopbarAuth() {
  const el = document.getElementById('dtbAuth');
  if (!el) return;
  if (currentUser) {
    const p = _userProfile || {};
    const displayName = p.producer_name || currentUser.email.split('@')[0];
    const title = escHtml(displayName);
    if (p.avatar_url) {
      el.innerHTML = `<button type="button" class="dtb-user-btn" onclick="goTo('profileScreen','navProfile')" title="${title}"><img src="${p.avatar_url}" alt=""></button>`;
    } else {
      const initial = displayName[0].toUpperCase();
      el.innerHTML = `<button type="button" class="dtb-user-btn" onclick="goTo('profileScreen','navProfile')" title="${title}"><span class="dtb-initial">${initial}</span></button>`;
    }
  } else {
    el.innerHTML = `<button type="button" class="dtb-signin" onclick="goTo('profileScreen','navProfile')">Sign in</button>`;
  }
}

// ─── INVITE GATE (private beta) ───────────────────────────────────────────
const INVITE_CODES = ['BEATSWIPE25', 'beatswipe'];
const INVITE_PROTECTED = new Set([
  'discoverScreen', 'crateScreen', 'submitScreen',
  'profileScreen'
]);
let _invitePending = null;
let _invitePendingProducer = null;

function hasInviteAccess() {
  try { return localStorage.getItem('bs_invite') === '1'; } catch(e) { return false; }
}

function showInviteGate(screenId, navId, producerName) {
  _invitePending = { screenId, navId };
  _invitePendingProducer = producerName || null;
  const gate = document.getElementById('inviteGate');
  const err = document.getElementById('inviteCodeErr');
  const input = document.getElementById('inviteCodeInput');
  if (err) err.classList.remove('visible');
  if (input) { input.value = ''; }
  gate?.classList.add('open');
  setTimeout(() => input?.focus(), 120);
}

function closeInviteGate() {
  document.getElementById('inviteGate')?.classList.remove('open');
  _invitePending = null;
  _invitePendingProducer = null;
  goTo('landScreen', 'navHome');
}

function closeInviteIfBackdrop(e) {
  if (e.target === document.getElementById('inviteGate')) closeInviteGate();
}

function submitInviteCode() {
  const input = document.getElementById('inviteCodeInput');
  const err = document.getElementById('inviteCodeErr');
  const code = (input?.value || '').trim().toLowerCase();
  const valid = INVITE_CODES.some(c => c.toLowerCase() === code);
  if (!valid) {
    err?.classList.add('visible');
    return;
  }
  try { localStorage.setItem('bs_invite', '1'); } catch(e) {}
  const pending = _invitePending;
  const producer = _invitePendingProducer;
  document.getElementById('inviteGate')?.classList.remove('open');
  _invitePending = null;
  _invitePendingProducer = null;
  if (producer) openProducerProfile(producer);
  else if (pending) goTo(pending.screenId, pending.navId);
}

let _listEnterNext = false;

function takeListEnter() {
  if (!_listEnterNext) return false;
  _listEnterNext = false;
  return true;
}
window.takeListEnter = takeListEnter;

function playScreenEnterAnim(screenEl) {
  if (!screenEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  screenEl.classList.add('screen-entering');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => screenEl.classList.remove('screen-entering'));
  });
}

function applyGoTo(screenId, navId) {
  resetSwipeGestureState();
  const next = document.getElementById(screenId);
  if (!next) return;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'screen-fade-out', 'screen-entering'));
  next.classList.add('active');
  playScreenEnterAnim(next);
  document.body.classList.toggle('discover-active', screenId === 'discoverScreen');
  document.body.classList.toggle('crate-active', screenId === 'crateScreen');
  document.body.classList.toggle('mypage-active', screenId === 'submitScreen');
  document.body.classList.toggle('profile-active', screenId === 'profileScreen');
  document.body.classList.toggle('portfolio-active', screenId === 'portfolioScreen');
  document.body.classList.toggle('site-scroll', isDesktop() && screenId !== 'discoverScreen');
  if (isDesktop() && screenId !== 'discoverScreen' && screenId !== 'portfolioScreen') {
    window.scrollTo(0, 0);
  }
  setActiveNav(navId);
  if (screenId !== 'discoverScreen') hideDiscoverSyncHint();
  if (screenId === 'discoverScreen') {
    renderDiscoverHint();
    renderCard();
    renderDesktopCrate();
    updateDiscoverLeftRail();
    maybeShowSyncOnDiscoverReturn();
    positionCatIndicator();
  }
  if (screenId === 'crateScreen' || screenId === 'submitScreen') _listEnterNext = true;
  if (screenId === 'crateScreen') renderCrate();
  if (screenId === 'profileScreen') renderProfile();
  if (screenId === 'submitScreen') void renderMyPage();
  if (screenId === 'landScreen') {
    initScrollReveal();
    initHeroDemoCard();
  } else {
    stopHeroDemoCard();
  }
}

function goTo(screenId, navId) {
  const currentScreen = document.querySelector('.screen.active');
  if (currentScreen?.id === 'profileScreen' && screenId !== 'profileScreen' && !confirmDiscardProfileChanges()) return;
  if (INVITE_PROTECTED.has(screenId) && !hasInviteAccess()) {
    showInviteGate(screenId, navId);
    return;
  }
  if (_portfolioMode && screenId !== 'portfolioScreen') {
    exitPortfolioMode();
    try { history.replaceState(null, '', '/'); } catch(e) {}
  }
  stopTrack();
  const next = document.getElementById(screenId);
  const current = document.querySelector('.screen.active');
  if (!next) return;
  if (current === next) { setActiveNav(navId); return; }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (current && !reducedMotion) {
    setActiveNav(navId);
    if (isDesktop()) document.body.classList.add('nav-switching');
    current.classList.add('screen-fade-out');
    setTimeout(() => {
      applyGoTo(screenId, navId);
      if (isDesktop()) {
        setTimeout(() => document.body.classList.remove('nav-switching'), 260);
      }
    }, 100);
    return;
  }
  applyGoTo(screenId, navId);
}

function initScrollReveal() {
  const els = document.querySelectorAll('#landScreen .reveal-on-scroll');
  if (!els.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach(el => el.classList.add('is-visible'));
    return;
  }
  if (window._scrollRevealObs) window._scrollRevealObs.disconnect();
  window._scrollRevealObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        window._scrollRevealObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  const vh = window.innerHeight || document.documentElement.clientHeight;
  els.forEach(el => {
    el.classList.remove('is-visible');
    const r = el.getBoundingClientRect();
    if (r.top < vh && r.bottom > 0) {
      el.classList.add('is-visible');
      return;
    }
    window._scrollRevealObs.observe(el);
  });
}

function syncDesktopScrollMode() {
  if (!isDesktop() || _portfolioMode) return;
  const activeScreen = document.querySelector('.screen.active')?.id;
  document.body.classList.toggle('site-scroll', activeScreen !== 'discoverScreen');
}

function bootLandingReveal() {
  if (getPortfolioSlugFromURL()) return;
  if (!document.getElementById('landScreen')?.classList.contains('active')) return;
  syncDesktopScrollMode();
  initScrollReveal();
  initHeroDemoCard();
}

let _heroWaveTimer = null;
function initHeroDemoCard() {
  stopHeroDemoCard();
  const wf = document.getElementById('heroWaveform');
  const card = document.getElementById('heroBeatCard');
  const glow = document.getElementById('heroCardGlow');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (card) card.classList.add('hero-demo-live');
  if (glow) glow.classList.add('hero-glow-live');
  if (wf) {
    _heroWaveTimer = setInterval(() => {
      if (!document.getElementById('landScreen')?.classList.contains('active')) return;
      wf.querySelectorAll('.wbar').forEach(b => {
        b.style.height = Math.round(Math.random() * 14 + 3) + 'px';
      });
    }, 600);
  }
}
function stopHeroDemoCard() {
  if (_heroWaveTimer) {
    clearInterval(_heroWaveTimer);
    _heroWaveTimer = null;
  }
  document.getElementById('heroBeatCard')?.classList.remove('hero-demo-live');
  document.getElementById('heroCardGlow')?.classList.remove('hero-glow-live');
}

function isDesktop() {
  return window.matchMedia('(min-width: 900px)').matches;
}

function isMobileUI() {
  return window.matchMedia('(max-width: 899px)').matches;
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────
let _onboardStep = 0;
const ONBOARD_STEPS = 4;

function initOnboard() {
  if (localStorage.getItem('bs_onboarded')) return;
  if (_portfolioMode) return;
  setTimeout(() => {
    document.getElementById('onboardBackdrop').classList.add('open');
  }, 500);
}

function onboardNext() {
  _onboardStep++;
  if (_onboardStep >= ONBOARD_STEPS) { closeOnboard(); return; }
  document.getElementById('onboardSlides').style.transform = 'translateX(-' + (_onboardStep * 100) + '%)';
  document.querySelectorAll('.onboard-dot').forEach((d,i) => d.classList.toggle('active', i === _onboardStep));
  const btn = document.getElementById('onboardBtn');
  btn.innerHTML = (_onboardStep === ONBOARD_STEPS - 1)
    ? '<i class="ti ti-check"></i> Let\'s go!'
    : '<i class="ti ti-arrow-right"></i> Next';
}

function closeOnboard() {
  document.getElementById('onboardBackdrop').classList.remove('open');
  localStorage.setItem('bs_onboarded', '1');
  // Show cookie banner after onboarding
  if (!localStorage.getItem('bs_cookie')) {
    setTimeout(() => document.getElementById('cookieBanner').classList.add('open'), 600);
  }
}

function closeOnboardIfBackdrop(e) {
  if (e.target.id === 'onboardBackdrop') closeOnboard();
}

// ─── COOKIE BANNER ────────────────────────────────────────────────────────
function initCookie() {
  if (localStorage.getItem('bs_cookie')) return;
  if (_portfolioMode) return;
  if (localStorage.getItem('bs_onboarded')) {
    setTimeout(() => document.getElementById('cookieBanner').classList.add('open'), 800);
  }
}

function closeCookie(accepted) {
  document.getElementById('cookieBanner').classList.remove('open');
  localStorage.setItem('bs_cookie', accepted ? 'accepted' : 'essential');
}

// ─── NEWSLETTER ───────────────────────────────────────────────────────────
async function subscribeNewsletter() {
  const emailEl = document.getElementById('nlEmail');
  const email = emailEl?.value.trim();
  const btn = document.getElementById('nlBtn');
  const msg = document.getElementById('nlMsg');
  const nlDsgvo = document.getElementById('nlDsgvo');
  if (!email || !email.includes('@')) {
    if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Please enter a valid email address.'; }
    return;
  }
  if (!nlDsgvo?.checked) {
    if (msg) { msg.style.color = '#f87171'; msg.textContent = 'Please accept the Privacy Policy to subscribe.'; }
    return;
  }
  btn.disabled = true; btn.textContent = '...';
  try {
    await fetch('https://hook.eu1.make.com/m3mxvl3hs2o03itd1b6mxpj3jhbcdpax', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Type: 'Newsletter', Email: email, Status: 'New' })
    });
    msg.style.color = '#4caf50'; msg.textContent = '✓ You\'re in!';
    btn.textContent = '✓';
    // Nur leeren wenn nicht eingeloggt (dann war es die Account-Email)
    if (!currentUser) emailEl.value = '';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Subscribe'; }, 4000);
  } catch(e) {
    msg.style.color = '#f87171'; msg.textContent = 'Something went wrong — please try again.';
    btn.disabled = false; btn.textContent = 'Subscribe';
  }
}

// ─── BEAT DATABASE ─────────────────────────────────────────────────────────
// Beats werden live von Airtable geladen (nur Status = Approved)
let db = { full: [], loops: [], drums: [], samples: [] };
let _rawDb = { full: [], loops: [], drums: [], samples: [] }; // unfiltered copy
const BEATS_CACHE_TTL_MS = 45000;
let _beatsCache = null;
let _beatsCacheAt = 0;

function typeTocat(type) {
  if (!type) return 'full';
  const t = type.toLowerCase();
  if (t.includes('drum') || t.includes('kit')) return 'drums';
  if (t.includes('sample')) return 'samples';
  if (t.includes('loop') || t.includes('instrumental')) return 'loops';
  return 'full';
}

function cardSkeletonHTML() {
  return `<div class="card-stage"><div class="card-skeleton">
    <div class="skel-row"><div class="skel-circle"></div><div class="skel-lines"><div class="skel-line skel-line--lg"></div><div class="skel-line skel-line--sm"></div></div></div>
    <div class="skel-tags"><div class="skel-pill"></div><div class="skel-pill"></div><div class="skel-pill"></div></div>
    <div class="skel-player"></div>
  </div></div>`;
}

function applyBeatsList(beats) {
  if (!beats || !beats.length) return false;
  db = { full: [], loops: [], drums: [], samples: [] };
  beats.forEach(b => db[typeTocat(b.type)].push(b));
  _rawDb = JSON.parse(JSON.stringify(db));
  updateStats(true);
  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateBeatsLoadBanner(show) {
  const el = document.getElementById('beatsLoadBanner');
  if (el) el.hidden = !show;
}

async function fetchBeatsFromApi() {
  const res = await fetch('/api/beats');
  if (!res.ok) throw new Error('Beats API ' + res.status);
  const data = await res.json();
  if (!data?.beats) throw new Error('Invalid beats response');
  return data.beats;
}

async function loadBeats(opts) {
  const force = opts && opts.force;
  const silent = opts && opts.silent;
  const wrap = document.getElementById('cardWrap');
  if (wrap && !_portfolioMode && !silent) wrap.innerHTML = cardSkeletonHTML();

  if (!force && _beatsCache && (Date.now() - _beatsCacheAt) < BEATS_CACHE_TTL_MS) {
    applyBeatsList(_beatsCache);
    updateBeatsLoadBanner(false);
    return true;
  }

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const beats = await fetchBeatsFromApi();
      _beatsCache = beats;
      _beatsCacheAt = Date.now();
      updateBeatsLoadBanner(false);
      return applyBeatsList(beats);
    } catch (e) {
      lastErr = e;
      console.warn(`loadBeats attempt ${attempt + 1} failed:`, e);
      if (attempt < 2) await sleep(700 * (attempt + 1));
    }
  }

  if (_beatsCache?.length) {
    applyBeatsList(_beatsCache);
    updateBeatsLoadBanner(false);
    return true;
  }

  updateBeatsLoadBanner(true);
  console.warn('loadBeats failed:', lastErr);
  return false;
}

async function retryLoadBeats() {
  const btn = document.getElementById('beatsLoadRetryBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  const ok = await loadBeats({ force: true });
  if (btn) { btn.disabled = false; btn.textContent = 'Try again'; }
  if (ok) {
    if (document.getElementById('discoverScreen')?.classList.contains('active')) renderCard();
    updateStats();
    showToast('Beats loaded.', 'success');
  } else {
    showToast('Still unable to load beats. Try again shortly.', 'error');
  }
}

function initAuthFromStorage() {
  try {
    const storageKey = `sb-${SUPA_URL.split('//')[1].split('.')[0]}-auth-token`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.user) currentUser = parsed.user;
    }
  } catch(e) {}
}

let _discoverSearch = '';

function getDiscoverSourceList(category) {
  const source = (_rawDb[category] && _rawDb[category].length) ? _rawDb[category] : (db[category] || []);
  const q = _discoverSearch.trim().toLowerCase();
  if (!q) return source;
  return source.filter(b =>
    (b.title || '').toLowerCase().includes(q) ||
    (b.producer || '').toLowerCase().includes(q)
  );
}

function getDiscoverList(category) {
  const crateIds = new Set(crate.map(b => b.id));
  return getDiscoverSourceList(category).filter(b => {
    if (crateIds.has(b.id)) return false;
    if (skippedIds[category].includes(b.id)) return false;
    return true;
  });
}

function resetDiscoverCategory() {
  setActiveCat('full');
}

function resetGuestSwipeState() {
  resetDiscoverCategory();
  Object.keys(skippedIds).forEach(k => { skippedIds[k] = []; });
  Object.keys(catIdx).forEach(k => { catIdx[k] = 0; });
}

const SYNC_HINT_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;
const SYNC_HINT_REMINDER_EVERY = 5;

function isSyncHintInCooldown() {
  const dismissed = parseInt(localStorage.getItem('bs_sync_hint_at') || '0', 10);
  return Date.now() - dismissed < SYNC_HINT_COOLDOWN_MS;
}

function getGuestSaveCount() {
  return parseInt(localStorage.getItem('bs_guest_save_count') || '0', 10);
}

function incrementGuestSaveCount() {
  const n = getGuestSaveCount() + 1;
  localStorage.setItem('bs_guest_save_count', String(n));
  return n;
}

function shouldShowMobileSyncHint(saveCount) {
  if (currentUser || isSyncHintInCooldown()) return false;
  if (saveCount === 1) return true;
  return saveCount > 1 && saveCount % SYNC_HINT_REMINDER_EVERY === 0;
}

function shouldShowSyncOnDiscoverReturn() {
  if (!isMobileUI() || currentUser || crate.length === 0) return false;
  if (isSyncHintInCooldown()) return false;
  if (getGuestSaveCount() < 1) return false;
  return !sessionStorage.getItem('bs_sync_discover_shown');
}

function closeSyncModal() {
  document.getElementById('syncModal')?.classList.remove('open');
}

function closeSyncModalIfBackdrop(e) {
  if (e.target.id === 'syncModal') dismissSyncModal();
}

function dismissSyncModal() {
  closeSyncModal();
  localStorage.setItem('bs_sync_hint_at', String(Date.now()));
}

function syncModalSignIn() {
  closeSyncModal();
  goTo('profileScreen', 'navProfile');
}

function hideDiscoverSyncHint() {
  const el = document.getElementById('discoverSyncHint');
  if (el) { el.hidden = true; }
  closeSyncModal();
}

function dismissDiscoverSyncHint() {
  const el = document.getElementById('discoverSyncHint');
  if (el) el.hidden = true;
}

function openSyncModal() {
  const modal = document.getElementById('syncModal');
  if (!modal || modal.classList.contains('open')) return;
  modal.classList.add('open');
}

function showMobileSyncHint(saveCount) {
  if (!isMobileUI() || currentUser) return;
  if (!shouldShowMobileSyncHint(saveCount)) return;
  const onDiscover = document.getElementById('discoverScreen')?.classList.contains('active');
  if (!onDiscover) return;
  openSyncModal();
}

function maybeShowSyncOnDiscoverReturn() {
  if (!shouldShowSyncOnDiscoverReturn()) return;
  openSyncModal();
  sessionStorage.setItem('bs_sync_discover_shown', '1');
}

function renderDiscoverHint() {
  const el = document.getElementById('discoverSyncHint');
  const onDiscover = document.getElementById('discoverScreen')?.classList.contains('active');
  if (!onDiscover || currentUser) {
    if (el) el.hidden = true;
    closeSyncModal();
    return;
  }
  if (isDesktop()) {
    if (el) el.hidden = false;
    return;
  }
  if (el) el.hidden = true;
}

async function initApp() {
  initAuthFromStorage();
  await Promise.race([_authInitReady, sleep(3000)]);
  if (_authRecoveryFromUrl || _authCodeInUrl || _authHashTokenInUrl) {
    await resolveAuthCallbackFromUrl();
  }
  const portfolioSlug = getPortfolioSlugFromURL();
  if (portfolioSlug && !_portfolioMode) showPortfolioLoadingState(portfolioSlug);
  await loadBeats();
  resetDiscoverCategory();
  if (currentUser) {
    await syncCrateFromDB();
    restoreSkippedState();
    restoreSwipeState();
  } else {
    resetGuestSwipeState();
  }
  restoreGenreFilter();
  if (portfolioSlug) {
    const producerName = findProducerBySlug(portfolioSlug) || await findProducerInProfiles(portfolioSlug);
    if (producerName) await openPortfolio(producerName, { fromRoute: true });
    else showPortfolioNotFound(portfolioSlug);
    return;
  }
  if (document.getElementById('discoverScreen')?.classList.contains('active')) {
    renderDiscoverHint();
    renderCard();
  }
}



// ─── AUDIO STATE ──────────────────────────────────────────────────────────
let cat = 'full', crate = [];
let _pendingGuestCrateMerge = null;
let _crateSyncInFlight = null;
const _cratePendingSaves = new Map();
let _lastSavedBeatId = null;
// Per-category swipe index
const catIdx = { full: 0, loops: 0, drums: 0, samples: 0 };
// Track skipped beat IDs per category (not saved ones)
const skippedIds = { full: [], loops: [], drums: [], samples: [] };
// Proxy: idx always points to current cat's index
Object.defineProperty(window, 'idx', {
  get() { return catIdx[cat]; },
  set(v) { catIdx[cat] = v; }
});
let audio = null;       // current HTMLAudioElement
let vizTimer = null;    // waveform animation interval
let isPlaying = false;
let _audioPanel = 'discover'; // 'discover' | 'crate' | 'portfolio'
let _audioUnlocked = false;
let _swipeDragging = false;
let _swipeCommitted = false;
let _pendingFlyRect = null;
let _pendingFlyTransform = '';
let resetSwipeGestureState = () => {};

function purgeOrphanSwipeNodes() {
  document.querySelectorAll('body > .portfolio-surface, body > .beat-card.swipe-drag-pinned').forEach(el => el.remove());
  document.querySelectorAll('.swipe-drag-spacer').forEach(el => el.remove());
}

function unlockAudio() {
  if (!_audioUnlocked) _audioUnlocked = true;
  tryAutoplayFromGesture();
}

function unlockAudioTouch() {
  _audioUnlocked = true;
  tryAutoplayFromGesture();
}

function isDiscoverScreenActive() {
  return document.getElementById('discoverScreen')?.classList.contains('active');
}

function isPortfolioScreenActive() {
  return _portfolioMode && document.getElementById('portfolioScreen')?.classList.contains('active');
}

function isAutoplayScreenActive() {
  return isDiscoverScreenActive() || isPortfolioScreenActive();
}

function getPlayerScope() {
  if (_portfolioMode || _audioPanel === 'portfolio') {
    if (isPortfolioScreenActive()) return document.getElementById('portfolioCardSlot');
    return null;
  }
  if (_audioPanel === 'crate') return null;
  if (isDiscoverScreenActive()) return document.getElementById('cardWrap');
  return null;
}

function queryPlayerEl(id) {
  const scope = getPlayerScope();
  if (!scope) return null;
  return scope.querySelector('#' + id);
}

document.addEventListener('click', handleAudioGesture, { capture: true });
document.addEventListener('touchstart', unlockAudioTouch, { capture: true, passive: true });

function getActiveBeatMedia() {
  let d = null;
  if (_portfolioMode) {
    if (!isPortfolioScreenActive()) return null;
    const list = getPortfolioList();
    if (list.length) d = list[0];
  } else {
    if (!isDiscoverScreenActive()) return null;
    const list = getDiscoverList(cat);
    if (list.length) d = list[0];
  }
  if (!d) return null;
  return { d, useYT: isYouTube(d.mp3), useSC: isSoundCloud(d.mp3) };
}

function getActiveEmbedIframe() {
  const scope = getPlayerScope();
  if (!scope) return null;
  return scope.querySelector('iframe');
}

function startSoundCloudAutoplay() {
  const iframe = getActiveEmbedIframe();
  if (!iframe || !iframe.src.includes('soundcloud.com')) return;
  if (iframe.src.includes('auto_play=true')) return;
  iframe.src = iframe.src.replace('auto_play=false', 'auto_play=true');
}

function isYtPreviewActive() {
  const overlay = queryPlayerEl('ytOverlay');
  return !!(overlay && overlay.style.pointerEvents === 'none');
}

function playMp3Preview() {
  if (!audio) return;
  const attempt = audio.play();
  if (attempt && attempt.catch) {
    attempt.then(() => setPlayState(true)).catch(() => {
      audio.addEventListener('canplay', () => {
        audio.play().then(() => setPlayState(true)).catch(() => {});
      }, { once: true });
    });
  } else {
    setPlayState(true);
  }
}

function handleAudioGesture() {
  if (!_audioUnlocked) _audioUnlocked = true;
  tryAutoplayFromGesture();
}

function tryAutoplayFromGesture() {
  if (!isAutoplayScreenActive()) return;
  if (_portfolioMode && document.getElementById('portfolioPageInner')?.classList.contains('page-inner--swipe-done')) return;
  const media = getActiveBeatMedia();
  if (!media) return;
  if (media.useYT && isYtPreviewActive()) return;
  if (!media.useYT && !media.useSC && isPlaying) return;
  maybeAutoplayPreview(media.useYT, media.useSC);
}

function autoplayCurrentBeat() {
  tryAutoplayFromGesture();
}

function maybeAutoplayPreview(useYT, useSC) {
  if (!isAutoplayScreenActive()) return;
  if (useYT) {
    startVideo();
  } else if (useSC) {
    startSoundCloudAutoplay();
  } else if (audio) {
    if (!_audioUnlocked) return;
    playMp3Preview();
  }
}

function getPlayerEl(id) {
  const map = {
    playBtn: 'cpPlayBtn', progressFill: 'cpProgressFill', progressThumb: 'cpProgressThumb',
    timeCur: 'cpTimeCur', timeDur: 'cpTimeDur', progressBar: 'cpProgressBar'
  };
  if (_audioPanel === 'crate') return document.getElementById(map[id] || id);
  return queryPlayerEl(id);
}

// ─── AUDIO ENGINE ─────────────────────────────────────────────────────────
function pauseTrackForCardSwap() {
  if (audio) {
    audio.pause();
    setPlayState(false);
  }
  clearInterval(vizTimer);
  stopEmbedPreview(getPlayerScope());
}

function stripEmbedsForFly(el) {
  if (!el) return;
  el.querySelectorAll('.yt-overlay').forEach(o => o.remove());
  el.querySelectorAll('iframe').forEach(f => f.remove());
}

function buildFlyCardShell(flyEl, dragTransform, playerMinH) {
  const skip = new Set(['dragging', 'spring-snap', 'card-enter', 'card-enter-portfolio', 'swipe-drag-pinned']);
  const clone = document.createElement('div');
  clone.className = Array.from(flyEl.classList).filter(c => !skip.has(c)).join(' ');
  if (dragTransform) clone.style.transform = dragTransform;
  const head = flyEl.querySelector('.card-head');
  const tags = flyEl.querySelector('.tag-row');
  if (head) clone.appendChild(head.cloneNode(true));
  if (tags) clone.appendChild(tags.cloneNode(true));
  const embedHost = flyEl.querySelector('.yt-wrap') || flyEl.querySelector('.player-area')
    || flyEl.querySelector('iframe')?.parentElement;
  const minH = playerMinH || (embedHost ? Math.max(embedHost.offsetHeight, 100) : 0);
  if (minH) {
    const ph = document.createElement('div');
    ph.className = (embedHost && embedHost.className) || 'yt-wrap';
    ph.style.minHeight = minH + 'px';
    ph.style.background = '#0a0a0a';
    ph.style.borderRadius = '14px';
    clone.appendChild(ph);
  }
  const footer = flyEl.querySelector('.yt-footer');
  if (footer) clone.appendChild(footer.cloneNode(true));
  return clone;
}

function measureFlyPlayerHeight(el) {
  const host = el?.querySelector('.yt-wrap') || el?.querySelector('.player-area')
    || el?.querySelector('iframe')?.parentElement;
  return host ? Math.max(host.offsetHeight, 100) : 0;
}

function takePendingFlyMetrics(flyEl) {
  const transform = _pendingFlyTransform || flyEl?.style.transform || '';
  const rect = _pendingFlyRect || flyEl.getBoundingClientRect();
  _pendingFlyRect = null;
  _pendingFlyTransform = '';
  if (flyEl) {
    flyEl.style.transform = '';
    flyEl.classList.remove('dragging');
  }
  return { transform, rect };
}

function dimEmbedsForDrag(card) {
  if (!card || isMobileUI()) return;
  card.querySelectorAll('iframe').forEach(f => { f.style.pointerEvents = 'none'; });
}

function restoreEmbedsAfterDrag(card) {
  if (!card || isMobileUI()) return;
  card.querySelectorAll('iframe').forEach(f => { f.style.pointerEvents = ''; });
}

function loadTrack(mp3Url, panel) {
  if (panel) _audioPanel = panel;
  else if (_portfolioMode) _audioPanel = 'portfolio';
  else if (!isDiscoverScreenActive()) return;
  pauseTrackForCardSwap();
  if (!audio) {
    audio = new Audio();
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', () => {
      const dur = getPlayerEl('timeDur');
      if (dur) dur.textContent = fmtTime(audio.duration);
    });
  }
  audio.preload = 'auto';
  audio.src = mp3Url;
}

function togglePlay() {
  if (!audio) return;
  if (isPlaying) {
    audio.pause();
    setPlayState(false);
  } else {
    audio.play().catch(() => {});
    setPlayState(true);
  }
}

function stopTrack() {
  if (audio) {
    audio.pause();
    audio.src = '';
    audio = null;
  }
  setPlayState(false);
  clearInterval(vizTimer);
  stopEmbedPreview(document.getElementById('cardWrap'));
  stopEmbedPreview(document.getElementById('portfolioCardSlot'));
}

function setPlayState(playing) {
  isPlaying = playing;
  const btn = getPlayerEl('playBtn');
  if (btn) {
    btn.classList.toggle('playing', playing);
    const icon = btn.querySelector('i');
    if (icon) icon.className = playing ? 'ti ti-player-pause' : 'ti ti-player-play';
    if (!playing && icon) icon.style.marginLeft = '0';
    if (playing && icon) icon.style.marginLeft = '2px';
  }
  clearInterval(vizTimer);
  const barSel = _audioPanel === 'crate' ? '.cp-wbar' : '.wbar';
  vizTimer = setInterval(() => {
    document.querySelectorAll(barSel).forEach(b => {
      const max = playing ? 54 : 16;
      const min = playing ? 6 : 3;
      b.style.height = Math.round(Math.random() * max + min) + 'px';
      b.style.opacity = playing ? '1' : '0.55';
    });
  }, playing ? 100 : 600);
}

let _scrubBar = null;

function updateProgressUI(pct) {
  const fill = getPlayerEl('progressFill');
  const thumb = getPlayerEl('progressThumb');
  if (fill) fill.style.width = pct + '%';
  if (thumb) thumb.style.left = pct + '%';
}

function onTimeUpdate() {
  if (!audio || _scrubBar) return;
  const pct = (audio.currentTime / audio.duration) * 100 || 0;
  updateProgressUI(pct);
  const cur = getPlayerEl('timeCur');
  if (cur) cur.textContent = fmtTime(audio.currentTime);
}

function onEnded() {
  setPlayState(false);
  updateProgressUI(0);
  const cur = getPlayerEl('timeCur');
  if (cur) cur.textContent = '0:00';
}

function seekFromProgressEvent(e, bar) {
  if (!audio || !audio.duration) return;
  const rect = bar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
  updateProgressUI(pct * 100);
  const cur = getPlayerEl('timeCur');
  if (cur) cur.textContent = fmtTime(audio.currentTime);
}

function seekTo(e) {
  seekFromProgressEvent(e, e.currentTarget);
}

function startProgressScrub(e) {
  if (!audio || !audio.duration) return;
  const bar = e.currentTarget;
  if (bar.id === 'cpProgressBar') _audioPanel = 'crate';
  e.preventDefault();
  try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  _scrubBar = bar;
  bar.classList.add('scrubbing');
  seekFromProgressEvent(e, bar);
  const onMove = ev => {
    if (ev.pointerId !== e.pointerId) return;
    seekFromProgressEvent(ev, bar);
  };
  const onUp = ev => {
    if (ev.pointerId !== e.pointerId) return;
    bar.classList.remove('scrubbing');
    try { bar.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    _scrubBar = null;
    bar.removeEventListener('pointermove', onMove);
    bar.removeEventListener('pointerup', onUp);
    bar.removeEventListener('pointercancel', onUp);
  };
  bar.addEventListener('pointermove', onMove);
  bar.addEventListener('pointerup', onUp);
  bar.addEventListener('pointercancel', onUp);
}

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────
// goTo is defined after producer logic below — forward declaration placeholder

// ─── CARD RENDER ──────────────────────────────────────────────────────────
// ─── YOUTUBE HELPERS ──────────────────────────────────────────────────────
function isSoundCloud(url) {
  return url && url.includes('soundcloud.com');
}

function isYouTube(url) {
  return url && (url.includes('youtube.com') || url.includes('youtu.be'));
}

function getYtId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function getYtEmbedBase(ytId) {
  const origin = encodeURIComponent(location.origin);
  return `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&enablejsapi=1&playsinline=1&iv_load_policy=3&origin=${origin}`;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function refocusSwipeShortcuts() {
  if (!isDesktop()) return;
  const el = document.getElementById('swipeKbdFocus');
  if (el) el.focus({ preventScroll: true });
}

function startVideo() {
  _audioUnlocked = true;
  const overlay = queryPlayerEl('ytOverlay');
  const frame   = queryPlayerEl('ytFrame');
  if (!overlay || !frame) return;
  const base = frame.getAttribute('data-src');
  if (!base || base === 'about:blank') return;
  if (isYtPreviewActive()) return;
  const autoplaySrc = base + '&autoplay=1';
  if (frame.src && frame.src !== 'about:blank' && frame.src.includes('autoplay=1') && _audioUnlocked) {
    frame.src = 'about:blank';
  }
  frame.src = autoplaySrc;
  if (_audioUnlocked || !isIOS()) {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
  }
}

function stopEmbedPreview(scope) {
  if (!scope) return;
  const frame = scope.querySelector('#ytFrame');
  if (frame) frame.src = 'about:blank';
  const overlay = scope.querySelector('#ytOverlay');
  if (overlay) {
    overlay.style.opacity = '';
    overlay.style.pointerEvents = '';
  }
  scope.querySelectorAll('iframe').forEach(f => {
    if (f.src && !f.src.includes('about:blank')) f.src = 'about:blank';
  });
}

function toggleCratePlay() {
  _audioPanel = 'crate';
  togglePlay();
}

function seekCrateTo(e) {
  _audioPanel = 'crate';
  startProgressScrub(e);
}

function renderCard(opts) {
  if (!isDiscoverScreenActive()) return;
  pauseTrackForCardSwap();
  _audioPanel = 'discover';
  const deferAudio = opts && opts.deferAudio;
  const wrap = document.getElementById('cardWrap');
  const source = getDiscoverSourceList(cat);
  const list = getDiscoverList(cat);
  const counter = document.getElementById('cardCounter');

  if (!list.length) {
    counter.textContent = 'Done!';
    const skippedCount = skippedIds[cat].length;
    const replayBtn = skippedCount > 0 ? `
      <button onclick="replaySkipped()" style="margin-top:14px;padding:12px 22px;border-radius:12px;background:var(--bg-3);border:0.5px solid var(--border-2);color:var(--text-2);font-size:13px;font-weight:600;cursor:pointer;width:100%;text-align:center">
        <i class="ti ti-refresh" style="font-size:15px;color:var(--accent-mid);vertical-align:-2px;margin-right:6px"></i>Replay ${skippedCount} skipped beat${skippedCount===1?'':'s'}
      </button>` : '';
    const rawCount = (_rawDb[cat] || db[cat] || []).length;
    const catNames = { full: 'Beats', loops: 'Loops', drums: 'Drum Kits', samples: 'Samples' };
    if (_discoverSearch.trim() && rawCount) {
      wrap.innerHTML = `<div class="empty-card"><i class="ti ti-search-off"></i>No results for "${escHtml(_discoverSearch.trim())}".<br><span style="font-size:12px;color:var(--text-3)">Try another title or producer.</span></div>`;
    } else if (!rawCount) {
      wrap.innerHTML = `<div class="empty-card"><i class="ti ti-clock-hour-3"></i>No ${catNames[cat] || 'beats'} yet.<br><span style="font-size:12px;color:var(--text-3)">Check back soon — more producer pages are going live.</span></div>`;
    } else {
      wrap.innerHTML = `<div class="empty-card"><i class="ti ti-music-off"></i>All caught up!<br>Switch category or check back later.${replayBtn}</div>`;
    }
    updateDiscoverLeftRail();
    return;
  }

  counter.textContent = (source.length - list.length + 1) + ' / ' + source.length;
  const d = list[0];
  const bars = Array(36).fill(0).map(() =>
    `<div class="wbar" style="height:${Math.round(Math.random()*14+3)}px;opacity:0.55"></div>`
  ).join('');

  const useYT = isYouTube(d.mp3);
  const useSC = isSoundCloud(d.mp3);
  const ytId  = useYT ? getYtId(d.mp3) : null;
  const embedSrc = ytId ? getYtEmbedBase(ytId) : '';
  const scEmbedSrc = useSC ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(d.mp3)}&color=%237C3AED&auto_play=${_audioUnlocked ? 'true' : 'false'}&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false` : '';

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
      <a href="${d.mp3}" target="_blank" class="yt-link">YouTube <i class="ti ti-external-link" style="font-size:11px"></i></a>
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
      <a href="${d.mp3}" target="_blank" class="yt-link">Open <i class="ti ti-external-link" style="font-size:11px"></i></a>
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
        <a href="${d.buy}" target="_blank" rel="noopener" class="buy-link">
          <i class="ti ti-shopping-cart" style="font-size:15px"></i>Buy
        </a>
      </div>
    </div>`;

  wrap.innerHTML = `
    <div class="card-stage">
    <div class="card-glow" id="cardGlow" style="--glow-color:${d.color}"></div>
    <div class="beat-card" id="theCard">
      <div class="card-head">
        <span class="swipe-label swipe-label-skip" id="labelSkip">SKIP</span>
        <span class="swipe-label swipe-label-save" id="labelSave">SAVE</span>
        <div class="cover-box">
          <i class="ti ti-${d.type==='Drums'?'circle':'music'}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div class="track-name">${d.title}</div>
          <div class="track-by" style="cursor:pointer;color:var(--accent-mid)" onclick="openProducerProfile('${d.producer.replace(/'/g,"\\'")}')">by ${d.producer} <i class="ti ti-arrow-right" style="font-size:10px"></i></div>
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
      ${playerHTML}
    </div>
    </div>`;

  // Idle waveform animation (only for MP3)
  if (!useYT && !useSC) {
    vizTimer = setInterval(() => {
      document.querySelectorAll('.wbar').forEach(b => {
        b.style.height = Math.round(Math.random() * 14 + 3) + 'px';
      });
    }, 600);
    const runLoad = () => loadTrack(d.mp3);
    if (deferAudio) setTimeout(runLoad, 120);
    else runLoad();
  }

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const card = document.getElementById('theCard');
    if (card) {
      card.classList.add('card-enter');
      card.addEventListener('animationend', () => card.classList.remove('card-enter'), { once: true });
    }
  }
  const runPreview = () => maybeAutoplayPreview(useYT, useSC);
  if (deferAudio) setTimeout(runPreview, 140);
  else runPreview();
  updateDiscoverLeftRail();
  if (isDesktop()) requestAnimationFrame(() => refocusSwipeShortcuts());
}

// Desktop — refocus for ← → swipe keys after click outside YouTube player
(function initDesktopSwipeFocus() {
  const SWIPE_FOCUS_SKIP = '.yt-wrap, .yt-overlay, .desktop-topbar, .discover-left-rail, .desktop-crate, .discover-toolbar, .portfolio-toolbar, .action-row, .portfolio-action-row, input, textarea, select, button, a';
  const SWIPE_FOCUS_CARD = '.beat-card, #portfolioCardSlot, #cardWrap, #portfolioCardWrap';

  document.addEventListener('mousedown', e => {
    if (!isDesktop()) return;
    if (!document.body.classList.contains('discover-active') && !document.body.classList.contains('portfolio-active')) return;
    if (e.target.closest(SWIPE_FOCUS_SKIP)) return;
    if (e.target.closest(SWIPE_FOCUS_CARD)) refocusSwipeShortcuts();
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !isDesktop()) return;
    if (!document.body.classList.contains('discover-active') && !document.body.classList.contains('portfolio-active')) return;
    refocusSwipeShortcuts();
  });
})();

// ─── iOS :active + touch press feedback ───────────────────────────────────
(function initTouchFeedback() {
  // Enables :active on iOS Safari
  document.addEventListener('touchstart', () => {}, { passive: true });
  const PRESS_SEL = '.act-btn,.cat-pill,.discover-filter-btn,.nav-tab,.btn-primary,.btn-secondary';
  function clearPressed() {
    document.querySelectorAll('.is-pressed').forEach(el => el.classList.remove('is-pressed'));
  }
  document.addEventListener('touchstart', e => {
    const el = e.target.closest(PRESS_SEL);
    if (el) el.classList.add('is-pressed');
  }, { passive: true });
  document.addEventListener('touchend', clearPressed, { passive: true });
  document.addEventListener('touchcancel', clearPressed, { passive: true });
})();

// ─── SWIPE GESTURE (touch + mouse) ───────────────────────────────────────
(function initSwipeGesture() {
  let startX = 0, startY = 0, curX = 0, isDragging = false, isLocked = false;
  let springRAF = null;
  let gestureIsTouch = false;
  let _dragPin = null;
  let lastMoveX = 0, lastMoveT = 0, releaseVelocity = 0;
  const SWIPE_THRESHOLD = 60;
  const SWIPE_VELOCITY_THRESHOLD = 380;
  const SWIPE_MIN_FLICK_DISTANCE = 14;
  const MAX_ROTATION = 18;
  const SPRING_SNAP_STIFFNESS = 380;
  const SPRING_SNAP_DAMPING = 26;

  function pinCardForMobileDrag(card) {
    /* Portfolio: never pin — #portfolioCardWrap-scoped CSS (bg, radius) breaks on body */
    if (!isMobileUI() || !card || _dragPin || _portfolioMode) return;
    const rect = card.getBoundingClientRect();
    const parent = card.parentNode;
    if (!parent) return;
    const next = card.nextSibling;
    const ph = document.createElement('div');
    ph.className = 'swipe-drag-spacer';
    ph.setAttribute('aria-hidden', 'true');
    ph.style.cssText = `height:${rect.height}px;width:100%;flex-shrink:0;visibility:hidden;pointer-events:none;`;
    parent.insertBefore(ph, card);
    document.body.appendChild(card);
    card.style.position = 'fixed';
    card.style.left = rect.left + 'px';
    card.style.top = rect.top + 'px';
    card.style.width = rect.width + 'px';
    card.style.margin = '0';
    card.classList.add('swipe-drag-pinned');
    _dragPin = { card, parent, next, ph };
    document.body.classList.add('swipe-card-dragging');
  }

  function clearPinnedCardStyles(card) {
    if (!card) return;
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.style.margin = '';
    card.style.transform = '';
    card.style.opacity = '';
    card.classList.remove('dragging', 'spring-snap', 'swipe-drag-pinned', 'fly-left', 'fly-right');
  }

  function unpinCardForMobileDrag(card) {
    if (!_dragPin || _dragPin.card !== card) return;
    const { parent, next, ph } = _dragPin;
    clearPinnedCardStyles(card);
    if (parent && document.contains(parent)) {
      if (next && next.parentNode === parent) parent.insertBefore(card, next);
      else parent.appendChild(card);
    } else if (card.parentNode === document.body) {
      card.remove();
    }
    ph?.remove();
    _dragPin = null;
    document.body.classList.remove('swipe-card-dragging');
  }

  function forceCleanupSwipeDrag() {
    cancelSpring();
    isDragging = false;
    isLocked = false;
    _swipeDragging = false;
    _swipeCommitted = false;
    curX = 0;
    gestureIsTouch = false;
    resetVelocity();

    if (_dragPin) {
      const { card, ph } = _dragPin;
      clearPinnedCardStyles(card);
      if (card.parentNode === document.body) card.remove();
      ph?.remove();
      _dragPin = null;
    }

    purgeOrphanSwipeNodes();
    document.querySelectorAll('.portfolio-fly-clone, .discover-fly-clone').forEach(el => el.remove());
    document.querySelectorAll('.swipe-emoji').forEach(el => el.remove());

    const liveSurface = document.querySelector('#portfolioCardSlot .portfolio-surface:not(.portfolio-fly-clone)');
    if (liveSurface) clearPinnedCardStyles(liveSurface);
    const liveCard = document.getElementById('theCard');
    if (liveCard) clearPinnedCardStyles(liveCard);

    document.querySelectorAll('.act-btn').forEach(b => { b.style.opacity = ''; });
    ['labelSkip', 'labelSave'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.opacity = 0;
    });
    document.body.classList.remove('swipe-card-dragging');
    document.getElementById('portfolioScreen')?.style.removeProperty('position');
    document.getElementById('discoverScreen')?.style.removeProperty('position');
    resetGlow();
    _portfolioSwipeLock = false;
    _pendingFlyRect = null;
    _pendingFlyTransform = '';
  }

  resetSwipeGestureState = forceCleanupSwipeDrag;

  function getCard() {
    if (_portfolioMode) {
      return document.querySelector('#portfolioCardSlot .portfolio-surface') || document.getElementById('theCard');
    }
    return document.getElementById('theCard');
  }
  function canStartSwipe() {
    if (!document.getElementById('theCard')) return false;
    if (_portfolioMode && document.getElementById('portfolioPageInner')?.classList.contains('page-inner--swipe-done')) return false;
    return true;
  }
  function isSwipeGestureTarget(el) {
    if (!canStartSwipe()) return false;
    if (_portfolioMode) {
      if (!el.closest('#portfolioPageInner')) return false;
      if (el.closest('.portfolio-action-row,.act-btn,.portfolio-foot a')) return false;
    } else {
      if (!el.closest('#cardWrap')) return false;
      if (el.closest('.action-row,.act-btn,.discover-toolbar,.swipe-hint')) return false;
    }
    if (el.closest('iframe,button,a,.progress-bar,.waveform-wrap,.yt-overlay')) return false;
    return true;
  }
  function getGlow()  { return document.getElementById('cardGlow'); }

  function cancelSpring() {
    if (springRAF) { cancelAnimationFrame(springRAF); springRAF = null; }
  }

  function resetVelocity() {
    lastMoveX = 0;
    lastMoveT = 0;
    releaseVelocity = 0;
  }

  function trackVelocity(x) {
    const now = performance.now();
    if (lastMoveT) {
      const dt = (now - lastMoveT) / 1000;
      if (dt > 0 && dt < 0.12) {
        const instant = (x - lastMoveX) / dt;
        releaseVelocity = releaseVelocity * 0.55 + instant * 0.45;
      }
    }
    lastMoveX = x;
    lastMoveT = now;
  }

  function cardTransform(x) {
    const rot = (x / 320) * MAX_ROTATION;
    return `translateX(${x}px) rotate(${rot}deg)`;
  }

  function resolveSwipeCommit(dx, vx) {
    if (Math.abs(dx) >= SWIPE_THRESHOLD) return dx > 0 ? 'right' : 'left';
    if (Math.abs(dx) >= SWIPE_MIN_FLICK_DISTANCE && Math.abs(vx) >= SWIPE_VELOCITY_THRESHOLD) {
      if (vx > 0 && dx > 0) return 'right';
      if (vx < 0 && dx < 0) return 'left';
    }
    return null;
  }

  function updateGlow(dx) {
    const glow = getGlow();
    if (!glow) return;
    glow.style.transition = 'none';
    glow.classList.remove('glow-toward-save', 'glow-toward-skip');
    if (_portfolioMode && Math.abs(dx) <= 12) {
      glow.style.transform = 'translate(-50%, -50%) scale(1)';
      glow.style.opacity = '0';
      return;
    }
    const pct = Math.min(Math.abs(dx) / 110, 1);
    const mobile = isMobileUI();
    const scale = 1 + pct * (mobile ? 0.1 : 0.22);
    const tx = dx * (mobile ? 0.08 : 0.14);
    glow.style.transform = `translate(calc(-50% + ${tx}px), -50%) scale(${scale})`;
    glow.style.opacity = String((mobile ? 0.2 : 0.28) + pct * (mobile ? 0.18 : 0.42));
    if (dx > 12) glow.classList.add('glow-toward-save');
    else if (dx < -12) glow.classList.add('glow-toward-skip');
  }

  function resetGlow() {
    const glow = getGlow();
    if (!glow) return;
    glow.style.transition = '';
    glow.style.transform = 'translate(-50%, -50%) scale(1)';
    glow.style.opacity = _portfolioMode ? '0' : '0.32';
    glow.classList.remove('glow-toward-save', 'glow-toward-skip');
  }

  function springSnapBack(card, fromX, fromV = 0) {
    cancelSpring();
    card.classList.add('spring-snap');
    let x = fromX;
    let v = fromV;
    let last = performance.now();

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.028);
      last = now;
      const a = (-SPRING_SNAP_STIFFNESS * x - SPRING_SNAP_DAMPING * v);
      v += a * dt;
      x += v * dt;
      card.style.transform = cardTransform(x);
      updateGlow(x);
      if (Math.abs(x) > 0.35 || Math.abs(v) > 0.35) {
        springRAF = requestAnimationFrame(tick);
      } else {
        card.style.transform = '';
        card.style.opacity = '';
        card.classList.remove('spring-snap');
        unpinCardForMobileDrag(card);
        restoreEmbedsAfterDrag(card);
        resetGlow();
        resetVelocity();
        springRAF = null;
      }
    }
    springRAF = requestAnimationFrame(tick);
  }

  function springFlyOut(card, dir, fromX, fromV, onComplete) {
    cancelSpring();
    card.classList.add('spring-snap');
    let x = fromX;
    let v = fromV;
    const sign = dir === 'right' ? 1 : -1;
    const minLaunch = 820;
    if (sign * v < minLaunch) v = sign * Math.max(minLaunch, Math.abs(v) * 1.35 + 520);
    const accel = sign * 2400;
    const exitX = sign * (window.innerWidth * 1.05);
    let last = performance.now();

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.028);
      last = now;
      v += accel * dt;
      x += v * dt;
      const traveled = Math.abs(x - fromX);
      const total = Math.abs(exitX - fromX) || 1;
      const progress = Math.min(traveled / total, 1);
      card.style.transform = cardTransform(x);
      card.style.opacity = String(Math.max(0, 1 - progress * 0.92));
      updateGlow(x);
      if (sign * x < sign * exitX && progress < 0.98) {
        springRAF = requestAnimationFrame(tick);
      } else {
        card.style.transform = '';
        card.style.opacity = '';
        card.classList.remove('spring-snap');
        resetGlow();
        resetVelocity();
        springRAF = null;
        onComplete();
      }
    }
    springRAF = requestAnimationFrame(tick);
  }

  function commitSwipe(dir) {
    if (_swipeCommitted || isLocked) return;
    _swipeCommitted = true;
    _swipeDragging = false;
    isDragging = false;
    const card = getCard();
    if (card) card.classList.remove('dragging');
    document.querySelectorAll('.act-btn').forEach(b => b.style.opacity = '');
    const skipLabel = document.getElementById('labelSkip');
    const saveLabel = document.getElementById('labelSave');
    if (skipLabel) skipLabel.style.opacity = 0;
    if (saveLabel) saveLabel.style.opacity = 0;
    isLocked = true;
    doSwipe(dir);
    setTimeout(() => { isLocked = false; resetGlow(); _swipeCommitted = false; }, 450);
  }

  function onStart(x, y, fromTouch) {
    const card = getCard();
    if (!card || isLocked) return;
    _audioUnlocked = true;
    tryAutoplayFromGesture();
    cancelSpring();
    resetVelocity();
    gestureIsTouch = !!fromTouch;
    _swipeCommitted = false;
    startX = x; startY = y; curX = 0;
    isDragging = true;
    _swipeDragging = true;
    card.classList.add('dragging');
    card.style.opacity = '';
    dimEmbedsForDrag(card);
    pinCardForMobileDrag(card);
  }

  function onMove(x, y) {
    if (!isDragging || isLocked || _swipeCommitted) return;
    const card = getCard();
    if (!card) return;

    const dx = x - startX;
    const dy = y - startY;

    if (!curX && Math.abs(dy) > Math.abs(dx) + 8) {
      isDragging = false;
      _swipeDragging = false;
      card.classList.remove('dragging');
      unpinCardForMobileDrag(card);
      restoreEmbedsAfterDrag(card);
      resetVelocity();
      return;
    }

    curX = dx;
    trackVelocity(dx);
    card.style.transform = cardTransform(dx);
    updateGlow(dx);

    const pct = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    const skipLabel = document.getElementById('labelSkip');
    const saveLabel = document.getElementById('labelSave');
    if (skipLabel) skipLabel.style.opacity = dx < 0 ? pct : 0;
    if (saveLabel) saveLabel.style.opacity = dx > 0 ? pct : 0;

    const btnScope = _portfolioMode ? '#portfolioScreen' : '#discoverScreen';
    const btnSkip = document.querySelector(`${btnScope} .btn-skip`);
    const btnSave = document.querySelector(`${btnScope} .btn-save`);
    if (btnSkip) btnSkip.style.opacity = dx < 0 ? 0.5 + pct * 0.5 : 0.5;
    if (btnSave) btnSave.style.opacity = dx > 0 ? 0.5 + pct * 0.5 : 0.5;
  }

  function clearDragChrome() {
    document.querySelectorAll('.act-btn').forEach(b => b.style.opacity = '');
    const skipLabel = document.getElementById('labelSkip');
    const saveLabel = document.getElementById('labelSave');
    if (skipLabel) skipLabel.style.opacity = 0;
    if (saveLabel) saveLabel.style.opacity = 0;
  }

  function onEnd() {
    if (_swipeCommitted) {
      _swipeDragging = false;
      isDragging = false;
      return;
    }
    if (!isDragging || isLocked) return;
    isDragging = false;
    _swipeDragging = false;
    const card = getCard();
    if (!card) return;
    card.classList.remove('dragging');
    clearDragChrome();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const commitDir = resolveSwipeCommit(curX, releaseVelocity);

    if (commitDir) {
      if (reduced) {
        if (!gestureIsTouch) {
          _pendingFlyRect = card.getBoundingClientRect();
          _pendingFlyTransform = card.style.transform;
          card.style.transform = '';
          restoreEmbedsAfterDrag(card);
        }
        unpinCardForMobileDrag(card);
        commitSwipe(commitDir);
        return;
      }

      _swipeCommitted = true;
      isLocked = true;

      springFlyOut(card, commitDir, curX, releaseVelocity, () => {
        unpinCardForMobileDrag(card);
        restoreEmbedsAfterDrag(card);
        doSwipe(commitDir, { skipFly: true });
        setTimeout(() => {
          isLocked = false;
          _swipeCommitted = false;
        }, 260);
      });
      return;
    }

    tryAutoplayFromGesture();
    if (Math.abs(curX) > 2 || Math.abs(releaseVelocity) > 40) {
      springSnapBack(card, curX, releaseVelocity);
    } else {
      unpinCardForMobileDrag(card);
      card.style.transform = '';
      restoreEmbedsAfterDrag(card);
      resetGlow();
      resetVelocity();
    }
  }

  // ── TOUCH ──
  document.addEventListener('touchstart', e => {
    if (!isSwipeGestureTarget(e.target)) return;
    onStart(e.touches[0].clientX, e.touches[0].clientY, true);
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!isDragging) return;
    e.preventDefault();
    onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  document.addEventListener('touchend', onEnd, { passive: true });
  document.addEventListener('touchcancel', () => {
    if (!isDragging) return;
    const card = getCard();
    isDragging = false;
    _swipeDragging = false;
    if (card) {
      card.classList.remove('dragging');
      if (Math.abs(curX) > 2 || Math.abs(releaseVelocity) > 40) {
        springSnapBack(card, curX, releaseVelocity);
      } else {
        unpinCardForMobileDrag(card);
        card.style.transform = '';
        restoreEmbedsAfterDrag(card);
        resetGlow();
        resetVelocity();
      }
    }
    clearDragChrome();
  }, { passive: true });

  // ── MOUSE ──
  document.addEventListener('mousedown', e => {
    if (!isSwipeGestureTarget(e.target)) return;
    onStart(e.clientX, e.clientY, false);
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    onMove(e.clientX, e.clientY);
  });

  document.addEventListener('mouseup', onEnd);
  document.addEventListener('mouseleave', onEnd);
})();

// ─── FAQ ──────────────────────────────────────────────────────────────────
function toggleFaq(btn) {
  const answer = btn.nextElementSibling;
  const isOpen = btn.classList.contains('open');
  document.querySelectorAll('.faq-q').forEach(b => { b.classList.remove('open'); b.nextElementSibling.classList.remove('open'); });
  if (!isOpen) { btn.classList.add('open'); answer.classList.add('open'); }
}

// ─── INFO MODALS ──────────────────────────────────────────────────────────
function openInfoModal(id) { document.getElementById(id).classList.add('open'); }
function closeInfoModal(id) { document.getElementById(id).classList.remove('open'); }
function closeInfoIfBackdrop(e, id) { if (e.target === document.getElementById(id)) closeInfoModal(id); }

// ─── EMOJI POP ────────────────────────────────────────────────────────────
function showEmojiPop(dir) {
  const el = document.createElement('div');
  el.className = 'swipe-emoji' + (isMobileUI() ? ' swipe-emoji--viewport' : '');
  el.textContent = dir === 'right' ? '🔥' : '👋';
  if (isMobileUI()) {
    document.body.appendChild(el);
  } else {
    const container = _portfolioMode ? (document.getElementById('portfolioScreen') || document.body) : (document.getElementById('discoverScreen') || document.body);
    container.appendChild(el);
  }
  setTimeout(() => el.remove(), isDesktop() ? 460 : 700);
  if (dir === 'right') showSaveBurst();
}

function showSaveBurst() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sel = _portfolioMode ? '#portfolioScreen .btn-save' : '#discoverScreen .btn-save';
  const btn = document.querySelector(sel);
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'save-burst';
  el.textContent = '🔥';
  el.style.left = (rect.left + rect.width / 2) + 'px';
  el.style.top = (rect.top + rect.height / 2) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 520);
}


function queueSaveBeatToDB(beat) {
  const run = () => {
    saveBeatToDB(beat).then(saved => {
      if (!saved) showToast('Could not save to Favorites — try again.', 'error');
    });
  };
  if (isMobileUI()) {
    setTimeout(run, 520);
  } else if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 0);
  }
}

function doSwipe(dir, opts = {}) {
  const card = document.getElementById('theCard');
  if (!card) return;
  if (_portfolioMode && _portfolioSwipeLock) return;
  if (!_audioUnlocked) _audioUnlocked = true;
  if (_portfolioMode) {
    const list = getPortfolioList();
    const item = list[0];
    if (!item) return;
    if (_portfolioPreview) {
      if (!_portfolioPreviewPassed.includes(item.id)) _portfolioPreviewPassed.push(item.id);
      if (dir === 'left') {
        if (!_portfolioSkipped.includes(item.id)) _portfolioSkipped.push(item.id);
      } else {
        _portfolioSkipped = _portfolioSkipped.filter(id => id !== item.id);
      }
    } else if (dir === 'right') {
      if (!crate.find(i => i.id === item.id)) {
        crate.push(item);
        _lastSavedBeatId = item.id;
        if (currentUser) queueSaveBeatToDB(item);
        else showMobileSyncHint(incrementGuestSaveCount());
      }
      _portfolioSkipped = _portfolioSkipped.filter(id => id !== item.id);
    } else {
      if (!_portfolioSkipped.includes(item.id)) _portfolioSkipped.push(item.id);
    }
    _portfolioSwipeLock = true;
    pauseTrackForCardSwap();
    const onReplaced = () => {
      renderPortfolioCard();
      tryAutoplayFromGesture();
      _portfolioSwipeLock = false;
    };
    if (opts.skipFly) {
      onReplaced();
    } else {
      flyOutPortfolioCard(dir, onReplaced);
    }
    requestAnimationFrame(() => showEmojiPop(dir));
    return;
  }
  const list = getDiscoverList(cat);
  const item = list[0];
  if (!item) return;
  let savedThisSwipe = false;
  if (dir === 'right') {
    if (!crate.find(i => i.id === item.id)) {
      crate.push(item);
      _lastSavedBeatId = item.id;
      savedThisSwipe = true;
      if (currentUser) queueSaveBeatToDB(item);
      else showMobileSyncHint(incrementGuestSaveCount());
    }
    skippedIds[cat] = skippedIds[cat].filter(id => id !== item.id);
  } else {
    if (!skippedIds[cat].includes(item.id)) skippedIds[cat].push(item.id);
  }
  pauseTrackForCardSwap();
  const onReplaced = () => {
    saveSkippedState();
    saveSwipeState();
    if (savedThisSwipe) updateCrateCountUI();
    renderCard({ deferAudio: true });
    tryAutoplayFromGesture();
    if (savedThisSwipe) setTimeout(() => renderCrate(), 80);
  };
  if (opts.skipFly) {
    onReplaced();
  } else {
    flyOutDiscoverCard(dir, onReplaced);
  }
  requestAnimationFrame(() => showEmojiPop(dir));
}

// ─── CRATE ────────────────────────────────────────────────────────────────
let _selectedCrateId = null;
let _previewLoadedId = null;

function selectCrateBeat(beatId) {
  if (!crate.find(b => b.id === beatId)) return;
  _selectedCrateId = beatId;
  renderCrate();
}

function buildCratePreviewHTML(d) {
  if (!d) {
    return `<div class="crate-preview-empty"><i class="ti ti-headphones"></i>Select a beat from the list<br>to preview it here.</div>`;
  }
  const prodEsc = d.producer.replace(/'/g, "\\'");
  const useYT = isYouTube(d.mp3);
  const useSC = isSoundCloud(d.mp3);
  const ytId = useYT ? getYtId(d.mp3) : null;
  const embedSrc = ytId ? `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1` : '';
  const scEmbedSrc = useSC ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(d.mp3)}&color=%237C3AED&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false` : '';
  const bars = Array(28).fill(0).map(() =>
    `<div class="wbar cp-wbar" style="height:${Math.round(Math.random()*14+3)}px;opacity:0.55"></div>`
  ).join('');
  let playerHTML = '';
  if (useYT && embedSrc) {
    playerHTML = `<div class="crate-preview-player"><iframe src="${embedSrc}" height="180" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  } else if (useSC) {
    playerHTML = `<div class="crate-preview-player"><iframe src="${scEmbedSrc}" height="120" scrolling="no" allow="autoplay"></iframe></div>`;
  } else {
    playerHTML = `<div class="crate-preview-player crate-preview-mp3">
      <div class="waveform-wrap" onclick="toggleCratePlay()"><div class="waveform">${bars}</div></div>
      <div class="player-controls">
        <button class="play-btn" id="cpPlayBtn" onclick="toggleCratePlay()" aria-label="Play/Pause"><i class="ti ti-player-play" style="margin-left:2px"></i></button>
        <div class="progress-wrap">
          <div class="progress-bar" id="cpProgressBar" onpointerdown="seekCrateTo(event)">
            <div class="progress-fill" id="cpProgressFill"></div>
            <div class="progress-thumb" id="cpProgressThumb" aria-hidden="true"></div>
          </div>
          <div class="time-row">
            <span class="time-lbl" id="cpTimeCur">0:00</span>
            <span class="time-lbl" id="cpTimeDur">--:--</span>
          </div>
        </div>
      </div>
    </div>`;
  }
  const hasBuy = d.buy && d.buy.startsWith('http') && d.buy !== d.mp3;
  let buyBtn = '';
  if (hasBuy) {
    buyBtn = `<button class="crate-action-btn" onclick="window.open('${d.buy}','_blank')"><i class="ti ti-external-link"></i> Get this beat</button>`;
  } else if (useYT) {
    buyBtn = `<button class="crate-action-btn" onclick="window.open('${d.mp3}','_blank')"><i class="ti ti-brand-youtube"></i> YouTube</button>`;
  } else if (useSC) {
    buyBtn = `<button class="crate-action-btn" onclick="window.open('${d.mp3}','_blank')"><i class="ti ti-brand-soundcloud"></i> SoundCloud</button>`;
  } else {
    buyBtn = `<button class="crate-action-btn crate-action-btn--ghost" onclick="openProducerProfile('${prodEsc}')"><i class="ti ti-user"></i> Contact producer</button>`;
  }
  return `<div class="crate-preview-card">
    <div class="crate-preview-head">
      <div class="crate-preview-cover"><i class="ti ti-music"></i></div>
      <div>
        <div class="crate-preview-title">${d.title}</div>
        <div class="crate-preview-producer" onclick="openProducerProfile('${prodEsc}')">by ${d.producer}</div>
      </div>
    </div>
    <div class="crate-preview-tags">
      <span>${d.bpm} BPM</span><span>${d.key}</span><span>${d.genre}</span><span>${d.type}</span>
    </div>
    ${playerHTML}
    <div class="crate-preview-actions">${buyBtn}</div>
  </div>`;
}

function applyCratePreviewAudio(d) {
  if (!d) {
    _previewLoadedId = null;
    if (_audioPanel === 'crate') stopTrack();
    return;
  }
  const useYT = isYouTube(d.mp3);
  const useSC = isSoundCloud(d.mp3);
  if (!useYT && !useSC && d.mp3) {
    if (_previewLoadedId !== d.id) {
      _previewLoadedId = d.id;
      _audioPanel = 'crate';
      loadTrack(d.mp3, 'crate');
    }
  } else {
    _previewLoadedId = null;
    if (_audioPanel === 'crate') stopTrack();
  }
}

function renderCratePreview(d) {
  const panel = document.getElementById('cratePreviewPanel');
  const onCrate = document.getElementById('crateScreen')?.classList.contains('active');
  if (!panel || !onCrate || !isDesktop() || !window.matchMedia('(min-width: 1100px)').matches) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const beatId = d?.id || '';
  const existing = panel.firstElementChild;
  if (beatId && panel.dataset.previewId === beatId && existing?.classList.contains('crate-preview-card')) {
    applyCratePreviewAudio(d);
    return;
  }
  panel.dataset.previewId = beatId;
  const html = buildCratePreviewHTML(d);

  function mountPreview() {
    panel.innerHTML = html;
    const el = panel.firstElementChild;
    if (el && !reducedMotion) {
      el.classList.add('crate-preview-enter');
      el.addEventListener('animationend', () => el.classList.remove('crate-preview-enter'), { once: true });
    }
    applyCratePreviewAudio(d);
  }

  if (existing && !reducedMotion) {
    existing.classList.add('crate-preview-fade-out');
    setTimeout(mountPreview, 130);
  } else {
    mountPreview();
  }
}

function updateCrateCountUI() {
  const countTxt = crate.length + ' beat' + (crate.length === 1 ? '' : 's') + ' saved';
  const lbl = document.getElementById('crateCountLbl');
  if (lbl) lbl.textContent = countTxt;
  const pageDesc = document.getElementById('cratePageDesc');
  if (pageDesc) {
    pageDesc.textContent = crate.length
      ? countTxt + ' — license directly from the producer.'
      : 'Your saved beats — license directly from the producer.';
  }
  const sub = document.getElementById('dcSub');
  if (sub) sub.textContent = crate.length + ' beat' + (crate.length === 1 ? '' : 's') + ' in Favorites';
  const flrCount = document.getElementById('flrCount');
  if (flrCount) flrCount.textContent = String(crate.length);
}

function renderCrate() {
  const body = document.getElementById('crateBody');
  const stagger = takeListEnter();
  updateCrateCountUI();
  const onCrate = document.getElementById('crateScreen')?.classList.contains('active');
  if (!onCrate && isMobileUI()) return;
  if (!crate.length) {
    _selectedCrateId = null;
    _previewLoadedId = null;
    if (body) body.innerHTML = `<div class="crate-empty"><i class="ti ti-music-off"></i>Nothing here yet.<br>Go swipe some beats!</div>`;
    renderCratePreview(null);
    renderDesktopCrate(stagger);
    return;
  }
  if (_lastSavedBeatId && crate.find(b => b.id === _lastSavedBeatId)) {
    _selectedCrateId = _lastSavedBeatId;
  } else if (!_selectedCrateId || !crate.find(b => b.id === _selectedCrateId)) {
    _selectedCrateId = crate[0].id;
  }
  const selectedBeat = crate.find(b => b.id === _selectedCrateId);
  body.innerHTML = crate.map((d, idx) => {
    const hasBuy = d.buy && d.buy.startsWith('http') && d.buy !== d.mp3;
    const isYT = isYouTube(d.mp3);
    const isSC = isSoundCloud(d.mp3);
    let btnLabel, btnLink;
    if (hasBuy) {
      const buyUrl = d.buy.toLowerCase();
      if (buyUrl.includes('beatstars.com'))        { btnLabel = `<i class="ti ti-external-link"></i> BeatStars`; }
      else if (buyUrl.includes('splice.com'))       { btnLabel = `<i class="ti ti-external-link"></i> Splice`; }
      else if (buyUrl.includes('loopmasters.com'))  { btnLabel = `<i class="ti ti-external-link"></i> Loopmasters`; }
      else if (buyUrl.includes('instagram.com'))    { btnLabel = `<i class="ti ti-brand-instagram"></i> Instagram`; }
      else if (buyUrl.includes('soundcloud.com'))   { btnLabel = `<i class="ti ti-brand-soundcloud"></i> SoundCloud`; }
      else if (buyUrl.includes('youtube.com') || buyUrl.includes('youtu.be')) { btnLabel = `<i class="ti ti-brand-youtube"></i> YouTube`; }
      else { btnLabel = `<i class="ti ti-external-link"></i> Get beat`; }
      btnLink = d.buy;
    } else if (isYT) {
      btnLabel = `<i class="ti ti-brand-youtube"></i> YouTube`;
      btnLink = d.mp3;
    } else if (isSC) {
      btnLabel = `<i class="ti ti-brand-soundcloud"></i> SoundCloud`;
      btnLink = d.mp3;
    } else {
      btnLabel = null;
      btnLink = null;
    }
    const enterCls = stagger ? ' list-enter' : (d.id === _lastSavedBeatId ? ' crate-enter' : '');
    const staggerStyle = stagger ? ` style="--i:${Math.min(idx, 7)}"` : '';
    const selCls = d.id === _selectedCrateId ? ' crate-card--selected' : '';
    const prodEsc = d.producer.replace(/'/g,"\\'");
    const actionHTML = btnLink
      ? `<button class="crate-action-btn" onclick="event.stopPropagation();window.open('${btnLink}','_blank')">${btnLabel}</button>`
      : `<button class="crate-action-btn crate-action-btn--ghost" onclick="event.stopPropagation();openProducerProfile('${prodEsc}')" title="Contact ${d.producer} for licensing"><i class="ti ti-user"></i> Contact</button>`;
    return `
    <div class="crate-card${enterCls}${selCls}" id="crate-card-${d.id}"${staggerStyle} onclick="selectCrateBeat('${d.id}')">
      <div class="mini-cover">
        <i class="ti ti-music"></i>
      </div>
      <div class="crate-info">
        <div class="crate-name">${d.title}</div>
        <div class="crate-meta"><span class="crate-meta-producer" onclick="openProducerProfile('${prodEsc}')">${d.producer}</span> · ${d.bpm} · ${d.genre}</div>
      </div>
      <div class="crate-actions">
        ${actionHTML}
        <button class="crate-remove-btn" onclick="event.stopPropagation();removeBeatFromCrate('${d.id}')" title="Remove"><i class="ti ti-x"></i></button>
      </div>
    </div>`;
  }).join('');
  renderCratePreview(selectedBeat);
  renderDesktopCrate(stagger);
}

function renderDesktopCrate(stagger) {
  const body = document.getElementById('dcBody');
  const sub = document.getElementById('dcSub');
  if (!body) return;
  if (sub) sub.textContent = crate.length + ' beat' + (crate.length === 1 ? '' : 's') + ' in Favorites';
  if (!crate.length) {
    body.innerHTML = `<div class="dc-empty"><i class="ti ti-shopping-cart"></i>Swipe right on beats<br>to save them here</div>`;
    updateDiscoverLeftRail();
    return;
  }
  body.innerHTML = crate.map((d, idx) => {
    const hasBuy = d.buy && d.buy.startsWith('http');
    const isYT = isYouTube(d.mp3);
    const isSC = isSoundCloud(d.mp3);
    let btnLink = hasBuy ? d.buy : (isYT || isSC ? d.mp3 : null);
    let btnIcon = hasBuy ? 'ti-external-link' : (isYT ? 'ti-brand-youtube' : (isSC ? 'ti-brand-soundcloud' : 'ti-music'));
    let btnLabel = hasBuy ? 'Get this beat' : (isYT ? 'Watch on YouTube' : (isSC ? 'Listen on SoundCloud' : null));
    const buyUrl = (d.buy||'').toLowerCase();
    if (buyUrl.includes('beatstars')) btnLabel = 'Get on BeatStars';
    else if (buyUrl.includes('splice')) btnLabel = 'Get on Splice';
    else if (buyUrl.includes('instagram')) { btnLabel = 'DM on Instagram'; btnIcon = 'ti-brand-instagram'; }
    const buyBtn = btnLink ? '<button class="dc-buy" onclick="window.open(\'' + btnLink + '\',\'_blank\'"><i class="ti ' + btnIcon + '"></i> ' + btnLabel + '</button>' : '';
    const enterCls = stagger ? ' list-enter' : (d.id === _lastSavedBeatId ? ' dc-enter' : '');
    const staggerStyle = stagger ? ' style="--i:' + Math.min(idx, 7) + '"' : '';
    return '<div class="dc-card' + enterCls + '"' + staggerStyle + '>'
      + '<div class="dc-card-top">'
      + '<div class="dc-cover">'
      + '<i class="ti ti-music"></i></div>'
      + '<div class="dc-info">'
      + '<div class="dc-name">' + d.title + '</div>'
      + '<div class="dc-meta">' + d.producer + ' · ' + d.genre + '</div>'
      + '</div>'
      + '<button class="dc-remove" onclick="removeBeatFromCrate(\'' + d.id + '\')" title="Remove"><i class="ti ti-x"></i></button>'
      + '</div>'
      + buyBtn
      + '</div>';
  }).join('');
  if (_lastSavedBeatId) {
    const savedId = _lastSavedBeatId;
    setTimeout(() => { if (_lastSavedBeatId === savedId) _lastSavedBeatId = null; }, 400);
  }
  updateDiscoverLeftRail();
}

async function removeBeatFromCrate(beatId) {
  _cratePendingSaves.delete(beatId);
  crate = crate.filter(b => b.id !== beatId);
  if (_selectedCrateId === beatId) _selectedCrateId = crate[0]?.id || null;
  renderCrate();
  if (!currentUser) return;
  const token = await getAccessToken();
  if (!token) return;
  try {
    const res = await fetch(`/api/crate?beat_id=${encodeURIComponent(beatId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('removeBeatFromCrate failed:', res.status, data.error || data);
      showToast('Could not sync removal — try again.', 'error');
    }
  } catch(e) {
    console.warn('removeBeatFromCrate error:', e);
    showToast('Could not sync removal — try again.', 'error');
  }
}

// ─── CATEGORY SEGMENT ─────────────────────────────────────────────────────
document.getElementById('catRow').querySelectorAll('.cat-pill').forEach(btn => {
  btn.onclick = () => {
    if (btn.dataset.cat === cat) return;
    setActiveCat(btn.dataset.cat);
    saveSwipeState();
    renderCard();
  };
});
requestAnimationFrame(() => positionCatIndicator());

// ─── SUPABASE ──────────────────────────────────────────────────────────────
const SUPA_URL = 'https://yprwklxolgrlyswqwkzr.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcndrbHhvbGdybHlzd3F3a3pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDE5MjUsImV4cCI6MjA5NjIxNzkyNX0.Or_pWAg1QuJ3TSVLdC8LKzp1PsYwTxcAfy_YcSAU2ZA';

function parseAuthUrlParams() {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    return { hash, query };
  } catch (e) {
    return { hash: new URLSearchParams(), query: new URLSearchParams() };
  }
}

// Capture before Supabase strips the URL on init
const _bootAuthParams = parseAuthUrlParams();
const _authRecoveryFromUrl = _bootAuthParams.hash.get('type') === 'recovery'
  || _bootAuthParams.query.get('type') === 'recovery';
const _authCodeInUrl = !!_bootAuthParams.query.get('code');
const _authHashTokenInUrl = !!_bootAuthParams.hash.get('access_token');

const supa = supabase.createClient(SUPA_URL, SUPA_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

function getAuthRedirectUrl() {
  return `${window.location.origin}/`;
}
let currentUser = null;
let _passwordRecoveryActive = false;
let _authInitResolve;
const _authInitReady = new Promise(r => { _authInitResolve = r; });

function clearAuthCallbackFromUrl() {
  try {
    history.replaceState(history.state, '', window.location.pathname);
  } catch (e) {}
}

function beginPasswordRecovery(session) {
  if (_passwordRecoveryActive) return;
  _passwordRecoveryActive = true;
  currentUser = session?.user || currentUser;
  clearAuthCallbackFromUrl();
  document.getElementById('inviteGate')?.classList.remove('open');
  const show = () => {
    openResetPasswordModal();
    updateDesktopTopbarAuth();
    if (document.getElementById('profileScreen')?.classList.contains('active')) renderProfile();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show, { once: true });
  } else {
    requestAnimationFrame(show);
  }
}

async function resolveAuthCallbackFromUrl() {
  if (!_authRecoveryFromUrl && !_authCodeInUrl && !_authHashTokenInUrl) return;

  const { hash, query } = parseAuthUrlParams();
  let session = null;

  if (query.get('code')) {
    const { data, error } = await supa.auth.exchangeCodeForSession(query.get('code'));
    if (error) {
      showToast('Reset link expired or invalid — request a new one.', 'error');
      clearAuthCallbackFromUrl();
      return;
    }
    session = data?.session || null;
  } else if (hash.get('access_token') && hash.get('refresh_token')) {
    const { data, error } = await supa.auth.setSession({
      access_token: hash.get('access_token'),
      refresh_token: hash.get('refresh_token')
    });
    if (error) {
      showToast('Reset link expired or invalid — request a new one.', 'error');
      clearAuthCallbackFromUrl();
      return;
    }
    session = data?.session || null;
  } else {
    const { data } = await supa.auth.getSession();
    session = data?.session || null;
  }

  if (_authRecoveryFromUrl && session) {
    beginPasswordRecovery(session);
  } else if (_authRecoveryFromUrl) {
    showToast('Reset link expired — request a new one.', 'error');
    clearAuthCallbackFromUrl();
  }
}

// Auth state listener
supa.auth.onAuthStateChange(async (event, session) => {
  if (event === 'INITIAL_SESSION') _authInitResolve?.();
  if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && _authRecoveryFromUrl && !_passwordRecoveryActive)) {
    beginPasswordRecovery(session);
    return;
  }
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    _userProfile = null;
    _cratePendingSaves.clear();
    crate = [];
    resetGuestSwipeState();
    renderCrate();
    renderProfile();
    renderDiscoverHint();
    if (isDiscoverScreenActive()) renderCard();
    updateDesktopTopbarAuth();
    return;
  }
  currentUser = session?.user || null;
  if (event === 'TOKEN_REFRESHED') {
    console.log('[BeatSwipe] Token auto-refreshed ✓');
    return;
  }
  renderProfile();
  updateDesktopTopbarAuth();
  if (currentUser) {
    if (event === 'SIGNED_IN' && _pendingGuestCrateMerge?.length) {
      const guestCrate = _pendingGuestCrateMerge;
      _pendingGuestCrateMerge = null;
      await syncCrateFromDB();
      guestCrate.forEach(b => { if (!crate.find(i => i.id === b.id)) crate.push(b); });
      for (const b of guestCrate) await saveBeatToDB(b);
    } else if (event !== 'TOKEN_REFRESHED') {
      await syncCrateFromDB();
    }
    restoreSkippedState();
    saveSkippedState();
    await loadUserProfile();
    renderCrate();
    renderDiscoverHint();
    if (isDiscoverScreenActive()) renderCard();
  }
});

// ─── PROFILE RENDER ───────────────────────────────────────────────────────
let authMode = 'login'; // 'login' | 'signup' | 'forgot'

function openResetPasswordModal() {
  const msg = document.getElementById('resetPassMsg');
  if (msg) { msg.className = 'auth-msg'; msg.textContent = ''; }
  const newEl = document.getElementById('resetPassNew');
  const confirmEl = document.getElementById('resetPassConfirm');
  if (newEl) newEl.value = '';
  if (confirmEl) confirmEl.value = '';
  document.getElementById('resetPasswordModal')?.classList.add('open');
}

function closeResetPasswordModal() {
  document.getElementById('resetPasswordModal')?.classList.remove('open');
}

function closeResetIfBackdrop(e) {
  if (e.target === document.getElementById('resetPasswordModal')) closeResetPasswordModal();
}

let _userProfile = null; // cached profile data
let _profileFormSnapshot = null;

function getProfileFormState() {
  const nameEl = document.getElementById('ep-name');
  if (!nameEl) return null;
  return {
    producer_name: document.getElementById('ep-name')?.value?.trim() || '',
    bio: document.getElementById('ep-bio')?.value?.trim() || '',
    instagram: document.getElementById('ep-instagram')?.value?.trim() || '',
    soundcloud: document.getElementById('ep-soundcloud')?.value?.trim() || '',
    beatstars: document.getElementById('ep-beatstars')?.value?.trim() || '',
    youtube: document.getElementById('ep-youtube')?.value?.trim() || '',
  };
}

function captureProfileFormSnapshot() {
  _profileFormSnapshot = getProfileFormState();
  updateProfileUnsavedHint();
}

function isProfileDirty() {
  if (!_profileFormSnapshot) return false;
  const cur = getProfileFormState();
  if (!cur) return false;
  return Object.keys(cur).some(k => cur[k] !== (_profileFormSnapshot[k] || ''));
}

function updateProfileUnsavedHint() {
  const hint = document.getElementById('profileUnsavedHint');
  if (hint) hint.classList.toggle('visible', isProfileDirty());
}

function confirmDiscardProfileChanges() {
  if (!isProfileDirty()) return true;
  return confirm('You have unsaved profile changes. Discard them?');
}

function bindProfileFormWatch() {
  ['ep-name', 'ep-bio', 'ep-instagram', 'ep-soundcloud', 'ep-beatstars', 'ep-youtube'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el._profileWatch) return;
    el._profileWatch = true;
    el.addEventListener('input', updateProfileUnsavedHint);
  });
}

async function loadUserProfile() {
  if (!currentUser) return;
  const token = await getAccessToken();
  if (!token) return;
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${currentUser.id}&limit=1`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPA_KEY,
        'Accept': 'application/json'
      }
    });
    if (res.ok) {
      const rows = await res.json();
      _userProfile = rows[0] || {};
    }
  } catch(e) {
    _userProfile = {};
  }
  renderProfile();
}

function getAvatarHTML() {
  let inner;
  if (_userProfile?.avatar_url) {
    inner = `<img src="${escHtml(_userProfile.avatar_url)}" class="profile-hero-avatar" alt="">`;
  } else {
    const initials = (_userProfile?.producer_name || currentUser?.email || '?')[0].toUpperCase();
    inner = `<div class="profile-hero-avatar-fallback">${escHtml(initials)}</div>`;
  }
  return `<div class="profile-hero-avatar-clip">${inner}</div>`;
}

function profileDesktopSide() {
  return isDesktop() && window.matchMedia('(min-width: 1100px)').matches;
}

function renderProfileSidePanel() {
  const panel = document.getElementById('profileSidePanel');
  if (!panel) return;
  if (!profileDesktopSide() || !currentUser || !_userProfile?.producer_name) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const linkHTML = typeof buildMyPageLinkBoxHTML === 'function' ? buildMyPageLinkBoxHTML() : '';
  if (!linkHTML) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `
    <div class="profile-side-card">
      ${linkHTML}
      <p class="profile-side-tip">Share this link in your Instagram bio so fans can swipe your beats.</p>
    </div>`;
}

function renderProfile() {
  const wrap = document.getElementById('profileWrap');
  if (!wrap) return;
  const activeTab = wrap._activeTab || 'profile';
  wrap.classList.toggle('profile-wrap--guest', !currentUser);

  if (currentUser) {
    const p = _userProfile || {};
    const displayName = p.producer_name || currentUser.email.split('@')[0];
    const slug = p.producer_name ? portfolioSlugFromName(p.producer_name) : '';
    const heroLink = slug ? `beatswipe.app/p/${escHtml(slug)}` : '';
    const sidebarLink = profileDesktopSide() && p.producer_name;
    const heroActions = p.producer_name ? `
          <div class="profile-hero-link-row">
            <span class="profile-live-badge"><i class="ti ti-circle-filled"></i> Live</span>
            <span class="profile-hero-link">${heroLink}</span>
          </div>
          ${sidebarLink ? '' : `<div class="profile-hero-actions">
            <button type="button" class="btn-primary profile-hero-btn-main" onclick="copyPortfolioLink(event)"><i class="ti ti-link"></i> Copy bio link</button>
            <div class="profile-hero-actions-row">
              <button type="button" class="btn-secondary" onclick="goTo('submitScreen','navSubmit')"><i class="ti ti-layout-grid"></i> My Page</button>
              <button type="button" class="btn-secondary" onclick="previewMyPage()"><i class="ti ti-eye"></i> Preview</button>
            </div>
          </div>`}` : `
          <div class="profile-hero-hint"><i class="ti ti-info-circle"></i> Set your producer name below to unlock your bio link.</div>`;
    wrap.innerHTML = `
      <div class="profile-hero profile-glass">
        <div class="profile-hero-avatar-wrap" onclick="document.getElementById('avatarFileInput').click()">
          ${getAvatarHTML()}
          <div class="profile-hero-camera"><i class="ti ti-camera"></i></div>
          <input type="file" id="avatarFileInput" accept="image/*" style="display:none" onchange="uploadAvatar(event)">
        </div>
        <div class="profile-hero-body">
          <div class="profile-hero-name">${escHtml(displayName)}</div>
          <div class="profile-hero-email">${escHtml(currentUser.email)}</div>
          ${heroActions}
        </div>
      </div>

      <div class="profile-tabs">
        <button class="profile-tab ${activeTab==='profile'?'active':''}" onclick="switchProfileTab('profile')">
          <i class="ti ti-user"></i> Profile
        </button>
        <button class="profile-tab ${activeTab==='settings'?'active':''}" onclick="switchProfileTab('settings')">
          <i class="ti ti-settings"></i> Settings
        </button>
      </div>

      <div class="profile-tab-content ${activeTab==='profile'?'active':''}" id="ptProfile">
        <div class="profile-section-wrap">
          <div class="profile-section-title">Identity <span class="profile-section-hint">shown on your swipe page</span></div>
          <div class="profile-section profile-glass">
            <div class="field-group">
              <label class="field-label">Producer name</label>
              <input type="text" id="ep-name" value="${escHtml(p.producer_name||'')}" placeholder="Your producer alias">
            </div>
            <div class="field-group">
              <label class="field-label">Bio</label>
              <textarea id="ep-bio" placeholder="Tell artists about your sound...">${escHtml(p.bio||'')}</textarea>
            </div>
          </div>
        </div>
        <div class="profile-section-wrap">
          <div class="profile-section-title">Links</div>
          <div class="profile-section profile-glass">
            <div class="profile-social-grid">
              <div class="social-field">
                <i class="ti ti-brand-instagram"></i>
                <input type="text" id="ep-instagram" value="${escHtml(p.instagram||'')}" placeholder="@username">
              </div>
              <div class="social-field">
                <i class="ti ti-brand-soundcloud"></i>
                <input type="text" id="ep-soundcloud" value="${escHtml(p.soundcloud||'')}" placeholder="soundcloud.com/...">
              </div>
              <div class="social-field">
                <i class="ti ti-music"></i>
                <input type="text" id="ep-beatstars" value="${escHtml(p.beatstars||'')}" placeholder="beatstars.com/...">
              </div>
              <div class="social-field">
                <i class="ti ti-brand-youtube"></i>
                <input type="text" id="ep-youtube" value="${escHtml(p.youtube||'')}" placeholder="youtube.com/...">
              </div>
            </div>
          </div>
        </div>
        <div class="profile-form-footer">
          <button class="save-profile-btn" onclick="saveProfile()" id="saveProfileBtn">
            <i class="ti ti-check"></i> Save profile
          </button>
          <div class="profile-unsaved-hint" id="profileUnsavedHint"><i class="ti ti-alert-circle"></i> Unsaved changes</div>
          <div class="profile-saved-msg" id="profileSavedMsg">✓ Profile saved!</div>
        </div>
      </div>

      <div class="profile-tab-content ${activeTab==='settings'?'active':''}" id="ptSettings">
        <button type="button" class="profile-settings-card profile-stat-card profile-stat-card--clickable" onclick="goTo('crateScreen','navCrate')">
          <div class="profile-stat-body">
            <div class="profile-stat-top">
              <span class="profile-stat-label">Favorites</span>
              <span class="crate-sync-badge">synced</span>
            </div>
            <div class="profile-stat-value">${crate.length} beat${crate.length===1?'':'s'}</div>
          </div>
          <i class="ti ti-chevron-right profile-stat-chevron"></i>
        </button>

        <div class="profile-settings-scroll-hint"><i class="ti ti-chevron-down"></i> Scroll for account &amp; sign out</div>

        <div class="profile-settings-card profile-glass">
          <div class="profile-settings-title"><i class="ti ti-mail"></i> New beats by email</div>
          <div class="profile-settings-desc">Be the first to know when new beats drop.</div>
          <div class="profile-newsletter-row">
            <input type="email" id="nlEmail" value="${escHtml(currentUser.email)}" placeholder="your@email.com">
            <button type="button" onclick="subscribeNewsletter()" id="nlBtn">Subscribe</button>
          </div>
          <div class="auth-dsgvo-row">
            <div class="auth-dsgvo-box" onclick="toggleNlDsgvo()" id="nlDsgvoBox">
              <i class="ti ti-check"></i>
              <input type="checkbox" id="nlDsgvo" style="display:none">
            </div>
            <label class="auth-dsgvo-label" onclick="toggleNlDsgvo()">
              I agree to receive beat updates by email per the <a onclick="event.stopPropagation();openInfoModal('privacyModal')">Privacy Policy</a>. Unsubscribe anytime via email.
            </label>
          </div>
          <div class="profile-nl-msg" id="nlMsg"></div>
        </div>

        <div class="profile-settings-card profile-glass profile-account-section">
          <div class="profile-account-label">Account</div>
          <button type="button" class="profile-action-btn" onclick="clearLocalData()">
            <i class="ti ti-trash"></i> Clear local data
          </button>
          <button type="button" class="logout-btn" style="margin-top:0" onclick="signOut()"><i class="ti ti-logout"></i> Sign out</button>
        </div>

        <div class="legal-links">
          <a class="legal-link" onclick="openInfoModal('impressumModal')">Legal Notice <i class="ti ti-chevron-right"></i></a>
          <a class="legal-link" onclick="openInfoModal('privacyModal')">Privacy Policy <i class="ti ti-chevron-right"></i></a>
          <a class="legal-link" href="mailto:hellobeatswipe@gmail.com">Contact <i class="ti ti-mail"></i></a>
        </div>
      </div>
    `;
    wrap._activeTab = activeTab;
    updateDesktopTopbarAuth();
    captureProfileFormSnapshot();
    bindProfileFormWatch();
    renderProfileSidePanel();
  } else {
    _profileFormSnapshot = null;
    wrap.innerHTML = `
      <div class="profile-guest-scroll">
        <div class="profile-guest-header profile-glass">
          <div class="profile-guest-icon"><i class="ti ti-user-circle"></i></div>
          <div class="profile-guest-title">Join BeatSwipe</div>
          <div class="profile-guest-sub">Sync Favorites across devices and build your swipe page.</div>
        </div>
        <div class="auth-box profile-glass">
          ${authMode === 'forgot' ? `
          <div class="auth-title">Reset password</div>
          <div class="auth-sub">Enter your account email. We'll send you a link to choose a new password.</div>
          <div class="auth-field">
            <input type="email" id="authEmail" placeholder="your@email.com" style="width:100%">
          </div>
          <button class="auth-btn" onclick="handleForgotPassword()" id="authBtn">
            <i class="ti ti-mail"></i> Send reset link
          </button>
          <button type="button" class="auth-back-link" onclick="setAuthMode('login')">← Back to sign in</button>
          <div class="auth-msg" id="authMsg"></div>
          ` : `
          <div class="profile-tabs profile-tabs--auth">
            <button class="profile-tab ${authMode==='login'?'active':''}" onclick="setAuthMode('login')">Sign in</button>
            <button class="profile-tab ${authMode==='signup'?'active':''}" onclick="setAuthMode('signup')">Sign up</button>
          </div>
          <div class="auth-field">
            <input type="email" id="authEmail" placeholder="your@email.com" style="width:100%">
          </div>
          <div class="auth-field">
            <input type="password" id="authPass" placeholder="Password" style="width:100%">
          </div>
          ${authMode === 'login' ? `<button type="button" class="auth-forgot-link" onclick="setAuthMode('forgot')">Forgot password?</button>` : ''}
          ${authMode === 'signup' ? `
          <div class="auth-dsgvo-row">
            <div class="auth-dsgvo-box" onclick="toggleDsgvo()" id="dsgvoBox">
              <i class="ti ti-check" id="dsgvoCheck"></i>
              <input type="checkbox" id="authDsgvo" style="display:none">
            </div>
            <label class="auth-dsgvo-label" onclick="toggleDsgvo()">
              I accept the <a onclick="event.stopPropagation();openInfoModal('privacyModal')">Privacy Policy</a> and agree that my email address will be stored.
            </label>
          </div>` : ''}
          <button class="auth-btn" onclick="handleAuth()" id="authBtn">
            <i class="ti ti-arrow-right"></i> ${authMode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <div class="auth-msg" id="authMsg"></div>
          `}
        </div>
        <div class="auth-box profile-glass profile-guest-newsletter">
          <div class="auth-title"><i class="ti ti-mail"></i> New beats by email</div>
          <div class="auth-sub">Be the first to know when new beats drop.</div>
          <div class="auth-field">
            <input type="email" id="nlEmail" placeholder="your@email.com" style="width:100%">
          </div>
          <div class="auth-dsgvo-row">
            <div class="auth-dsgvo-box" onclick="toggleNlDsgvo()" id="nlDsgvoBox">
              <i class="ti ti-check"></i>
              <input type="checkbox" id="nlDsgvo" style="display:none">
            </div>
            <label class="auth-dsgvo-label" onclick="toggleNlDsgvo()">
              I agree to receive beat updates by email per the <a onclick="event.stopPropagation();openInfoModal('privacyModal')">Privacy Policy</a>. Unsubscribe anytime via email.
            </label>
          </div>
          <button type="button" class="auth-btn" onclick="subscribeNewsletter()" id="nlBtn">Subscribe</button>
          <div class="profile-nl-msg" id="nlMsg"></div>
        </div>
        <div class="legal-links">
          <a class="legal-link" onclick="openInfoModal('impressumModal')">Legal Notice <i class="ti ti-chevron-right"></i></a>
          <a class="legal-link" onclick="openInfoModal('privacyModal')">Privacy Policy <i class="ti ti-chevron-right"></i></a>
          <a class="legal-link" href="mailto:hellobeatswipe@gmail.com">Contact <i class="ti ti-mail"></i></a>
        </div>
      </div>
    `;
    updateDesktopTopbarAuth();
    renderProfileSidePanel();
  }
}

function switchProfileTab(tab) {
  const wrap = document.getElementById('profileWrap');
  if (!wrap) return;
  const activeTab = wrap._activeTab || 'profile';
  if (activeTab === 'profile' && tab !== 'profile' && !confirmDiscardProfileChanges()) return;
  wrap._activeTab = tab;
  renderProfile();
}

function setAuthMode(mode) {
  authMode = mode;
  renderProfile();
}

async function handleAuth() {
  const email = document.getElementById('authEmail')?.value.trim();
  const pass = document.getElementById('authPass')?.value;
  const btn = document.getElementById('authBtn');
  const msg = document.getElementById('authMsg');
  if (!email || !pass) { if(msg) msg.textContent = 'Please fill in all fields.'; return; }
  if (authMode === 'signup') {
    const dsgvo = document.getElementById('authDsgvo');
    if (!dsgvo?.checked) {
      if(msg) { msg.className = 'auth-msg error'; msg.textContent = 'Please accept the Privacy Policy to continue.'; }
      return;
    }
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Loading...'; }

  if (!currentUser && crate.length) _pendingGuestCrateMerge = [...crate];

  let error;
  if (authMode === 'login') {
    ({ error } = await supa.auth.signInWithPassword({ email, password: pass }));
  } else {
    ({ error } = await supa.auth.signUp({ email, password: pass }));
  }

  if (error) {
    _pendingGuestCrateMerge = null;
    if (msg) { msg.className = 'auth-msg error'; msg.textContent = error.message; }
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="ti ti-arrow-right"></i> ${authMode === 'login' ? 'Sign in' : 'Create account'}`; }
  } else if (authMode === 'signup') {
    if (msg) { msg.className = 'auth-msg success'; msg.textContent = 'Check your email to confirm your account!'; }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-arrow-right"></i> Create account'; }
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('authEmail')?.value.trim();
  const btn = document.getElementById('authBtn');
  const msg = document.getElementById('authMsg');
  if (!email || !email.includes('@')) {
    if (msg) { msg.className = 'auth-msg error'; msg.textContent = 'Please enter a valid email address.'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Sending...'; }
  const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: getAuthRedirectUrl() });
  if (error) {
    if (msg) { msg.className = 'auth-msg error'; msg.textContent = error.message; }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail"></i> Send reset link'; }
    return;
  }
  if (msg) { msg.className = 'auth-msg success'; msg.textContent = 'Check your email for the reset link.'; }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail"></i> Send reset link'; }
}

async function handleResetPassword() {
  const pass = document.getElementById('resetPassNew')?.value;
  const confirm = document.getElementById('resetPassConfirm')?.value;
  const btn = document.getElementById('resetPassBtn');
  const msg = document.getElementById('resetPassMsg');
  if (!pass || pass.length < 6) {
    if (msg) { msg.className = 'auth-msg error'; msg.textContent = 'Password must be at least 6 characters.'; }
    return;
  }
  if (pass !== confirm) {
    if (msg) { msg.className = 'auth-msg error'; msg.textContent = 'Passwords do not match.'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Updating...'; }
  const { error } = await supa.auth.updateUser({ password: pass });
  if (error) {
    if (msg) { msg.className = 'auth-msg error'; msg.textContent = error.message; }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Update password'; }
    return;
  }
  _passwordRecoveryActive = false;
  closeResetPasswordModal();
  showToast('Password updated!', 'success');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Update password'; }
  if (currentUser) {
    await syncCrateFromDB();
    await loadUserProfile();
    renderProfile();
  }
}

async function signOut() {
  const btn = document.querySelector('.logout-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Signing out...'; }

  // Manually clear Supabase session from localStorage — most reliable method
  try {
    const storageKey = `sb-${SUPA_URL.split('//')[1].split('.')[0]}-auth-token`;
    localStorage.removeItem(storageKey);
    // Also clear any other supabase keys
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sb-')) localStorage.removeItem(k);
    });
  } catch(e) {}

  // Also tell Supabase server (best effort, don't wait too long)
  try {
    await Promise.race([
      supa.auth.signOut(),
      new Promise(r => setTimeout(r, 2000))
    ]);
  } catch(e) {}

  currentUser = null;
  _userProfile = null;
  _myPendingBeatsCache = null;
  _myPendingBeatsCacheAt = 0;
  _pendingGuestCrateMerge = null;
  _cratePendingSaves.clear();
  crate = [];
  resetGuestSwipeState();
  renderCrate();
  renderProfile();
  renderDiscoverHint();
  if (isDiscoverScreenActive()) renderCard();
  updateDesktopTopbarAuth();
}

// ─── CRATE SYNC ───────────────────────────────────────────────────────────
// ─── PROFILE SAVE / AVATAR ────────────────────────────────────────────────
function getStoredAuthSession() {
  try {
    const storageKey = `sb-${SUPA_URL.split('//')[1].split('.')[0]}-auth-token`;
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    return null;
  }
}

function isAccessTokenFresh(parsed) {
  if (!parsed?.access_token || !parsed?.expires_at) return false;
  return parsed.expires_at > Math.floor(Date.now() / 1000) + 60;
}

async function getAccessToken() {
  const parsed = getStoredAuthSession();
  if (isAccessTokenFresh(parsed)) return parsed.access_token;

  try {
    const { data } = await Promise.race([
      supa.auth.getSession(),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 4000))
    ]);
    if (data?.session?.access_token) return data.session.access_token;
  } catch (e) {}

  if (parsed?.refresh_token) {
    try {
      const { data, error } = await Promise.race([
        supa.auth.refreshSession({ refresh_token: parsed.refresh_token }),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 4000))
      ]);
      if (!error && data?.session?.access_token) return data.session.access_token;
    } catch (e) {}
  }

  return parsed?.access_token || null;
}

async function saveProfile() {
  if (!currentUser) return;
  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Saving...';

  const token = await getAccessToken();
  if (!token) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-check"></i> Save profile';
    showToast('Session expired — please sign in again.', 'error');
    return;
  }

  const updates = {
    id: currentUser.id,
    producer_name: document.getElementById('ep-name')?.value.trim() || null,
    bio:           document.getElementById('ep-bio')?.value.trim() || null,
    instagram:     document.getElementById('ep-instagram')?.value.trim() || null,
    soundcloud:    document.getElementById('ep-soundcloud')?.value.trim() || null,
    beatstars:     document.getElementById('ep-beatstars')?.value.trim() || null,
    youtube:       document.getElementById('ep-youtube')?.value.trim() || null,
    updated_at:    new Date().toISOString()
  };

  try {
    // Direct REST API call — bypasses SDK completely
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

    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-check"></i> Save profile';

    if (res.ok) {
      _userProfile = { ..._userProfile, ...updates };
      const msg = document.getElementById('profileSavedMsg');
      if (msg) { msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 3000); }
      showToast('Profile saved!', 'success');
      renderProfile();
      captureProfileFormSnapshot();
    } else {
      const errText = await res.text();
      showToast('Error saving profile. Please try again.', 'error', 3600);
    }
  } catch(e) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-check"></i> Save profile';
    showToast('Error: ' + e.message, 'error', 3600);
  }
}

// ─── AVATAR CROP ──────────────────────────────────────────────────────────
let _cropFile = null;
let _cropScale = 1;
let _cropOffsetX = 0, _cropOffsetY = 0;
let _cropDragging = false;
let _cropLastX = 0, _cropLastY = 0;
let _cropNaturalW = 0, _cropNaturalH = 0;

function openCrop(file) {
  _cropFile = file;
  _cropScale = 1;
  _cropOffsetX = 0;
  _cropOffsetY = 0;

  const img = document.getElementById('cropImg');
  const url = URL.createObjectURL(file);
  img.onload = () => {
    _cropNaturalW = img.naturalWidth;
    _cropNaturalH = img.naturalHeight;
    // Fit image to fill the 280px circle initially
    const minSide = Math.min(_cropNaturalW, _cropNaturalH);
    const baseScale = 280 / minSide;
    _cropScale = baseScale;
    document.getElementById('cropZoom').min = baseScale;
    document.getElementById('cropZoom').max = baseScale * 3;
    document.getElementById('cropZoom').step = baseScale * 0.01;
    document.getElementById('cropZoom').value = baseScale;
    updateCropTransform();
  };
  img.src = url;
  document.getElementById('cropBackdrop').classList.add('open');
  document.getElementById('cropZoom').oninput = e => {
    _cropScale = parseFloat(e.target.value);
    updateCropTransform();
  };
}

function updateCropTransform() {
  const img = document.getElementById('cropImg');
  const w = _cropNaturalW * _cropScale;
  const h = _cropNaturalH * _cropScale;
  // Clamp so image always covers the circle
  const maxOffX = (w - 280) / 2;
  const maxOffY = (h - 280) / 2;
  _cropOffsetX = Math.max(-maxOffX, Math.min(maxOffX, _cropOffsetX));
  _cropOffsetY = Math.max(-maxOffY, Math.min(maxOffY, _cropOffsetY));
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  img.style.left = (140 - w/2 + _cropOffsetX) + 'px';
  img.style.top  = (140 - h/2 + _cropOffsetY) + 'px';
}

function closeCrop() {
  document.getElementById('cropBackdrop').classList.remove('open');
  _cropFile = null;
  document.getElementById('avatarFileInput').value = '';
}

async function confirmCrop() {
  // Draw cropped circle to canvas
  const canvas = document.createElement('canvas');
  canvas.width = 280; canvas.height = 280;
  const ctx = canvas.getContext('2d');
  // Clip to circle; purple fill + slight bleed avoids dark fringe at edge
  ctx.beginPath();
  ctx.arc(140, 140, 140, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#7C3AED';
  ctx.fillRect(0, 0, 280, 280);

  const img = document.getElementById('cropImg');
  const bleed = 1.08;
  const w = _cropNaturalW * _cropScale * bleed;
  const h = _cropNaturalH * _cropScale * bleed;
  const x = 140 - w / 2 + _cropOffsetX;
  const y = 140 - h / 2 + _cropOffsetY;
  ctx.drawImage(img, x, y, w, h);

  canvas.toBlob(async blob => {
    document.getElementById('cropBackdrop').classList.remove('open');
    // Upload the cropped blob
    await doAvatarUpload(blob);
  }, 'image/jpeg', 0.92);
}

// Touch & mouse drag for crop
(function() {
  function getContainer() { return document.getElementById('cropContainer'); }

  function onDown(x, y) {
    _cropDragging = true;
    _cropLastX = x; _cropLastY = y;
  }
  function onMove(x, y) {
    if (!_cropDragging) return;
    _cropOffsetX += x - _cropLastX;
    _cropOffsetY += y - _cropLastY;
    _cropLastX = x; _cropLastY = y;
    updateCropTransform();
  }
  function onUp() { _cropDragging = false; }

  document.addEventListener('mousedown', e => { if (e.target.closest('#cropContainer')) onDown(e.clientX, e.clientY); });
  document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchstart', e => { if (e.target.closest('#cropContainer')) onDown(e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
  document.addEventListener('touchmove', e => { if (_cropDragging) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); } }, {passive:false});
  document.addEventListener('touchend', onUp);
})();

async function uploadAvatar(e) {
  const file = e.target.files?.[0];
  if (!file || !currentUser) return;
  if (file.size > 10 * 1024 * 1024) { showToast('Max file size is 10 MB.', 'error'); return; }
  // Open crop dialog instead of uploading directly
  openCrop(file);
}

async function doAvatarUpload(blob) {
  if (!currentUser) return;

  const token = await getAccessToken();
  if (!token) { showToast('Please sign in again.', 'error'); return; }

  const fileName = `${currentUser.id}.jpg`;

  try {
    const uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/avatars/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-upsert': 'true',
        'Cache-Control': '3600',
        'Content-Type': 'image/jpeg'
      },
      body: blob
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      // If jpeg not supported, retry as png
      if (err.includes('invalid_mime_type')) {
        const pngBlob = await new Promise(r => { const c = document.createElement('canvas'); c.width=280; c.height=280; const ctx=c.getContext('2d'); const img=document.getElementById('cropImg'); ctx.beginPath(); ctx.arc(140,140,140,0,Math.PI*2); ctx.clip(); const w=_cropNaturalW*_cropScale, h=_cropNaturalH*_cropScale, x=140-w/2+_cropOffsetX, y=140-h/2+_cropOffsetY; ctx.drawImage(img,x,y,w,h); c.toBlob(r,'image/png'); });
        const retry = await fetch(`${SUPA_URL}/storage/v1/object/avatars/${fileName.replace('.jpg','.png')}`, { method:'POST', headers:{'Authorization':`Bearer ${token}`,'x-upsert':'true','Cache-Control':'3600','Content-Type':'image/png'}, body: pngBlob });
        if (!retry.ok) { showToast('Avatar upload failed. Please try again.', 'error'); return; }
        const avatarUrl2 = `${SUPA_URL}/storage/v1/object/public/avatars/${fileName.replace('.jpg','.png')}?t=${Date.now()}`;
        await fetch(`${SUPA_URL}/rest/v1/profiles`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':SUPA_KEY,'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({ id: currentUser.id, avatar_url: avatarUrl2, updated_at: new Date().toISOString() }) });
        _userProfile = { ..._userProfile, avatar_url: avatarUrl2 }; renderProfile(); return;
      }
      showToast('Avatar upload failed. Please try again.', 'error'); return;
    }

    const avatarUrl = `${SUPA_URL}/storage/v1/object/public/avatars/${fileName}?t=${Date.now()}`;

    await fetch(`${SUPA_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPA_KEY,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ id: currentUser.id, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    });

    _userProfile = { ..._userProfile, avatar_url: avatarUrl };
    renderProfile();
    showToast('Avatar updated!', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error', 3600);
  }
}

async function syncCrateFromDB() {
  if (!currentUser) return;
  if (_crateSyncInFlight) return _crateSyncInFlight;
  _crateSyncInFlight = (async () => {
    const token = await getAccessToken();
    if (!token) {
      console.warn('syncCrateFromDB: no access token');
      return;
    }
    try {
      const res = await fetch(`/api/crate?_ts=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('syncCrateFromDB failed:', res.status, data.error || data);
        return;
      }
      const fromDb = Array.isArray(data.beats) ? data.beats.filter(b => b?.id) : [];
      crate = fromDb;
      _cratePendingSaves.forEach((beat, id) => {
        if (!crate.find(b => b.id === id)) crate.push(beat);
      });
      await flushPendingCrateSaves();
      renderCrate();
      renderCard();
    } catch (e) { console.warn('syncCrateFromDB error:', e); }
    finally { _crateSyncInFlight = null; }
  })();
  return _crateSyncInFlight;
}

async function saveBeatToDB(beat) {
  if (!currentUser || !beat?.id) return false;
  _cratePendingSaves.set(beat.id, beat);
  const token = await getAccessToken();
  if (!token) {
    console.warn('saveBeatToDB: no access token');
    return false;
  }
  try {
    const res = await fetch('/api/crate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ beat })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      _cratePendingSaves.delete(beat.id);
      return true;
    }
    console.warn('saveBeatToDB failed:', res.status, data.error || data, data.hint || '');
    if (res.status === 401) showToast('Session expired — sign in again.', 'error');
    return false;
  } catch (e) {
    console.warn('saveBeatToDB error:', e);
    return false;
  }
}

async function flushPendingCrateSaves() {
  for (const beat of [..._cratePendingSaves.values()]) {
    await saveBeatToDB(beat);
  }
}

// ─── DISCOVER SEARCH ──────────────────────────────────────────────────────
function onDiscoverSearch(val) {
  _discoverSearch = val;
  const clear = document.getElementById('discoverSearchClear');
  if (clear) clear.classList.toggle('visible', !!val.trim());
  catIdx[cat] = 0;
  renderCard();
}

function clearDiscoverSearch() {
  const input = document.getElementById('discoverSearchInput');
  if (input) input.value = '';
  onDiscoverSearch('');
}

// ─── FILTER MODAL ─────────────────────────────────────────────────────────
let activeGenre = 'all';

function openFilterModal() {
  document.getElementById('filterModal').classList.add('open');
}
function closeFilterModal() {
  document.getElementById('filterModal').classList.remove('open');
}
function closeFilterIfBackdrop(e) {
  if (e.target === document.getElementById('filterModal')) closeFilterModal();
}

// ─── SHEET DRAG-TO-DISMISS (mobile bottom sheets) ─────────────────────────
function isBottomSheetBackdrop(backdrop) {
  if (!backdrop || !isMobileUI()) return false;
  return getComputedStyle(backdrop).alignItems === 'flex-end';
}

function initSheetDragDismiss({ backdrop, sheet, onClose, dismissThreshold = 96, velocityThreshold = 720 }) {
  if (!backdrop || !sheet || typeof onClose !== 'function') return;

  let dragging = false;
  let dismissing = false;
  let startY = 0;
  let curY = 0;
  let velocity = 0;
  let lastY = 0;
  let lastT = 0;
  let scrollEl = null;
  let scrimBase = 0.65;

  const BLOCK_SEL = 'button,a,input,select,textarea,.filter-pill,.modal-apply,.onboard-btn,.onboard-skip,.modal-close';

  function readScrimBase() {
    const parts = getComputedStyle(backdrop).backgroundColor.match(/[\d.]+/g);
    if (parts?.length >= 4) scrimBase = parseFloat(parts[3]);
  }

  function getScrollableFrom(target) {
    const el = target.closest('.info-modal-body, .modal-body');
    if (el && el.scrollHeight > el.clientHeight + 2) return el;
    return null;
  }

  function dimBackdrop(dy) {
    const ratio = Math.max(0.12, 1 - dy / 360);
    backdrop.style.backgroundColor = `rgba(0, 0, 0, ${scrimBase * ratio})`;
  }

  function resetSheetStyles() {
    sheet.style.transition = '';
    sheet.style.transform = '';
    sheet.style.opacity = '';
    sheet.style.willChange = '';
    sheet.classList.remove('sheet-dragging');
    backdrop.style.transition = '';
    backdrop.style.backgroundColor = '';
    dragging = false;
    curY = 0;
    velocity = 0;
    scrollEl = null;
  }

  function finishDismiss() {
    if (dismissing) return;
    dismissing = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      resetSheetStyles();
      onClose();
      dismissing = false;
      return;
    }
    sheet.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease';
    sheet.style.transform = 'translateY(100%)';
    sheet.style.opacity = '0';
    backdrop.style.transition = 'background-color 0.28s ease';
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    const done = () => {
      resetSheetStyles();
      onClose();
      dismissing = false;
    };
    sheet.addEventListener('transitionend', e => {
      if (e.target === sheet && e.propertyName === 'transform') done();
    }, { once: true });
    setTimeout(done, 340);
  }

  function snapBack() {
    if (curY < 2) {
      resetSheetStyles();
      return;
    }
    sheet.style.transition = 'transform 0.32s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease';
    backdrop.style.transition = 'background-color 0.28s ease';
    sheet.style.transform = '';
    sheet.style.opacity = '';
    backdrop.style.backgroundColor = '';
    const done = () => resetSheetStyles();
    sheet.addEventListener('transitionend', e => {
      if (e.target === sheet && e.propertyName === 'transform') done();
    }, { once: true });
    setTimeout(done, 360);
  }

  function onPointerDown(e) {
    if (!backdrop.classList.contains('open') || !isBottomSheetBackdrop(backdrop) || dismissing) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest(BLOCK_SEL)) return;
    if (e.target.closest('.info-modal-body')) return;

    scrollEl = getScrollableFrom(e.target);
    if (scrollEl && scrollEl.scrollTop > 2) return;

    dragging = true;
    startY = e.clientY;
    lastY = startY;
    lastT = performance.now();
    curY = 0;
    velocity = 0;
    readScrimBase();
    sheet.classList.add('sheet-dragging');
    sheet.style.transition = 'none';
    sheet.style.animation = 'none';
    sheet.style.willChange = 'transform';
    backdrop.style.transition = 'none';
    sheet.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (dy < 0) {
      if (scrollEl) {
        dragging = false;
        resetSheetStyles();
        try { sheet.releasePointerCapture(e.pointerId); } catch (_) {}
        return;
      }
      curY = 0;
      sheet.style.transform = '';
      dimBackdrop(0);
      return;
    }

    curY = dy;
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    if (dt > 0 && dt < 0.1) velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = now;

    sheet.style.transform = `translateY(${dy}px)`;
    dimBackdrop(dy);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    try { sheet.releasePointerCapture(e.pointerId); } catch (_) {}

    if (curY >= dismissThreshold || velocity >= velocityThreshold) finishDismiss();
    else snapBack();
  }

  sheet.addEventListener('pointerdown', onPointerDown);
  sheet.addEventListener('pointermove', onPointerMove);
  sheet.addEventListener('pointerup', onPointerUp);
  sheet.addEventListener('pointercancel', onPointerUp);

  const obs = new MutationObserver(() => {
    if (!backdrop.classList.contains('open')) resetSheetStyles();
  });
  obs.observe(backdrop, { attributes: true, attributeFilter: ['class'] });
}

(function initSheetDragDismissAll() {
  const sheets = [
    { backdropId: 'filterModal', sheetSel: '.modal-sheet', onClose: closeFilterModal },
    { backdropId: 'impressumModal', sheetSel: '.info-modal-sheet', onClose: () => closeInfoModal('impressumModal') },
    { backdropId: 'privacyModal', sheetSel: '.info-modal-sheet', onClose: () => closeInfoModal('privacyModal') },
    { backdropId: 'resetPasswordModal', sheetSel: '.info-modal-sheet', onClose: closeResetPasswordModal },
    { backdropId: 'onboardBackdrop', sheetSel: '.onboard-sheet', onClose: closeOnboard },
  ];
  sheets.forEach(({ backdropId, sheetSel, onClose }) => {
    const backdrop = document.getElementById(backdropId);
    const sheet = backdrop?.querySelector(sheetSel);
    if (backdrop && sheet) initSheetDragDismiss({ backdrop, sheet, onClose });
  });
})();

function updateDiscoverLeftRail() {
  if (!isDesktop() || !isDiscoverScreenActive()) return;
  const catNames = { full: 'Beats', loops: 'Loops', drums: 'Drum Kits', samples: 'Samples' };
  const catLbl = document.getElementById('dlrCatLbl');
  const skippedEl = document.getElementById('dlrSkipped');
  const savedEl = document.getElementById('dlrSaved');
  const filterLbl = document.getElementById('dlrFilterLbl');
  if (catLbl) catLbl.textContent = catNames[cat] || 'Beats';
  if (skippedEl) skippedEl.textContent = String(skippedIds[cat]?.length || 0);
  if (savedEl) savedEl.textContent = String(crate.length);
  if (filterLbl) filterLbl.textContent = activeGenre === 'all' ? 'All genres' : activeGenre;
}

function updateFilterBtnStyle() {
  const btn = document.getElementById('filterIconBtn');
  if (!btn) return;
  if (activeGenre !== 'all') {
    btn.style.background = 'var(--accent-light)';
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent-mid)';
  } else {
    btn.style.background = 'var(--bg-2)';
    btn.style.borderColor = 'var(--border-2)';
    btn.style.color = 'var(--text-2)';
  }
}

function applyGenreToDb(genre) {
  if (genre === 'all') {
    Object.keys(_rawDb).forEach(k => { db[k] = [..._rawDb[k]]; });
  } else {
    Object.keys(_rawDb).forEach(k => {
      db[k] = _rawDb[k].filter(b => b.genre === genre);
    });
  }
}

function saveGenreFilter() {
  try { localStorage.setItem('bs_genre', activeGenre); } catch(e) {}
}

function restoreGenreFilter() {
  try {
    const saved = localStorage.getItem('bs_genre');
    if (!saved) return;
    activeGenre = saved;
    document.querySelectorAll('.filter-pill').forEach(b => {
      b.classList.toggle('active', b.dataset.genre === activeGenre);
    });
    applyGenreToDb(activeGenre);
    updateFilterBtnStyle();
  } catch(e) {}
}

document.getElementById('genrePills').querySelectorAll('.filter-pill').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeGenre = btn.dataset.genre;
  };
});

function applyFilter() {
  closeFilterModal();
  applyGenreToDb(activeGenre);
  updateFilterBtnStyle();
  saveGenreFilter();
  Object.keys(catIdx).forEach(k => catIdx[k] = 0);
  saveSwipeState();
  updateDiscoverLeftRail();
  goTo('discoverScreen', 'navDiscover');
}

