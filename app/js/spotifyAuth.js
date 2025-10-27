const modal = document.getElementById('spotify-auth-modal');

if (!modal) {
  console.warn('Spotify auth modal is missing from the DOM.');
}

const statusEl = modal?.querySelector('[data-role="status"]') ?? null;
const loginBtn = modal?.querySelector('[data-role="login"]') ?? null;
const dismissBtn = modal?.querySelector('[data-role="dismiss"]') ?? null;

const TOKEN_KEY = 'atlify.spotify.token';
const STATE_KEY = 'atlify.spotify.state';

const scopesAttr = (modal?.dataset.scopes || '').trim();
const scopes = scopesAttr.length ? scopesAttr.split(/\s+/g) : [];
const redirectAttr = (modal?.dataset.redirect || '').trim();
const redirectUri = redirectAttr || `${window.location.origin}${window.location.pathname}`;
const clientId = ((modal?.dataset.clientId || '').trim() || (window.SPOTIFY_CLIENT_ID || '')).trim();

let tokenCache = null;

function setStatus(message, tone = 'info') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  if (tone === 'error') {
    statusEl.setAttribute('data-tone', 'error');
  } else if (tone === 'success') {
    statusEl.setAttribute('data-tone', 'success');
  } else {
    statusEl.removeAttribute('data-tone');
  }
}

function showModal() {
  modal?.classList.remove('is-hidden');
}

function hideModal() {
  modal?.classList.add('is-hidden');
}

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch (err) {
    console.warn('Storage get failed', err);
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (err) {
    console.warn('Storage set failed', err);
  }
}

function safeRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch (err) {
    console.warn('Storage remove failed', err);
  }
}

function clearToken() {
  tokenCache = null;
  safeRemove(localStorage, TOKEN_KEY);
}

function readStoredToken() {
  if (tokenCache) {
    if (Date.now() < tokenCache.expiresAt) return tokenCache;
    clearToken();
    return null;
  }
  const raw = safeGet(localStorage, TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) {
      clearToken();
      return null;
    }
    tokenCache = parsed;
    return parsed;
  } catch (err) {
    console.warn('Unable to parse Spotify token payload', err);
    return null;
  }
}

function storeToken(payload) {
  tokenCache = payload;
  safeSet(localStorage, TOKEN_KEY, JSON.stringify(payload));
}

function generateState() {
  if (window.crypto?.getRandomValues) {
    const buffer = new Uint32Array(4);
    window.crypto.getRandomValues(buffer);
    return Array.from(buffer).map((n) => n.toString(16).padStart(8, '0')).join('');
  }
  return Math.random().toString(16).slice(2);
}

function consumeHashToken() {
  if (!window.location.hash) return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken) return null;

  const expiresInSec = Number(params.get('expires_in') || '0');
  const tokenType = params.get('token_type') || 'Bearer';
  const scope = params.get('scope') || scopes.join(' ');
  const state = params.get('state') || '';
  const expectedState = safeGet(sessionStorage, STATE_KEY);

  if (expectedState && state !== expectedState) {
    setStatus('Authentication mismatch. Please try again.', 'error');
    safeRemove(sessionStorage, STATE_KEY);
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
    return null;
  }

  safeRemove(sessionStorage, STATE_KEY);
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);

  return {
    accessToken,
    tokenType,
    scope,
    expiresAt: Date.now() + Math.max(1, expiresInSec || 0) * 1000,
  };
}

function startLogin() {
  if (!clientId) {
    setStatus('Spotify client ID is not configured.', 'error');
    showModal();
    return;
  }

  const state = generateState();
  safeSet(sessionStorage, STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: 'token',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    show_dialog: 'true',
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function attachEvents() {
  loginBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    startLogin();
  });

  dismissBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    hideModal();
  });
}

function init() {
  if (!modal) return;
  attachEvents();

  const hashToken = consumeHashToken();
  if (hashToken) {
    storeToken(hashToken);
    setStatus('Spotify connected. Enjoy the sonic journey!', 'success');
    setTimeout(() => hideModal(), 420);
    return;
  }

  const stored = readStoredToken();
  if (stored) {
    hideModal();
    return;
  }

  setStatus('Connect your Spotify account to stream sounds as you explore.');
  showModal();
}

function ensurePrompt() {
  if (!modal) return;
  if (!readStoredToken()) showModal();
}

function isAuthenticated() {
  return Boolean(readStoredToken());
}

function getToken() {
  return readStoredToken();
}

function requireClientIdConfigured() {
  return Boolean(clientId);
}

export const spotifyAuth = {
  init,
  ensurePrompt,
  isAuthenticated,
  getToken,
  requireClientIdConfigured,
};
