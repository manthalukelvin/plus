// main.js — Complete MyJournal+ Application (FULLY UPDATED)
// Fixed: Better error messages, Real Google Logo, Themes hidden by default, Referral tracking

const firebaseConfig = {
  apiKey: "AIzaSyAtzbIZvFLQM65QhOwph0PFpO9vOYcYUdE",
  authDomain: "myjournal-plus.firebaseapp.com",
  databaseURL: "https://myjournal-plus-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "myjournal-plus",
  storageBucket: "myjournal-plus.firebasestorage.app",
  messagingSenderId: "288260274583",
  appId: "1:288260274583:web:9c40aafed9ab9fa30e6cd2",
  measurementId: "G-MXJ84MJGTR"
};
const API_BASE = "https://myjournalplus.freedev.app/api";

const BACKEND_PAYPAL_CREATE_URL = "/api/payments/paypal-create-order";
const BACKEND_PAYPAL_CAPTURE_URL = "/api/payments/paypal-capture";
const BACKEND_PAYCHANGU_CREATE_URL = "/api/payments/create-paychangu";
const BACKEND_PAYCHANGU_VERIFY_URL = "/api/payments/verify-paychangu";
const BACKEND_PAYMENT_STATUS_URL = "/api/payments/status";
const BACKEND_AI_INSIGHTS_URL = "https://your-backend.example.com/api/ai-insights";
const VAPID_KEY = "BLH2E5pI_45jlSWs9nJMIE1IfwLcQwxuKGXL4n7ZAhLR9OI30EjWhcO66weIzZgrLlIpzkmq0c-pwyJ_JO4eMw8";

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let messaging = null;
try { messaging = firebase.messaging(); } catch (e) { messaging = null; }

window.BACKEND_AI_INSIGHTS_URL = BACKEND_AI_INSIGHTS_URL;

// ===========================
// INSTANT THEME (no flash on navigation)
// ===========================
(function applyStoredThemeEarly() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('mj_theme_'));
    let theme = 'default', bgStyle = 'gradient';
    // Prefer last-used global snapshot
    const global = localStorage.getItem('mj_theme_active');
    if (global) {
      const p = JSON.parse(global);
      theme = p.theme || theme;
      bgStyle = p.bgStyle || bgStyle;
    } else if (keys.length) {
      const p = JSON.parse(localStorage.getItem(keys[0]) || '{}');
      theme = p.theme || theme;
      bgStyle = p.bgStyle || bgStyle;
    }
    const body = document.body;
    if (!body) return;
    ['theme-midnight','theme-sunset','theme-forest','theme-rose','theme-ocean','theme-aurora','theme-ember','theme-lavender','theme-slate','bg-style-gradient','bg-style-mesh','bg-style-solid','bg-style-waves','bg-style-noir'].forEach(c => body.classList.remove(c));
    if (theme && theme !== 'default') body.classList.add('theme-' + theme);
    body.classList.add('bg-style-' + (bgStyle || 'gradient'));
  } catch (e) {}
})();

function cachePremiumFlag(isPrem) {
  try { localStorage.setItem('mj_is_premium', isPrem ? '1' : '0'); } catch (e) {}
}
function readCachedPremium() {
  try { return localStorage.getItem('mj_is_premium') === '1'; } catch (e) { return false; }
}

function loadRemoteAdminConfig() {
  if (!auth.currentUser) return;
  // Feature flags + slots from admin dashboard
  db.collection('config').doc('features').get().then(snap => {
    if (!snap.exists) return;
    const f = snap.data() || {};
    try { localStorage.setItem('mj_feature_flags', JSON.stringify(f)); } catch (e) {}
    window.__mjFlags = f;
    if (f.maintenance) {
      showDialog(f.maintenanceMessage || 'MyJournal+ is under maintenance. Please try again later.', {
        title: 'Maintenance',
        icon: '🛠️'
      });
    }
    // Hide AI link if disabled
    if (f.ai === false) {
      document.querySelectorAll('a[href*="ai-insights"]').forEach(a => { a.style.display = 'none'; });
    }
    if (f.mood === false) {
      document.querySelectorAll('a[href*="mood"]').forEach(a => { a.style.display = 'none'; });
    }
  }).catch(() => {});

  db.collection('config').doc('slots').get().then(snap => {
    if (!snap.exists) return;
    const s = snap.data() || {};
    try { localStorage.setItem('mj_slots', JSON.stringify(s)); } catch (e) {}
    const homeSlot = document.getElementById('admin-feature-slot');
    const setSlot = document.getElementById('admin-settings-slot');
    if (homeSlot && s.home) homeSlot.innerHTML = s.home;
    if (setSlot && s.settings) setSlot.innerHTML = s.settings;
  }).catch(() => {
    // offline: use cached slots
    try {
      const s = JSON.parse(localStorage.getItem('mj_slots') || '{}');
      const homeSlot = document.getElementById('admin-feature-slot');
      const setSlot = document.getElementById('admin-settings-slot');
      if (homeSlot && s.home) homeSlot.innerHTML = s.home;
      if (setSlot && s.settings) setSlot.innerHTML = s.settings;
    } catch (e) {}
  });

  db.collection('config').doc('ai').get().then(snap => {
    if (!snap.exists) return;
    const a = snap.data() || {};
    if (a.backendUrl) window.BACKEND_AI_INSIGHTS_URL = a.backendUrl;
    try { localStorage.setItem('mj_ai_config', JSON.stringify(a)); } catch (e) {}
  }).catch(() => {});
}

// Apply cached slots immediately (offline / fast paint)
(function applyCachedSlots() {
  try {
    const s = JSON.parse(localStorage.getItem('mj_slots') || '{}');
    document.addEventListener('DOMContentLoaded', () => {
      const homeSlot = document.getElementById('admin-feature-slot');
      const setSlot = document.getElementById('admin-settings-slot');
      if (homeSlot && s.home) homeSlot.innerHTML = s.home;
      if (setSlot && s.settings) setSlot.innerHTML = s.settings;
    });
  } catch (e) {}
})();



let userDocUnsub = null;
let userProfile = null;

function watchUserDoc(uid) {
  if (userDocUnsub) userDocUnsub();
  userDocUnsub = null;
  if (!uid) {
    userProfile = null;
    return;
  }
  const ref = db.collection('users').doc(uid);
  userDocUnsub = ref.onSnapshot(snap => {
    if (!snap.exists) { userProfile = null; return; }
    const data = snap.data();
    userProfile = data || {};
    if (data && data.isPremium && typeof markReferralPremium === 'function' && auth.currentUser) {
      try { markReferralPremium(auth.currentUser.uid); } catch (e) {}
    }
    if (data && data.isPremium) {
      closePremiumModal();
      cachePremiumFlag(true);
      if (!window.__mj_premium_toast_shown) {
        window.__mj_premium_toast_shown = true;
        toast('✓ Premium unlocked!');
      }
    } else {
      cachePremiumFlag(false);
    }
    updatePremiumBrand();
    if (window.adManager && typeof window.adManager.refresh === 'function') {
      window.adManager.refresh(userProfile);
    }
    // Apply theme if present
    if (data.appTheme || data.bgStyle) {
      applyThemeAndBg(data.appTheme || 'default', data.bgStyle || 'gradient');
    }
  }, err => { console.error('watch user doc error', err); });
}

// ===========================
// UTILITY HELPERS
// ===========================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));

function bindOnce(el, ev, fn) {
  if (!el) return;
  const key = `__bound_${ev}`;
  if (el[key]) return;
  el.addEventListener(ev, fn);
  el[key] = true;
}

function toast(msg, t = 2400) {
  let el = document.getElementById('mj-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mj-toast';
    el.style = 'position:fixed;left:50%;transform:translateX(-50%);bottom:22px;padding:10px 16px;border-radius:10px;background:linear-gradient(90deg,#7b6cff,#4dd3ff);color:#041025;z-index:9999;font-weight:700;opacity:0;transition:opacity .3s';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.opacity = '0', t);
}

function showDialog(message, opts = {}) {
  const title = opts.title || 'MyJournal+';
  const icon = opts.icon || 'ℹ️';
  if (!document.getElementById('mj-dialog-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'mj-dialog-overlay';
    overlay.className = 'dialog-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="dialog-card" role="dialog" aria-modal="true" style="max-width:680px;width:92%;border-radius:12px;padding:18px;background:var(--bg-soft, #071029);border:1px solid rgba(255,255,255,0.04);color:var(--text-main, #eaf2ff);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <div style="font-size:28px">${icon}</div>
          <div style="flex:1"><h3 style="margin:0;color:var(--accent-2)">${title}</h3></div>
        </div>
        <div id="mj-dialog-body" style="color:var(--text-muted, #9aa4b2);margin-bottom:14px"></div>
        <div id="mj-dialog-actions" style="display:flex;gap:10px;justify-content:flex-end"></div>
      </div>`;
    document.body.appendChild(overlay);
  }
  const overlay = document.getElementById('mj-dialog-overlay');
  $('#mj-dialog-body', overlay).textContent = message || '';
  const actions = $('#mj-dialog-actions', overlay);
  actions.innerHTML = '';
  const buttons = opts.buttons || [{ text: 'OK', class: 'btn primary', onClick: () => overlay.style.display = 'none' }];
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = b.class || 'btn';
    btn.textContent = b.text || 'OK';
    btn.addEventListener('click', () => {
      if (b.onClick) try { b.onClick(); } catch (e) { console.error(e); }
      overlay.style.display = 'none';
    });
    actions.appendChild(btn);
  });
  overlay.style.display = 'flex';
}

function friendlyError(err) {
  if (!err) return 'An unknown error occurred';
  const code = err.code || (typeof err === 'string' ? err : null);
  switch (code) {
    case 'auth/email-already-in-use': return 'This email address is already registered. Please sign in instead.';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    case 'auth/wrong-password': return 'Invalid email or password. Please check and try again.';
    case 'auth/user-not-found': return 'No account found with that email. Please sign up first.';
    case 'auth/weak-password': return 'Password too weak. Use at least 6 characters with mixed case and numbers.';
    case 'auth/too-many-requests': return 'Too many login attempts. Please try again later or reset your password.';
    case 'auth/invalid-credential': return 'Invalid email or password. Please check and try again.';
    case 'network-request-failed':
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return (err.message || String(err)).replace(/Firebase:\s*/i, '').split(' (auth/')[0];
  }
}

function showError(x) { 
  console.error(x); 
  showDialog(typeof x === 'string' ? x : friendlyError(x), { icon: '⚠️', title: 'Error' }); 
}

// ===========================
// PREMIUM MODAL & FUNCTIONS
// ===========================
function ensurePremiumModal() {
  if (document.getElementById('mj-premium-overlay')) return;
  const container = document.createElement('div');
  container.id = 'mj-premium-overlay';
  container.className = 'modal hidden';
  container.style = 'display:none;align-items:center;justify-content:center;position:fixed;inset:0;z-index:99999;';
  container.innerHTML = `
    <div class="modal-card small" role="dialog" aria-modal="true" style="width:92%;max-width:660px;border-radius:12px;padding:18px;background:linear-gradient(180deg,#0b1220,#071029);border:1px solid rgba(255,255,255,0.04);color:var(--text-main);">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;color:var(--accent-2)">Unlock Premium — from $2.49/mo</h3>
        <button id="mj-premium-close" class="btn ghost" title="Close">×</button>
      </div>
      <p style="color:var(--text-muted);margin-top:8px">
        Unlock unlimited words per entry, advanced formatting, themes, AI insights, mood analytics, PDF/Excel export, and access to the premium Mood tracker.
      </p>
      <ul style="color:var(--text-muted);margin-top:8px">
        <li>One-time lifetime access</li>
        <li>Secure PayPal or TNM Mpamba payment</li>
        <li>Instant account upgrade after verification</li>
      </ul>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <button id="mj-premium-back" class="btn">Back</button>
       <button id="mj-pay-paypal" class="btn primary">PayPal</button>
       <a href="tnmmpamba" class="btn" style="text-decoration:none;text-align:center">Mpamba</a>
      </div>
      <div id="mj-premium-footer" style="margin-top:12px;color:var(--text-muted);font-size:13px">You will be redirected to complete payment. Your account will upgrade automatically after verification.</div>
    </div>`;
  document.body.appendChild(container);

  bindOnce($('#mj-premium-close'), 'click', () => closePremiumModal());
  bindOnce($('#mj-premium-back'), 'click', () => closePremiumModal());
  bindOnce($('#mj-pay-paypal'), 'click', async () => {
    const u = auth.currentUser;
    if (!u) { showDialog('Please sign in to purchase'); return; }
    try {
      openManualVerifyModal();
    } catch (e) { console.error(e); showError('Payment initiation failed'); }
  });
}

function openPremiumModal() {
  ensurePremiumModal();
  const ov = document.getElementById('mj-premium-overlay');
  if (ov) { ov.style.display = 'flex'; ov.classList.remove('hidden'); }
}

function closePremiumModal() {
  const ov = document.getElementById('mj-premium-overlay');
  if (ov) { ov.style.display = 'none'; ov.classList.add('hidden'); }
}

// ===========================
// MANUAL PAYPAL VERIFICATION
// ===========================
function ensureManualVerifyModal() {
  if (document.getElementById('mj-paypal-verify-modal')) return;
  const m = document.createElement('div');
  m.id = 'mj-paypal-verify-modal';
  m.className = 'modal hidden';
  m.style = 'display:none;align-items:center;justify-content:center;position:fixed;inset:0;z-index:100000;';
  m.innerHTML = `
    <div class="modal-card small" role="dialog" aria-modal="true" style="width:92%;max-width:520px;border-radius:12px;padding:18px;background:linear-gradient(180deg,#071029,#041022);border:1px solid rgba(255,255,255,0.04);color:var(--text-main);">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;color:var(--accent-2)">Complete Your Payment</h3>
        <button id="mj-verify-close" class="btn ghost" title="Close">×</button>
      </div>
      <p style="color:var(--text-muted);margin-top:8px;font-size:14px">
        <strong>Step 1:</strong> You will be redirected to PayPal to complete payment (from <strong>$2.49/mo</strong>).
      </p>
      <p style="color:var(--text-muted);font-size:14px">
        <strong>Step 2:</strong> After payment, come back and enter your PayPal Transaction ID below for verification.
      </p>

      <label class="input-label" style="margin-top:12px">PayPal Transaction ID</label>
      <input id="mj-paypal-tx" type="text" placeholder="e.g. 8HX12345AB6789012" />

      <label class="input-label" style="margin-top:10px">Your MyJournal+ Email</label>
      <input id="mj-paypal-email" type="email" placeholder="your@email.com" />

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button id="mj-verify-cancel" class="btn">Cancel</button>
       <button id="mj-pay-paypal" class="btn primary">PayPal</button>
       </div>

      <p id="mj-verify-note" style="margin-top:10px;color:var(--text-muted);font-size:13px">After paying, return here and submit your Transaction ID for verification (usually instant).</p>
      <div id="mj-verify-result" style="margin-top:10px;"></div>
    </div>
  `;
  document.body.appendChild(m);

  bindOnce($('#mj-verify-close'), 'click', () => closeManualVerifyModal());
  bindOnce($('#mj-verify-cancel'), 'click', () => closeManualVerifyModal());
}

function openManualVerifyModal() {
  ensureManualVerifyModal();
  const m = document.getElementById('mj-paypal-verify-modal');
  if (!m) return;
  const emailInput = document.getElementById('mj-paypal-email');
  if (auth.currentUser && emailInput) emailInput.value = auth.currentUser.email || '';
  m.style.display = 'flex';
  m.classList.remove('hidden');
}

function closeManualVerifyModal() {
  const m = document.getElementById('mj-paypal-verify-modal');
  if (!m) return;
  m.style.display = 'none';
  m.classList.add('hidden');
}

// ===========================
// FCM NOTIFICATIONS
// ===========================
async function saveTokenForUser(uid, token) {
  if (!uid || !token) return;
  try {
    await db.collection('users').doc(uid).update({
      fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
      fcmTokenDate: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('✓ FCM token saved');
  } catch (e) {
    console.warn('saveTokenForUser failed', e);
  }
}

async function promptAndSaveFCM(currentUser) {
  if (!messaging || !currentUser) return;
  try {
    const shownKey = 'mj_notif_prompt_shown_' + currentUser.uid;
    if (localStorage.getItem(shownKey)) return;

    if (Notification.permission === 'denied') { 
      localStorage.setItem(shownKey, '1'); 
      return; 
    }

    const ask = confirm('Enable notifications for daily writing reminders and insights?');
    localStorage.setItem(shownKey, '1');
    if (!ask) return;

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { 
      toast('Notifications not enabled'); 
      return; 
    }

    let swReg = null;
    try {
      if ('serviceWorker' in navigator) {
        swReg = await navigator.serviceWorker.ready;
      }
    } catch (e) {
      console.warn('Service worker ready failed', e);
    }

    const tokenOptions = swReg ? { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg } : { vapidKey: VAPID_KEY };

    let token = null;
    try {
      token = await messaging.getToken(tokenOptions);
    } catch (e) {
      console.warn('messaging.getToken failed:', e);
      try {
        token = await messaging.getToken({ vapidKey: VAPID_KEY });
      } catch (e2) {
        console.warn('Alternative getToken also failed', e2);
      }
    }

    if (!token) {
      console.warn('Unable to obtain notification token');
      return;
    }

    await saveTokenForUser(currentUser.uid, token);
    toast('✓ Notifications enabled');

    let latestToken = token;
    async function checkAndUpdateToken() {
      try {
        const newToken = await messaging.getToken(tokenOptions).catch(() => null);
        if (newToken && newToken !== latestToken) {
          await saveTokenForUser(currentUser.uid, newToken);
          try {
            await db.collection('users').doc(currentUser.uid).update({
              fcmTokens: firebase.firestore.FieldValue.arrayRemove(latestToken)
            });
          } catch (e) { /* ignore */ }
          latestToken = newToken;
        }
      } catch (e) { console.warn('checkAndUpdateToken error', e); }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkAndUpdateToken();
    });

    if ('serviceWorker' in navigator && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setTimeout(checkAndUpdateToken, 800);
      });
    }

    const intervalId = setInterval(checkAndUpdateToken, 1000 * 60 * 60 * 12);
    window.addEventListener('beforeunload', () => {
      clearInterval(intervalId);
    }, { once: true });

  } catch (e) {
    console.error('promptAndSaveFCM error', e);
  }
}

// ===========================
// AUTHENTICATION HELPERS - UPDATED FOR BETTER ERROR MESSAGES
// ===========================
async function signInWithGooglePopup() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    if (!user) return;
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      const refCode = localStorage.getItem('ref_code') || null;
      
      await db.collection('users').doc(user.uid).set({
        username: user.displayName || (user.email ? user.email.split('@')[0] : ''),
        email: user.email || '',
        avatar: user.photoURL || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isPremium: false,
        referralCode: generateReferralCode(),
        referralCount: 0,
        referredBy: refCode
      });
      
      // Attribute to growth specialist + user referrals
      if (typeof trackReferralSignup === 'function') {
        try {
          await trackReferralSignup(user.uid, user.email || '', refCode);
        } catch (refErr) {
          console.warn('trackReferralSignup failed', refErr);
        }
      } else if (refCode) {
        const refSnap = await db.collection('users').where('referralCode', '==', refCode).limit(1).get();
        if (!refSnap.empty) {
          const referrerId = refSnap.docs[0].id;
          const currentCount = refSnap.docs[0].data().referralCount || 0;
          await db.collection('users').doc(referrerId).update({
            referralCount: currentCount + 1
          });
          if (currentCount + 1 >= 3) {
            await db.collection('users').doc(referrerId).update({ isPremium: true });
            toast('✓ Your referral unlocked premium!');
          }
        }
        localStorage.removeItem('ref_code');
      }
    }
    localStorage.setItem('mj_remember_login', '1');
  } catch (err) {
    console.error('Google sign-in error', err);
    showError(err);
  }
}

async function setAuthPersistence(remember) {
  try {
    if (remember) await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    else await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  } catch (e) { console.warn('setAuthPersistence failed', e); }
}

// ===========================
// PIN HASHING
// ===========================
async function hashPin(pin, uid) {
  if (!pin || !uid) return null;
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${pin}:${uid}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { console.error('hashPin error', e); return null; }
}

// ===========================
// REFERRAL SYSTEM
// ===========================
function generateReferralCode() {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Check referral code from URL
(function() {
  const params = new URLSearchParams(window.location.search);
  const refCode = params.get('ref');
  if (refCode) {
    localStorage.setItem('ref_code', refCode);
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
})();

// ===========================
// PREMIUM BRANDING
// ===========================
function updatePremiumBrand() {
  const isPrem = !!(userProfile && userProfile.isPremium);
  document.querySelectorAll('.logo-title').forEach(el => {
    if (isPrem) {
      el.classList.add('premium-brand');
      if (!el.querySelector('.premium-sup')) {
        el.innerHTML = 'MyJournal+<sup class="premium-sup">Premium</sup>';
      }
    } else {
      el.classList.remove('premium-brand');
      if (el.querySelector('.premium-sup')) {
        el.textContent = 'MyJournal+';
      }
    }
  });
  // Hide ads for premium
  if (isPrem) {
    document.querySelectorAll('#ad-bottom-container, #ad-smartlink, .ad-bottom-container, [data-ad]').forEach(el => {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    });
    if (window.adManager && typeof window.adManager.hideAll === 'function') {
      try { window.adManager.hideAll(); } catch(e){}
    }
  }
}

// ===========================
// DEVICES & LOCATION (Premium)
// ===========================
function getDeviceFingerprint() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const lang = navigator.language || '';
  const screenInfo = `${screen.width}x${screen.height}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  return btoa(`${ua}|${platform}|${lang}|${screenInfo}|${tz}`).slice(0, 32);
}

function getDeviceLabel() {
  const ua = navigator.userAgent || '';
  let browser = 'Browser';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  let os = 'Unknown OS';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';
  return `${browser} on ${os}`;
}

async function recordDeviceAndLocation(uid) {
  if (!uid) return;
  try {
    const deviceId = getDeviceFingerprint();
    const label = getDeviceLabel();
    let location = { lat: null, lng: null, accuracy: null, city: null, country: null };
    try {
      if (navigator.geolocation) {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
        });
        location.lat = pos.coords.latitude;
        location.lng = pos.coords.longitude;
        location.accuracy = pos.coords.accuracy;
      }
    } catch (geoErr) {
      console.warn('Geolocation unavailable', geoErr);
    }
    // Optional reverse geocode via free API (no key)
    if (location.lat && location.lng) {
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}&zoom=10`, {
          headers: { 'Accept-Language': 'en' }
        });
        if (resp.ok) {
          const data = await resp.json();
          location.city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || null;
          location.country = data.address?.country || null;
        }
      } catch (e) { /* ignore */ }
    }
    const deviceEntry = {
      deviceId,
      label,
      userAgent: navigator.userAgent,
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      location,
      platform: navigator.platform || '',
      language: navigator.language || ''
    };
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    let devices = (snap.exists && snap.data().devices) || [];
    // Keep only last 10, update existing
    const idx = devices.findIndex(d => d.deviceId === deviceId);
    if (idx >= 0) {
      devices[idx] = { ...devices[idx], ...deviceEntry, lastActive: new Date().toISOString() };
    } else {
      devices.unshift({ ...deviceEntry, lastActive: new Date().toISOString() });
    }
    devices = devices.slice(0, 10);
    await userRef.set({ devices, lastDeviceId: deviceId }, { merge: true });
    // Also cache locally
    try { localStorage.setItem('mj_devices_' + uid, JSON.stringify(devices)); } catch(e){}
  } catch (e) {
    console.warn('recordDeviceAndLocation failed', e);
  }
}

async function logoutRemoteDevice(uid, deviceId) {
  if (!uid || !deviceId) return;
  try {
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return;
    let devices = snap.data().devices || [];
    devices = devices.filter(d => d.deviceId !== deviceId);
    await userRef.update({ devices });
    // Signal logout via a sessions map
    await userRef.set({
      forceLogoutDevices: firebase.firestore.FieldValue.arrayUnion(deviceId)
    }, { merge: true });
    toast('✓ Device logged out');
  } catch (e) {
    console.error(e);
    showError('Could not logout device');
  }
}

// ===========================
// THEMES & BACKGROUND (Premium)
// ===========================
function applyThemeAndBg(theme, bgStyle) {
  const themes = ['theme-midnight','theme-sunset','theme-forest','theme-rose','theme-ocean','theme-aurora','theme-ember','theme-lavender','theme-slate'];
  const bgs = ['bg-style-gradient','bg-style-mesh','bg-style-solid','bg-style-waves','bg-style-noir'];
  themes.concat(bgs).forEach(c => document.body.classList.remove(c));
  if (theme && theme !== 'default') document.body.classList.add('theme-' + theme);
  document.body.classList.add('bg-style-' + (bgStyle || 'gradient'));
  try {
    localStorage.setItem('mj_theme_active', JSON.stringify({ theme: theme || 'default', bgStyle: bgStyle || 'gradient' }));
  } catch (e) {}
}

async function loadAndApplyUserTheme(uid) {
  try {
    let theme = 'default', bgStyle = 'gradient';
    if (userProfile) {
      theme = userProfile.appTheme || 'default';
      bgStyle = userProfile.bgStyle || 'gradient';
    } else {
      const local = localStorage.getItem('mj_theme_' + (uid || 'guest'));
      if (local) {
        try {
          const p = JSON.parse(local);
          theme = p.theme || theme;
          bgStyle = p.bgStyle || bgStyle;
        } catch(e){}
      }
    }
    applyThemeAndBg(theme, bgStyle);
  } catch(e){}
}

// ===========================
// SPECIAL LOADING OVERLAY
// ===========================
function showSpecialLoading(durationMs = 3000) {
  return new Promise(resolve => {
    let ov = document.getElementById('mj-special-loading');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mj-special-loading';
      ov.className = 'mj-loading-overlay';
      ov.innerHTML = `
        <div class="mj-loading-logo">📔</div>
        <div class="mj-loading-text">MyJournal+</div>
        <div class="mj-loading-bar"><div class="mj-loading-bar-fill"></div></div>
        <p style="color:var(--text-muted);font-size:13px;margin:0">Preparing your journal...</p>`;
      document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    setTimeout(() => {
      ov.style.opacity = '0';
      ov.style.transition = 'opacity 0.4s';
      setTimeout(() => {
        ov.style.display = 'none';
        ov.style.opacity = '1';
        resolve();
      }, 400);
    }, durationMs);
  });
}

// ===========================
// ADMIN MESSAGES (in-app popup)
// ===========================
function listenForAdminMessages(uid) {
  if (!uid) return;
  db.collection('users').doc(uid).collection('messages')
    .where('read', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const msg = change.doc.data();
          showAdminMessagePopup(change.doc.id, msg);
        }
      });
    }, err => console.warn('admin msg listener', err));
}

function showAdminMessagePopup(msgId, msg) {
  if (document.getElementById('admin-msg-' + msgId)) return;
  const ov = document.createElement('div');
  ov.id = 'admin-msg-' + msgId;
  ov.className = 'admin-msg-overlay';
  ov.innerHTML = `
    <div class="admin-msg-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:28px">📢</span>
        <h3 style="margin:0;color:var(--accent-2);font-size:18px">${msg.title || 'Message from MyJournal+'}</h3>
      </div>
      <div style="color:var(--text-main);line-height:1.5;margin-bottom:18px;white-space:pre-wrap">${msg.body || msg.text || ''}</div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn primary" id="admin-msg-ok-${msgId}">Got it</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const btn = document.getElementById('admin-msg-ok-' + msgId);
  if (btn) {
    btn.addEventListener('click', async () => {
      ov.remove();
      try {
        const u = auth.currentUser;
        if (u) await db.collection('users').doc(u.uid).collection('messages').doc(msgId).update({ read: true });
      } catch(e){}
    });
  }
}

// ===========================
// OFFLINE / LOCAL STORAGE SYNC
// ===========================
const OFFLINE_QUEUE_KEY = 'mj_offline_queue';

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function localEntriesKey(uid) {
  return 'mj_local_entries_' + (uid || 'guest');
}

function readLocalEntries(uid) {
  try {
    return JSON.parse(localStorage.getItem(localEntriesKey(uid)) || '[]');
  } catch (e) { return []; }
}

function writeLocalEntries(uid, list) {
  try {
    localStorage.setItem(localEntriesKey(uid), JSON.stringify((list || []).slice(0, 200)));
  } catch (e) {}
}

function upsertLocalEntry(uid, entry) {
  const list = readLocalEntries(uid);
  const id = entry.id || ('local_' + Date.now());
  const row = Object.assign({}, entry, { id: id });
  const idx = list.findIndex(e => e.id === id);
  if (idx >= 0) list[idx] = Object.assign({}, list[idx], row);
  else list.unshift(row);
  writeLocalEntries(uid, list);
  return id;
}

function queueOfflineAction(action) {
  try {
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    q.push(Object.assign({}, action, { ts: Date.now() }));
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  } catch (e) {}
}

function ensureOfflineBanner() {
  let el = document.getElementById('mj-offline-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mj-offline-banner';
    el.setAttribute('role', 'status');
    el.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:10001;padding:8px 14px;text-align:center;font-size:13px;font-weight:600;background:linear-gradient(90deg,#b45309,#ca8a04);color:#fff;box-shadow:0 2px 12px rgba(0,0,0,.35)';
    el.textContent = "You're offline — changes are saved on this device and will sync when you're back online.";
    document.body.appendChild(el);
  }
  return el;
}

function updateOfflineBanner() {
  const el = ensureOfflineBanner();
  if (isOffline()) {
    el.style.display = 'block';
    document.body.style.paddingTop = '36px';
  } else {
    el.style.display = 'none';
    document.body.style.paddingTop = '';
  }
}

async function flushOfflineQueue() {
  if (isOffline()) return;
  const u = auth.currentUser;
  if (!u) return;
  let q = [];
  try { q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch (e) { return; }
  if (!q.length) return;
  const remaining = [];
  for (const item of q) {
    try {
      if (item.type === 'entry') {
        const col = db.collection('users').doc(u.uid).collection('entries');
        const data = Object.assign({}, item.data);
        // strip client-only flags
        delete data._pendingSync;
        if (item.id && !String(item.id).startsWith('local_')) {
          await col.doc(item.id).set(data, { merge: true });
        } else {
          const ref = await col.add(data);
          // remap local id -> server id in local cache
          if (item.id) {
            const list = readLocalEntries(u.uid).filter(e => e.id !== item.id);
            list.unshift(Object.assign({}, data, { id: ref.id }));
            writeLocalEntries(u.uid, list);
          }
        }
      } else if (item.type === 'settings') {
        await db.collection('users').doc(u.uid).set(item.data, { merge: true });
      } else if (item.type === 'deleteEntry' && item.id) {
        await db.collection('users').doc(u.uid).collection('entries').doc(item.id).delete();
        writeLocalEntries(u.uid, readLocalEntries(u.uid).filter(e => e.id !== item.id));
      }
    } catch (e) {
      remaining.push(item);
    }
  }
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  if (q.length !== remaining.length) toast('✓ Offline changes synced');
}

window.addEventListener('online', () => {
  updateOfflineBanner();
  flushOfflineQueue();
});
window.addEventListener('offline', () => updateOfflineBanner());
document.addEventListener('DOMContentLoaded', () => updateOfflineBanner());

// ===========================
// EDITOR & FORMATTING HELPERS
// ===========================
function execFormattingCommand(cmd, value = null) {
  try {
    document.execCommand(cmd, false, value);
    const editor = document.getElementById('entry-content');
    if (editor) editor.focus();
  } catch (e) { console.error('execFormattingCommand', e); }
}

function applyBlockFormat(tag) {
  if (!tag || tag === 'P') execFormattingCommand('formatBlock', '<p>');
  else execFormattingCommand('formatBlock', `<${tag}>`);
}

function toggleOrderedList(type = 'decimal') {
  execFormattingCommand('insertOrderedList');
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    let node = sel.anchorNode;
    while (node && node.nodeName !== 'OL' && node !== document.body) node = node.parentNode;
    if (node && node.nodeName === 'OL') node.style.listStyleType = (type === 'alpha') ? 'lower-alpha' : 'decimal';
  }, 50);
}

function applyForeColor(value) { execFormattingCommand('foreColor', value); }

// ===========================
// EXPORT HELPERS
// ===========================
async function exportEntriesToPDF(entries) {
  if (!entries || entries.length === 0) { showDialog('No entries to export'); return; }
  if (window.jspdf || window.jsPDF) {
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF();
    let y = 16;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      doc.setFontSize(14);
      doc.text(e.title || 'Untitled', 12, y);
      y += 8;
      doc.setFontSize(11);
      const text = (e.content || '').replace(/<\/?[^>]+(>|$)/g, '');
      const lines = doc.splitTextToSize(text, 180);
      doc.text(lines, 12, y);
      y += lines.length * 6 + 10;
      if (y > 260 && i < entries.length - 1) { doc.addPage(); y = 16; }
    }
    doc.save('myjournal-entries.pdf');
    return;
  }
  let blobText = '';
  entries.forEach(e => {
    blobText += (e.title || 'Untitled') + '\n\n' + (e.content || '').replace(/<\/?[^>]+(>|$)/g, '') + '\n\n---\n\n';
  });
  const blob = new Blob([blobText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'myjournal-entries.txt'; a.click();
  URL.revokeObjectURL(url);
}

function exportEntriesToCSV(entries) {
  if (!entries || entries.length === 0) { showDialog('No entries to export'); return; }
  const rows = [['Title', 'Content', 'CreatedAt']];
  entries.forEach(e => {
    const title = (e.title || '').replace(/"/g, '""');
    const content = (e.content || '').replace(/<\/?[^>]+(>|$)/g, '').replace(/"/g, '""');
    const created = e.createdAt && e.createdAt.toDate ? e.createdAt.toDate().toISOString() : '';
    rows.push(`"${title}","${content}","${created}"`);
  });
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'myjournal-entries.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ===========================
// WORD COUNT & LIMIT CHECKING
// ===========================
function getWordCount(htmlContent) {
  if (!htmlContent) return 0;
  const text = htmlContent.replace(/<\/?[^>]+(>|$)/g, '').trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

async function checkWordLimit(uid, wordCount) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    const isPremium = doc.exists && doc.data().isPremium;
    const LIMIT_FREE = 600;
    
    if (!isPremium && wordCount > LIMIT_FREE) {
      return { allowed: false, limit: LIMIT_FREE, current: wordCount };
    }
    return { allowed: true, limit: isPremium ? 'unlimited' : LIMIT_FREE, current: wordCount };
  } catch (e) {
    console.error('checkWordLimit failed', e);
    return { allowed: true, limit: 'unlimited', current: wordCount };
  }
}

// ===========================
// GLOBAL AUTH STATE & SETUP
// ===========================
let currentUser = null;

auth.onAuthStateChanged(async (u) => {
  if (!u) {
    currentUser = null;
    userProfile = null;
    watchUserDoc(null);
    if (window.adManager && typeof window.adManager.refresh === 'function') {
      window.adManager.refresh(null);
    }
    const protectedPages = ['home','mood','settings','edit','preview','pin'];
    if (protectedPages.some(p => location.pathname.endsWith(p) || location.pathname.endsWith(p + '.html'))) {
      window.location.href = 'login';
    }
    return;
  }

  currentUser = u;
  watchUserDoc(u.uid);

  try {
    const docRef = db.collection('users').doc(u.uid);
    const docSnap = await docRef.get().catch(()=>null);
    if (!docSnap || !docSnap.exists) {
      await docRef.set({
        username: u.displayName || (u.email ? u.email.split('@')[0] : ''),
        email: u.email || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isPremium: false,
        referralCode: generateReferralCode(),
        referralCount: 0
      });
    }
  } catch (e) { console.error('ensure user doc', e); }

  // Record device + location (premium feature data always collected for when they upgrade)
  recordDeviceAndLocation(u.uid).catch(()=>{});

  // FCM prompt on sign-in
  await promptAndSaveFCM(u);

  // Listen for admin messages
  listenForAdminMessages(u.uid);

  // Admin feature flags + slots + AI config
  loadRemoteAdminConfig();

  // Theme (local first, then profile)
  loadAndApplyUserTheme(u.uid);
  try {
    const udoc = await db.collection('users').doc(u.uid).get();
    if (udoc.exists) cachePremiumFlag(!!udoc.data().isPremium);
  } catch (e) {}

  // Flush offline queue
  flushOfflineQueue();

  // Check force logout for this device
  try {
    const deviceId = getDeviceFingerprint();
    const usnap = await db.collection('users').doc(u.uid).get();
    if (usnap.exists) {
      const forceList = usnap.data().forceLogoutDevices || [];
      if (forceList.includes(deviceId)) {
        await db.collection('users').doc(u.uid).update({
          forceLogoutDevices: firebase.firestore.FieldValue.arrayRemove(deviceId)
        });
        await auth.signOut();
        toast('You were logged out from another device');
        return;
      }
    }
  } catch(e){}

  if (window.adManager && typeof window.adManager.refresh === 'function') {
    window.adManager.refresh(userProfile);
  }

  // After login/signup redirect with special loading
  if (location.pathname.endsWith('login') || location.pathname.endsWith('signup') || location.pathname.endsWith('login') || location.pathname.endsWith('signup') || location.pathname === '/' || location.pathname.endsWith('index')) {
    await showSpecialLoading(2800);
    window.location.href = 'home';
    return;
  }

  // Update brand once profile loads (watchUserDoc also updates)
  setTimeout(updatePremiumBrand, 600);

  try { setupHomePage(); } catch (e) { /* ignore */ }
  try { setupEditPage(); } catch (e) { /* ignore */ }
  try { setupPreviewPage(); } catch (e) { /* ignore */ }
  try { setupMoodPageGate(); } catch (e) { /* ignore */ }
  try { setupSettingsPage(); } catch (e) { /* ignore */ }
});

// ===========================
// DOM CONTENT LOADED
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  ensurePremiumModal();
  ensureManualVerifyModal();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('✓ Offline SW registered', reg.scope);
        // Prefer new worker
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      })
      .catch(err => console.warn('SW registration failed:', err));
  }

  if (window.adManager && typeof window.adManager.init === 'function') {
    try { window.adManager.init(); } catch (e) { console.warn('adManager init failed', e); }
  }

  // Side menu setup — advanced professional hamburger
  (function setupSideMenu() {
    const hb = document.getElementById('hamburger-btn');
    const side = document.getElementById('side-menu');
    if (!hb || !side) return;
    let autoHideTimer = null;
    const AUTO_HIDE_MS = 3000;
    function openMenu() {
      side.classList.remove('hidden');
      side.classList.add('open');
      side.setAttribute('aria-hidden','false');
      hb.setAttribute('aria-expanded','true');
      hb.classList.add('active');
      resetAutoHide();
    }
    function closeMenu() {
      side.classList.add('hidden');
      side.classList.remove('open');
      side.setAttribute('aria-hidden','true');
      hb.setAttribute('aria-expanded','false');
      hb.classList.remove('active');
      clearAutoHide();
    }
    function toggleMenu() { if (side.classList.contains('open')) closeMenu(); else openMenu(); }
    function resetAutoHide() { clearAutoHide(); autoHideTimer = setTimeout(closeMenu, AUTO_HIDE_MS); }
    function clearAutoHide() { if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; } }
    bindOnce(hb, 'click', (e) => { e.preventDefault(); e.stopPropagation(); toggleMenu(); });
    bindOnce(document, 'click', (e) => {
      const path = e.composedPath ? e.composedPath() : (e.path || []);
      if (!path.includes(side) && !path.includes(hb)) closeMenu();
    });
    bindOnce(side, 'pointerenter', () => clearAutoHide());
    bindOnce(side, 'pointerleave', () => resetAutoHide());
    bindOnce(document, 'keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  })();

  // LOGIN PAGE - UPDATED WITH BETTER ERROR MESSAGES AND REAL GOOGLE LOGO
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    bindOnce(loginForm, 'submit', async (e) => {
      e.preventDefault();
      try {
        const email = (document.getElementById('login-email') || {}).value || '';
        const password = (document.getElementById('login-password') || {}).value || '';
        const remember = !!(document.getElementById('remember-login') && document.getElementById('remember-login').checked);
        
        if (!email || !password) { showError('Please enter both email and password'); return; }
        
        await setAuthPersistence(remember);
        const result = await auth.signInWithEmailAndPassword(email, password);
        if (remember) localStorage.setItem('mj_remember_login', '1');
        toast('✓ Signed in successfully');
      } catch (err) { 
        console.error('Login error:', err);
        // Better error messages
        if (err.code === 'auth/user-not-found') {
          showError('Invalid email or password. Please check and try again.');
        } else if (err.code === 'auth/wrong-password') {
          showError('Invalid email or password. Please check and try again.');
        } else if (err.code === 'auth/invalid-email') {
          showError('Please enter a valid email address.');
        } else if (err.code === 'auth/invalid-credential') {
          showError('Invalid email or password. Please check and try again.');
        } else if (err.code === 'auth/too-many-requests') {
          showError('Too many failed login attempts. Please try again later or reset your password.');
        } else {
          showError(friendlyError(err));
        }
      }
    });

    const loginShow = document.getElementById('login-showpass'), loginPass = document.getElementById('login-password');
    if (loginShow && loginPass) bindOnce(loginShow, 'click', () => { loginPass.type = loginPass.type === 'password' ? 'text' : 'password'; loginShow.textContent = loginPass.type === 'password' ? 'Show' : 'Hide'; });

    const gbtn = document.getElementById('google-signin-button');
    if (gbtn) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-google'; 
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 46 46" xmlns="http://www.w3.org/2000/svg" style="flex:0 0 20px"><g><circle cx="23" cy="23" r="23" fill="#fff"/><path d="M32.38 24.46c0-.63-.06-1.24-.18-1.83H23v3.47h5.28a4.5 4.5 0 0 1-1.95 2.95v2.45h3.15c1.85-1.71 2.9-4.23 2.9-7.04z" fill="#4285F4"/><path d="M23 33c2.64 0 4.86-.87 6.48-2.36l-3.15-2.45c-.88.59-2.01.95-3.33.95-2.56 0-4.74-1.73-5.51-4.06h-3.22v2.54A9.997 9.997 0 0 0 23 33z" fill="#34A853"/><path d="M17.49 25.08a5.98 5.98 0 0 1 0-3.82v-2.54h-3.22a9.997 9.997 0 0 0 0 8.9l3.22-2.54z" fill="#FBBC05"/><path d="M23 18.56c1.44 0 2.75.5 3.77 1.48l2.83-2.83C27.86 15.71 25.64 15 23 15a10 10 0 0 0-8.73 5.18l3.22 2.54c.77-2.33 2.95-4.06 5.51-4.06z" fill="#EA4335"/></g></svg><span>Continue with Google</span>`; 
      btn.style.width = '100%'; 
      btn.type = 'button';
      bindOnce(btn, 'click', (ev) => { ev.preventDefault(); signInWithGooglePopup(); });
      gbtn.appendChild(btn);
    }

    // Forgot password
    const resetModal = document.getElementById('reset-modal');
    const forgotLink = document.getElementById('forgot-link'), resetClose = document.getElementById('reset-close'), resetSend = document.getElementById('reset-send');
    if (forgotLink) bindOnce(forgotLink, 'click', (e) => { e.preventDefault(); if (resetModal) resetModal.classList.remove('hidden'); });
    if (resetClose) bindOnce(resetClose, 'click', () => { if (resetModal) resetModal.classList.add('hidden'); });
    if (resetSend) bindOnce(resetSend, 'click', async () => {
      const email = (document.getElementById('reset-email') || {}).value.trim();
      if (!email) return showError('Enter your email address');
      try {
        await auth.sendPasswordResetEmail(email);
        toast('✓ Reset link sent to ' + email + ' (Check Spam folder)');
        if (resetModal) resetModal.classList.add('hidden');
        if (document.getElementById('reset-email')) document.getElementById('reset-email').value = '';
      } catch (err) { 
        if (err.code === 'auth/user-not-found') {
          showError('No account found with that email address');
        } else {
          showError(err);
        }
      }
    });
  }

  // SIGNUP PAGE - UPDATED FOR GOOGLE AND REFERRAL TRACKING
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    const ageSel = document.getElementById('signup-age');
    if (ageSel && ageSel.children.length <= 1) {
      for (let i = 13; i <= 70; i++) { 
        const o = document.createElement('option'); 
        o.value = i; 
        o.textContent = i; 
        ageSel.appendChild(o); 
      }
    }

    bindOnce(signupForm, 'submit', async (e) => {
      e.preventDefault();
      try {
        const username = (document.getElementById('signup-username') || {}).value.trim();
        const age = (document.getElementById('signup-age') || {}).value;
        const gender = (document.getElementById('signup-gender') || {}).value;
        const email = (document.getElementById('signup-email') || {}).value.trim();
        const password = (document.getElementById('signup-password') || {}).value || '';
        
        if (!username || !age || !gender || !email || !password) return showError('Please fill all required fields');
        if (password.length < 6) return showError('Password must be at least 6 characters');
        
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;
        
        const refCode = localStorage.getItem('ref_code') || null;
        
        await db.collection('users').doc(uid).set({
          username, 
          age: Number(age), 
          gender, 
          email,
          pinEnabled: false, 
          twoFaEnabled: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          isPremium: false,
          referralCode: generateReferralCode(),
          referralCount: 0,
          referredBy: refCode
        });
        
        // Attribute signup to growth specialist + user-to-user referrals
        if (typeof trackReferralSignup === 'function') {
          try {
            await trackReferralSignup(uid, email, refCode);
          } catch (refErr) {
            console.warn('trackReferralSignup failed', refErr);
          }
        } else if (refCode) {
          // Fallback: user-to-user only
          const refSnap = await db.collection('users').where('referralCode', '==', refCode).limit(1).get();
          if (!refSnap.empty) {
            const referrerId = refSnap.docs[0].id;
            const currentCount = refSnap.docs[0].data().referralCount || 0;
            await db.collection('users').doc(referrerId).update({
              referralCount: currentCount + 1
            });
            if (currentCount + 1 >= 3) {
              await db.collection('users').doc(referrerId).update({ isPremium: true });
              toast('✓ 3 friends joined! Premium unlocked for the referrer');
            }
          }
          localStorage.removeItem('ref_code');
        }
        
        toast('✓ Account created. Welcome to MyJournal+!');
      } catch (err) { 
        console.error('Signup error:', err);
        showError(err); 
      }
    });

    const signupShow = document.getElementById('signup-showpass'), signupPass = document.getElementById('signup-password');
    if (signupShow && signupPass) bindOnce(signupShow, 'click', () => { signupPass.type = signupPass.type === 'password' ? 'text' : 'password'; signupShow.textContent = signupPass.type === 'password' ? 'Show' : 'Hide'; });

    const gbtn2 = document.getElementById('google-signup-button');
    if (gbtn2) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-google'; 
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 46 46" xmlns="http://www.w3.org/2000/svg" style="flex:0 0 20px"><g><circle cx="23" cy="23" r="23" fill="#fff"/><path d="M32.38 24.46c0-.63-.06-1.24-.18-1.83H23v3.47h5.28a4.5 4.5 0 0 1-1.95 2.95v2.45h3.15c1.85-1.71 2.9-4.23 2.9-7.04z" fill="#4285F4"/><path d="M23 33c2.64 0 4.86-.87 6.48-2.36l-3.15-2.45c-.88.59-2.01.95-3.33.95-2.56 0-4.74-1.73-5.51-4.06h-3.22v2.54A9.997 9.997 0 0 0 23 33z" fill="#34A853"/><path d="M17.49 25.08a5.98 5.98 0 0 1 0-3.82v-2.54h-3.22a9.997 9.997 0 0 0 0 8.9l3.22-2.54z" fill="#FBBC05"/><path d="M23 18.56c1.44 0 2.75.5 3.77 1.48l2.83-2.83C27.86 15.71 25.64 15 23 15a10 10 0 0 0-8.73 5.18l3.22 2.54c.77-2.33 2.95-4.06 5.51-4.06z" fill="#EA4335"/></g></svg><span>Continue with Google</span>`; 
      btn.style.width = '100%'; 
      btn.type = 'button';
      bindOnce(btn, 'click', (ev) => { ev.preventDefault(); signInWithGooglePopup(); });
      gbtn2.appendChild(btn);
    }
  }

  // SIGNOUT HANDLER
  function performSignOut() {
    return (async function() {
      try {
        const currentUid = auth.currentUser?.uid || localStorage.getItem('mj_last_uid');
        
        try {
          if (messaging && messaging.getToken && auth.currentUser) {
            let swReg = null;
            if ('serviceWorker' in navigator) {
              try { swReg = await navigator.serviceWorker.ready; } catch (e) { swReg = null; }
            }
            const tokenOptions = swReg ? { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg } : { vapidKey: VAPID_KEY };
            const token = await messaging.getToken(tokenOptions).catch(() => null);
            if (token && auth.currentUser) {
              await db.collection('users').doc(auth.currentUser.uid)
                .update({ fcmTokens: firebase.firestore.FieldValue.arrayRemove(token) })
                .catch(()=>{});
            }
          }
        } catch (e) {
          console.warn('Error removing FCM token during sign out', e);
        }

        await auth.signOut();

        localStorage.removeItem('mj_remember_login');
        if (currentUid) localStorage.removeItem('mj_notif_prompt_shown_' + currentUid);
        sessionStorage.removeItem('mj_premium_modal_shown_for_themes');

        window.location.replace('login');
      } catch (err) {
        console.error('Sign out failed', err);
        showError('Unable to sign out');
      }
    })();
  }

  function setupSignOutHandlers() {
    const directSelectors = ['#signout-btn', '.signout-btn', '[data-action="signout"]'];
    directSelectors.forEach(sel => {
      Array.from(document.querySelectorAll(sel)).forEach(el => {
        bindOnce(el, 'click', (ev) => {
          ev.preventDefault();
          if (auth.currentUser && auth.currentUser.uid) localStorage.setItem('mj_last_uid', auth.currentUser.uid);
          performSignOut();
        });
      });
    });

    bindOnce(document, 'click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('#signout-btn, .signout-btn, [data-action="signout"]');
      if (!btn) return;
      ev.preventDefault();
      if (auth.currentUser && auth.currentUser.uid) localStorage.setItem('mj_last_uid', auth.currentUser.uid);
      performSignOut();
    });
  }

  bindOnce(document, 'DOMContentLoaded', () => setupSignOutHandlers());
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    try { setupSignOutHandlers(); } catch (e) {}
  }

  // UPGRADE/EXPORT BUTTONS
  const upgradeBtn = document.getElementById('upgrade-btn');
  if (upgradeBtn) bindOnce(upgradeBtn, 'click', () => openPremiumModal());

  const exportPdfBtn = document.getElementById('export-pdf-btn'), exportExcelBtn = document.getElementById('export-excel-btn');
  if (exportPdfBtn) bindOnce(exportPdfBtn, 'click', async () => {
    const u = auth.currentUser; if (!u) return window.location.href = 'login';
    const doc = await db.collection('users').doc(u.uid).get().catch(()=>null);
    const data = doc && doc.exists ? doc.data() : {};
    if (!data || !data.isPremium) { openPremiumModal(); return; }
    const snap = await db.collection('users').doc(u.uid).collection('entries').orderBy('createdAt','desc').get();
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    exportEntriesToPDF(entries);
  });
  if (exportExcelBtn) bindOnce(exportExcelBtn, 'click', async () => {
    const u = auth.currentUser; if (!u) return window.location.href = 'login';
    const doc = await db.collection('users').doc(u.uid).get().catch(()=>null);
    const data = doc && doc.exists ? doc.data() : {};
    if (!data || !data.isPremium) { openPremiumModal(); return; }
    const snap = await db.collection('users').doc(u.uid).collection('entries').orderBy('createdAt','desc').get();
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    exportEntriesToCSV(entries);
  });

  // Mood intercept
  bindOnce(document, 'click', async (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href*="mood"]');
    if (!a) return;
    try {
      ev.preventDefault();
      if (!auth.currentUser) return window.location.href = 'login';
      const doc = await db.collection('users').doc(auth.currentUser.uid).get().catch(()=>null);
      const data = doc && doc.exists ? doc.data() : {};
      if (!data || !data.isPremium) { openPremiumModal(); return; }
      window.location.href = a.href;
    } catch (e) { console.error(e); window.location.href = a.href; }
  });

  const splash = document.getElementById('splash-screen');
  if (splash) splash.classList.add('hidden');

  // Hook referral UI copy/regenerate
  (function hookReferralUI() {
    const copyBtn = document.getElementById('copy-ref-btn') || document.getElementById('copy-referral-btn');
    const regenBtn = document.getElementById('regen-ref-btn');
    const refLinkEl = document.getElementById('ref-link') || document.getElementById('referral-code') || document.getElementById('referral-code-input');

    if (copyBtn && refLinkEl) {
      bindOnce(copyBtn, 'click', async () => {
        try {
          const link = refLinkEl.value || (window.location.origin + '/signup?ref=' + (userProfile && userProfile.referralCode ? userProfile.referralCode : ''));
          await navigator.clipboard.writeText(link);
          toast('✓ Referral link copied');
        } catch (e) { showError('Copy failed'); }
      });
    }

    if (regenBtn) {
      bindOnce(regenBtn, 'click', async () => {
        if (!auth.currentUser) return showDialog('Please sign in to regenerate your referral link');
        if (!confirm('Regenerate your referral link? Previous link will stop working.')) return;
        try {
          const newCode = generateReferralCode();
          await db.collection('users').doc(auth.currentUser.uid).update({ referralCode: newCode });
          toast('✓ Referral link regenerated');
        } catch (e) { console.error(e); showError('Unable to regenerate referral code'); }
      });
    }
  })();
});

// ===========================
// HOME PAGE SETUP
// ===========================
let entriesCache = [];

function setupHomePage() {
  if (!document.querySelector('.page-app')) return;
  if (!auth.currentUser) return;

  const uid = auth.currentUser.uid;
  const welcomeEl = document.getElementById('welcome-title');
  if (welcomeEl) {
    welcomeEl.textContent = 'Welcome';
    let initialName = (auth.currentUser && (auth.currentUser.displayName || (auth.currentUser.email || '').split('@')[0])) || '';
    if (initialName) welcomeEl.textContent = `Welcome ${initialName}`;

    const userRef = db.collection('users').doc(uid);
    userRef.onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data() || {};
      const name = (data.username && String(data.username).trim()) ||
                   (auth.currentUser && auth.currentUser.displayName) ||
                   ((auth.currentUser && auth.currentUser.email) ? auth.currentUser.email.split('@')[0] : '');
      if (name) welcomeEl.textContent = `Welcome ${name}`;
      else welcomeEl.textContent = 'Welcome';
    }, err => {
      console.error('watch user for welcome title failed', err);
    });
  }

  function applyEntriesFromLocal() {
    const local = readLocalEntries(uid);
    if (local.length) {
      entriesCache = local.slice().sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      });
      renderEntriesList();
    }
  }

  // Show local cache immediately (works offline)
  applyEntriesFromLocal();

  if (isOffline()) {
    if (!entriesCache.length) {
      const listEl = document.getElementById('entries-list');
      if (listEl) listEl.innerHTML = '<p class="small-note" style="color:var(--text-muted)">Offline — no cached entries on this device yet. Connect once to load your journal.</p>';
    }
  } else {
    const q = db.collection('users').doc(uid).collection('entries').orderBy('createdAt','desc');
    q.onSnapshot(snapshot => {
      const docs = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
      // Merge any pending local-only entries
      const localOnly = readLocalEntries(uid).filter(e => String(e.id).startsWith('local_') || e._pendingSync);
      const byId = {};
      docs.forEach(d => { byId[d.id] = d; });
      localOnly.forEach(e => { if (!byId[e.id]) byId[e.id] = e; });
      entriesCache = Object.values(byId).sort((a, b) => {
        const ta = (a.createdAt && a.createdAt.toDate) ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const tb = (b.createdAt && b.createdAt.toDate) ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });
      // Persist server snapshot for offline use
      writeLocalEntries(uid, entriesCache.map(e => ({
        id: e.id,
        title: e.title || '',
        content: e.content || '',
        theme: e.theme || null,
        wordCount: e.wordCount || 0,
        createdAt: (e.createdAt && e.createdAt.toDate) ? e.createdAt.toDate().toISOString() : (e.createdAt || null),
        updatedAt: (e.updatedAt && e.updatedAt.toDate) ? e.updatedAt.toDate().toISOString() : (e.updatedAt || null)
      })));
      renderEntriesList();
    }, err => {
      console.error(err);
      applyEntriesFromLocal();
      if (!entriesCache.length) showError('Failed to load entries (offline cache empty)');
    });
  }

  const addBtn = document.getElementById('add-entry-btn');
  if (addBtn) bindOnce(addBtn, 'click', () => location.href = 'edit');

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let timer = null;
    const handler = () => { clearTimeout(timer); timer = setTimeout(renderEntriesList, 180); };
    searchInput.addEventListener('input', handler);
    searchInput.addEventListener('search', handler);
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); renderEntriesList(); } });
  }

  function renderEntriesList() {
    const listEl = document.getElementById('entries-list');
    if (!listEl) return;
    const qv = (document.getElementById('search-input') && document.getElementById('search-input').value) ? (document.getElementById('search-input').value || '').trim().toLowerCase() : '';
    const filtered = entriesCache.filter(en => {
      if (!qv) return true;
      const t = ((en.title || '') + ' ' + (en.content || '')).toLowerCase();
      return t.includes(qv);
    });
    listEl.innerHTML = '';
    if (!filtered.length) {
      listEl.innerHTML = `
        <div class="glass" style="padding:20px;border-radius:16px;border:1px solid rgba(123,108,255,0.25);text-align:left;">
          <h3 style="margin:0 0 8px;font-size:1.15rem;">Your journal starts here.</h3>
          <p style="color:var(--text-muted);font-size:14px;line-height:1.5;margin:0 0 12px;">
            You don't need to write a perfect story. Start by telling yourself:
          </p>
          <ul style="color:var(--text-muted);font-size:13px;line-height:1.7;margin:0 0 16px;padding-left:18px;">
            <li>How was your day?</li>
            <li>What happened today?</li>
            <li>How are you feeling?</li>
            <li>What made you happy?</li>
            <li>What challenged you?</li>
            <li>What are you grateful for?</li>
            <li>What would you like to remember?</li>
          </ul>
          <p style="color:var(--text-muted);font-size:13px;margin:0 0 14px;">Take a few minutes and write whatever feels meaningful to you.</p>
          <a href="edit" class="btn primary" style="display:inline-block;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700;background:linear-gradient(135deg,#7b6cff,#4dd3ff);color:#061020;">Start My First Entry</a>
        </div>`;
      return;
    }
    filtered.forEach(en => {
      const fullText = (en.content || '').replace(/<\/?[^>]+(>|$)/g, '').replace(/\s+/g, ' ').trim();
      // Wrap soft at ~40 chars per visual line for card safety
      function wrap40(str, maxLen) {
        const words = String(str || '').split(' ');
        const lines = [];
        let line = '';
        words.forEach(w => {
          if (!line) line = w;
          else if ((line + ' ' + w).length <= 40) line += ' ' + w;
          else { lines.push(line); line = w; }
        });
        if (line) lines.push(line);
        return lines.slice(0, maxLen);
      }
      const previewLines = wrap40(fullText, 3);
      const snippet = previewLines.join('\n');
      const needsToggle = fullText.length > snippet.length || previewLines.length >= 3 && fullText.length > 100;
      const safeFull = fullText.replace(/"/g, '&quot;');
      const div = document.createElement('div'); div.className = 'entry-item';
      const titleText = (en.title || '(No title)');
      const titleShort = titleText.length > 40 ? titleText.slice(0, 40) + '…' : titleText;
      let metaStr = '';
      try {
        if (en.updatedAt && en.updatedAt.toDate) metaStr = en.updatedAt.toDate().toLocaleString();
        else if (en.updatedAt) metaStr = new Date(en.updatedAt).toLocaleString();
        else if (en.createdAt && en.createdAt.toDate) metaStr = en.createdAt.toDate().toLocaleString();
        else if (en.createdAt) metaStr = new Date(en.createdAt).toLocaleString();
      } catch (e) {}
      div.innerHTML = `
        <div class="entry-left">
          <div class="entry-title"><a href="preview?id=${encodeURIComponent(en.id)}">${titleShort}</a></div>
          <div class="entry-snippet" data-full="${safeFull}">${snippet.replace(/</g,'&lt;').replace(/\n/g,'<br>')}${needsToggle ? '… <span class="more-toggle" role="button" tabindex="0">Read more</span>' : ''}</div>
          <div class="entry-meta">${metaStr}${en._pendingSync ? ' · <span style="color:var(--warning)">Pending sync</span>' : ''}</div>
        </div>`;
      listEl.appendChild(div);


      if (needsToggle) {
        const snippetEl = div.querySelector('.entry-snippet');
        const toggleEl = snippetEl.querySelector('.more-toggle');
        if (toggleEl) {
          const collapsedHtml = snippet.replace(/</g,'&lt;').replace(/\n/g,'<br>') + '… <span class="more-toggle" role="button" tabindex="0">Read more</span>';
          bindOnce(toggleEl, 'click', (ev) => {
            ev.preventDefault();
            const full = snippetEl.getAttribute('data-full') || '';
            const expanded = wrap40(full, 999).join('\n').replace(/</g,'&lt;').replace(/\n/g,'<br>');
            snippetEl.innerHTML = expanded + ' <span class="more-toggle" role="button" tabindex="0">Show less</span>';
            const newToggle = snippetEl.querySelector('.more-toggle');
            bindOnce(newToggle, 'click', (e) => {
              e.preventDefault();
              snippetEl.innerHTML = collapsedHtml;
              const again = snippetEl.querySelector('.more-toggle');
              if (again) bindOnce(again, 'click', () => toggleEl.click());
            });
          });
          bindOnce(toggleEl, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEl.click(); } });
        }
      }
    });
  }
}

// ===========================
// EDIT PAGE SETUP - THEMES HIDDEN BY DEFAULT
// ===========================
function setupEditPage() {
  if (!location.pathname.endsWith('edit')) return;
  const editor = document.getElementById('entry-content');
  if (!editor) return;

  const titleInput = document.getElementById('entry-title');
  const saveBtn = document.getElementById('save-entry');
  const blockFormat = document.getElementById('block-format');
  const toolbarButtons = document.querySelectorAll('.editor-toolbar button[data-cmd]');
  const colorPicker = document.getElementById('color-picker');
  const orderedBtn = document.getElementById('ordered-list-btn');
  const letteredBtn = document.getElementById('lettered-list-btn');
  const themeToggle = document.getElementById('theme-toggle');
  const themePalette = document.getElementById('theme-palette');
  const tagsInput = document.getElementById('tags-input');
  let isPremiumCached = false;

  let wcDisplay = document.getElementById('word-count-display');
  if (!wcDisplay && saveBtn) {
    wcDisplay = document.createElement('div');
    wcDisplay.id = 'word-count-display';
    wcDisplay.style = 'font-size:13px;color:var(--muted);margin-top:8px;text-align:right';
    saveBtn.parentNode.insertBefore(wcDisplay, saveBtn.nextSibling);
  }

  (async function fetchPremiumState() {
    try {
      if (auth.currentUser) {
        const doc = await db.collection('users').doc(auth.currentUser.uid).get().catch(()=>null);
        isPremiumCached = !!(doc && doc.exists && doc.data().isPremium);
      }
    } catch(e){ console.warn('fetchPremiumState failed', e); }
  })();

  const THEME_PREVIEWS = [
    { id: 'theme-1', name: 'Serene Blue', previewBg: '#071029', previewFg: '#eaf2ff', isPremium: false },
    { id: 'theme-2', name: 'Light Breeze', previewBg: '#f6fbff', previewFg: '#041025', isPremium: false },
    { id: 'theme-3', name: 'Warm Sand', previewBg: '#fff6ea', previewFg: '#2b1f12', isPremium: false },
    { id: 'theme-4', name: 'Sunset Glow', previewBg: 'linear-gradient(135deg,#ff7e5f,#feb47b)', previewFg: '#041025', isPremium: true },
    { id: 'theme-5', name: 'Aurora', previewBg: 'linear-gradient(135deg,#7b6cff,#4dd3ff)', previewFg: '#ffffff', isPremium: true },
    { id: 'theme-6', name: 'Mint Fresh', previewBg: 'linear-gradient(135deg,#11998e,#38ef7d)', previewBgSolid: '#8ce07f', previewFg: '#041025', isPremium: true },
    { id: 'theme-7', name: 'Ember Night', previewBg: 'linear-gradient(135deg,#2c0000,#ff4e50)', previewFg: '#fff5f5', isPremium: true },
    { id: 'theme-8', name: 'Lavender Mist', previewBg: 'linear-gradient(135deg,#a18cd1,#fbc2eb)', previewFg: '#1a1025', isPremium: true },
    { id: 'theme-9', name: 'Ocean Depth', previewBg: 'linear-gradient(135deg,#0f2027,#203a43,#2c5364)', previewFg: '#e8f4ff', isPremium: true },
    { id: 'theme-10', name: 'Golden Hour', previewBg: 'linear-gradient(135deg,#f7971e,#ffd200)', previewFg: '#2b1f00', isPremium: true },
    { id: 'theme-11', name: 'Nordic Slate', previewBg: 'linear-gradient(135deg,#232526,#414345)', previewFg: '#f0f0f0', isPremium: true },
    { id: 'theme-12', name: 'Rose Quartz', previewBg: 'linear-gradient(135deg,#ee9ca7,#ffdde1)', previewFg: '#3b1520', isPremium: true }
  ];

  if (themePalette && themePalette.children.length === 0) {
    themePalette.style.display = 'none'; // START HIDDEN
    themePalette.style.flexWrap = 'wrap';
    themePalette.style.justifyContent = 'flex-start';
    themePalette.style.padding = '12px';
    themePalette.style.borderRadius = '12px';
    themePalette.style.background = 'rgba(255,255,255,0.02)';
    themePalette.style.border = '1px solid rgba(255,255,255,0.04)';
    
    THEME_PREVIEWS.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small';
      btn.style = `padding:8px 12px;display:flex;align-items:center;gap:8px;text-align:left;min-width:120px`;
      btn.dataset.theme = t.id;
      btn.dataset.premium = t.isPremium ? '1' : '0';

      const sw = document.createElement('div');
      sw.style = `width:32px;height:32px;border-radius:8px;background:${t.previewBg};border:1px solid rgba(0,0,0,0.1)`;

      const lbl = document.createElement('div');
      lbl.style = 'flex:1;font-size:12px;font-weight:700';
      lbl.innerHTML = t.name + (t.isPremium ? ' 🔒' : '');

      btn.appendChild(sw);
      btn.appendChild(lbl);

      bindOnce(btn, 'click', (e) => {
        e.preventDefault();
        THEME_PREVIEWS.forEach(tt => editor.classList.remove(tt.id));
        editor.classList.add(t.id);
        editor.dataset.pendingTheme = t.id;
        toast(`${t.name} preview`);
      });

      themePalette.appendChild(btn);
    });
  }

  if (themeToggle) bindOnce(themeToggle, 'click', () => {
    const isHidden = themePalette.style.display === 'none';
    themePalette.style.display = isHidden ? 'flex' : 'none';
  });

  let history = [''];
  let historyStep = 0;
  function saveHistory() {
    history = history.slice(0, historyStep + 1);
    history.push(editor.innerHTML);
    historyStep++;
  }
  
  editor.addEventListener('input', () => {
    if (historyStep > 0 && history[historyStep] === editor.innerHTML) return;
    saveHistory();
    updateWordCount();
  });

  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'btn small';
  undoBtn.innerHTML = '↶';
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.addEventListener('click', () => {
    if (historyStep > 0) {
      historyStep--;
      editor.innerHTML = history[historyStep];
      editor.focus();
      updateWordCount();
    }
  });

  const redoBtn = document.createElement('button');
  redoBtn.type = 'button';
  redoBtn.className = 'btn small';
  redoBtn.innerHTML = '↷';
  redoBtn.title = 'Redo (Ctrl+Y)';
  redoBtn.addEventListener('click', () => {
    if (historyStep < history.length - 1) {
      historyStep++;
      editor.innerHTML = history[historyStep];
      editor.focus();
      updateWordCount();
    }
  });

  const toolGroup = document.querySelector('.editor-toolbar .tool-group:first-child');
  if (toolGroup) {
    toolGroup.insertBefore(undoBtn, toolGroup.firstChild);
    toolGroup.insertBefore(redoBtn, toolGroup.firstChild.nextSibling);
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undoBtn.click(); }
      if (e.key === 'y' || (e.shiftKey && e.key === 'z')) { e.preventDefault(); redoBtn.click(); }
    }
  });

  function updateWordCount() {
    const wc = getWordCount(editor.innerHTML);
    const wcDisplay = document.getElementById('word-count-display');
    if (wcDisplay) {
      wcDisplay.textContent = `Words: ${wc}`;
      wcDisplay.style.color = wc > 600 ? 'var(--danger)' : 'var(--muted)';
    }

    (async function liveEnforce() {
      let isPremium = isPremiumCached || (userProfile && userProfile.isPremium);
      if (!isPremium && auth.currentUser) {
        try {
          const doc = await db.collection('users').doc(auth.currentUser.uid).get().catch(()=>null);
          isPremium = !!(doc && doc.exists && doc.data().isPremium);
          isPremiumCached = isPremium;
        } catch (e) { /* ignore */ }
      }

      if (!isPremium && wc > 600) {
        if (saveBtn) saveBtn.setAttribute('disabled','true');
        const key = 'mj_word_limit_shown';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          openPremiumModal();
        }
      } else {
        if (saveBtn) saveBtn.removeAttribute('disabled');
      }
    })();
  }

  if (blockFormat) bindOnce(blockFormat, 'change', () => ensurePremiumThenRun(() => applyBlockFormat(blockFormat.value)));

  toolbarButtons.forEach(btn => {
    const cmd = btn.dataset.cmd;
    bindOnce(btn, 'click', () => ensurePremiumThenRun(() => execFormattingCommand(cmd)));
  });

  if (orderedBtn) bindOnce(orderedBtn, 'click', () => ensurePremiumThenRun(() => toggleOrderedList('decimal')));
  if (letteredBtn) bindOnce(letteredBtn, 'click', () => ensurePremiumThenRun(() => toggleOrderedList('alpha')));
  document.querySelectorAll('[data-cmd="indent"], [data-cmd="outdent"]').forEach(b => bindOnce(b, 'click', () => ensurePremiumThenRun(() => execFormattingCommand(b.dataset.cmd))));
  document.querySelectorAll('[data-cmd^="justify"]').forEach(b => bindOnce(b, 'click', () => ensurePremiumThenRun(() => execFormattingCommand(b.dataset.cmd))));
  if (colorPicker) bindOnce(colorPicker, 'input', (e) => ensurePremiumThenRun(() => applyForeColor(e.target.value)));

  if (saveBtn) bindOnce(saveBtn, 'click', async () => {
    const content = editor.innerHTML.trim();
    if (!content) return showError('Entry content cannot be empty');

    const wc = getWordCount(content);
    const limit = await checkWordLimit(auth.currentUser.uid, wc);
    if (!limit.allowed) {
      showDialog(`Your entry is ${limit.current} words and exceeds the free limit (${limit.limit} words). Upgrade to Premium for unlimited words.`, {
        title: 'Word limit exceeded',
        buttons: [
          { text: 'Upgrade', class: 'btn primary', onClick: () => openPremiumModal() },
          { text: 'Cancel', class: 'btn' }
        ]
      });
      return;
    }

    try {
      const uid = auth.currentUser.uid;
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const id = new URL(location.href).searchParams.get('id');
      const theme = editor.dataset.pendingTheme || null;

      if (theme) {
        const themeDef = THEME_PREVIEWS.find(t => t.id === theme);
        if (themeDef && themeDef.isPremium) {
          const doc = await db.collection('users').doc(uid).get().catch(()=>null);
          const userData = doc && doc.exists ? doc.data() : {};
          if (!userData || !userData.isPremium) {
            const shownKey = 'mj_premium_modal_shown_for_themes';
            if (!sessionStorage.getItem(shownKey)) {
              openPremiumModal();
              sessionStorage.setItem(shownKey, '1');
            } else {
              showDialog('This theme is a premium feature. Upgrade to save with premium themes.');
            }
            return;
          }
        }
      }

      const payload = { 
        title: (titleInput.value || '').trim(), 
        content, 
        theme, 
        wordCount: wc,
        updatedAt: now, 
        createdAt: now 
      };

      const ref = db.collection('users').doc(uid).collection('entries');
      const offlinePayload = Object.assign({}, payload, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _pendingSync: true
      });

      if (isOffline()) {
        const localId = upsertLocalEntry(uid, Object.assign({ id: id || undefined }, offlinePayload));
        queueOfflineAction({ type: 'entry', id: (id && !String(id).startsWith('local_')) ? id : localId, data: offlinePayload });
        toast('✓ Saved offline — will sync when online');
      } else {
        try {
          if (id) {
            await ref.doc(id).update({ 
              title: payload.title, 
              content: payload.content, 
              theme: payload.theme,
              wordCount: payload.wordCount,
              updatedAt: now 
            });
            upsertLocalEntry(uid, Object.assign({ id: id }, offlinePayload, { _pendingSync: false }));
            toast('✓ Updated');
          } else {
            const docRef = await ref.add(payload);
            upsertLocalEntry(uid, Object.assign({ id: docRef.id }, offlinePayload, { _pendingSync: false }));
            toast('✓ Saved');
          }
        } catch (netErr) {
          const localId = upsertLocalEntry(uid, Object.assign({ id: id || undefined }, offlinePayload));
          queueOfflineAction({ type: 'entry', id: (id && !String(id).startsWith('local_')) ? id : localId, data: offlinePayload });
          toast('✓ Saved offline — will sync when online');
        }
      }
      window.location.href = 'home';
    } catch (err) { console.error(err); showError('Unable to save entry'); }
  });

  const cancelBtn = document.getElementById('cancel-entry');
  if (cancelBtn) bindOnce(cancelBtn, 'click', () => window.location.href = 'home');

  (async function loadIfExists() {
    const id = new URL(location.href).searchParams.get('id');
    if (!id) return;
    if (!auth.currentUser) return window.location.href = 'login';
    try {
      const doc = await db.collection('users').doc(auth.currentUser.uid).collection('entries').doc(id).get();
      if (!doc.exists) return;
      const d = doc.data();
      titleInput.value = d.title || '';
      editor.innerHTML = d.content || '';
      if (d.theme) { editor.classList.add(d.theme); editor.dataset.pendingTheme = d.theme; }
      updateWordCount();
    } catch (e) { console.error(e); }
  })();
}

// ===========================
// PREVIEW PAGE SETUP
// ===========================
function setupPreviewPage() {
  if (!location.pathname.endsWith('preview')) return;
  const id = new URL(location.href).searchParams.get('id');
  
  if (new URL(location.href).searchParams.get('temp')) {
    document.getElementById('preview-title').textContent = sessionStorage.getItem('preview_entry_title') || '(No title)';
    const pc = document.getElementById('preview-content');
    const content = sessionStorage.getItem('preview_entry_content') || '';
    pc.innerHTML = content;
    if (pc && pc.dataset && pc.dataset.theme) pc.classList.add(pc.dataset.theme);
    document.getElementById('preview-meta').textContent = 'Preview (not saved)';
    return;
  }
  
  if (!id) return showError('Missing entry id');

  auth.onAuthStateChanged(async (u) => {
    if (!u) return window.location.href = 'login';
    function renderPreview(d, metaExtra) {
      document.getElementById('preview-title').textContent = d.title || '(No title)';
      const contentEl = document.getElementById('preview-content');
      contentEl.innerHTML = d.content || '';
      if (d.theme) contentEl.classList.add(d.theme);
      let meta = '';
      try {
        if (d.updatedAt && d.updatedAt.toDate) meta = d.updatedAt.toDate().toLocaleString();
        else if (d.updatedAt) meta = new Date(d.updatedAt).toLocaleString();
      } catch (e) {}
      document.getElementById('preview-meta').textContent = (meta || '') + (metaExtra || '');
      const editLink = document.getElementById('edit-link');
      if (editLink) editLink.setAttribute('href', `edit?id=${id}`);
    }
    try {
      if (isOffline()) {
        const local = readLocalEntries(u.uid).find(e => e.id === id);
        if (!local) { showError('Entry not in offline cache'); return; }
        renderPreview(local, ' · Offline copy');
        return;
      }
      const doc = await db.collection('users').doc(u.uid).collection('entries').doc(id).get();
      if (!doc.exists) {
        const local = readLocalEntries(u.uid).find(e => e.id === id);
        if (local) { renderPreview(local, ' · Local copy'); return; }
        showError('Entry not found'); window.location.href = 'home'; return;
      }
      const d = doc.data();
      renderPreview(d, '');
      const deleteBtn = document.getElementById('delete-entry');
      if (deleteBtn) bindOnce(deleteBtn, 'click', async () => {
        if (!confirm('Delete this entry?')) return;
        try {
          if (isOffline()) {
            queueOfflineAction({ type: 'deleteEntry', id });
            writeLocalEntries(u.uid, readLocalEntries(u.uid).filter(e => e.id !== id));
            toast('✓ Deleted offline — will sync');
            window.location.href = 'home';
            return;
          }
          await db.collection('users').doc(u.uid).collection('entries').doc(id).delete();
          writeLocalEntries(u.uid, readLocalEntries(u.uid).filter(e => e.id !== id));
          toast('✓ Deleted');
          window.location.href = 'home';
        } catch (e) {
          queueOfflineAction({ type: 'deleteEntry', id });
          writeLocalEntries(u.uid, readLocalEntries(u.uid).filter(e => e.id !== id));
          toast('✓ Deleted offline — will sync');
          window.location.href = 'home';
        }
      });
    } catch (e) {
      console.error(e);
      const local = readLocalEntries(u.uid).find(e => e.id === id);
      if (local) renderPreview(local, ' · Offline fallback');
      else showError('Unable to load entry');
    }
  });
}

// ===========================
// MOOD PAGE GATING
// ===========================
function setupMoodPageGate() {
  if (!location.pathname.endsWith('mood')) return;
  auth.onAuthStateChanged(async (u) => {
    if (!u) return window.location.href = 'login';
    let data = {};
    try {
      const docSnap = await db.collection('users').doc(u.uid).get();
      data = docSnap && docSnap.exists ? docSnap.data() : {};
      cachePremiumFlag(!!data.isPremium);
    } catch (e) {
      data = { isPremium: readCachedPremium() };
    }
    if (!data || !data.isPremium) {
      openPremiumModal();
      document.body.style.pointerEvents = 'none';
      const ov = document.getElementById('mj-premium-overlay');
      if (ov) ov.style.pointerEvents = 'auto';
      const closeObserver = new MutationObserver(() => {
        const modal = document.getElementById('mj-premium-overlay');
        if (!modal || modal.style.display === 'none') {
          db.collection('users').doc(u.uid).get().then(s => {
            const dd = s && s.exists ? s.data() : {};
            if (!dd || !dd.isPremium) window.location.href = 'home';
            else { document.body.style.pointerEvents = ''; closeObserver.disconnect(); }
          }).catch(() => { window.location.href = 'home'; });
        }
      });
      closeObserver.observe(document.getElementById('mj-premium-overlay'), { attributes: true, attributeFilter: ['style'] });
      return;
    }
    initMoodPageFeatures(u.uid);
  });
}

// ===========================
// SETTINGS PAGE
// ===========================
function setupSettingsPage() {
  if (!document.querySelector('.page-settings')) return;
  if (!auth.currentUser) return;

  const uid = auth.currentUser.uid;

  (async () => {
    try {
      const doc = await db.collection('users').doc(uid).get();
      const profile = doc.exists ? doc.data() : {};
      
      userProfile = profile;

      if (userProfile.username) document.getElementById('settings-username').value = userProfile.username;
      if (auth.currentUser.email) document.getElementById('settings-email').value = auth.currentUser.email;
      
      const pinEnabled = !!userProfile.pinEnabled;
      document.getElementById('pin-status-text').textContent = pinEnabled ? 'PIN is enabled' : 'PIN not set';
      document.getElementById('disable-pin-btn').style.display = pinEnabled ? 'inline-flex' : 'none';
      document.getElementById('pin-setup').style.display = 'none';
      
      const refLinkEl = document.getElementById('ref-link') || document.getElementById('referral-code') || document.getElementById('referral-code-input');
      if (refLinkEl) {
        const code = userProfile.referralCode || generateReferralCode();
        if (!userProfile.referralCode) {
          await db.collection('users').doc(uid).update({ referralCode: code });
        }
        const link = window.location.origin + '/signup?ref=' + code;
        refLinkEl.value = link;
      }
      const refCountEl = document.getElementById('ref-count') || document.getElementById('referral-count');
      if (refCountEl) {
        const cnt = userProfile.referralCount || 0;
        refCountEl.textContent = cnt + ' friends';
        const prog = document.getElementById('ref-progress');
        if (prog) prog.textContent = cnt >= 3 ? '✓ Premium unlocked via referrals' : `(${cnt}/3 to unlock Premium)`;
      }

      // PIN lock mode select restore
      const pinModeSel = document.getElementById('pin-lock-mode');
      if (pinModeSel && userProfile.pinLockMode) pinModeSel.value = userProfile.pinLockMode;

      // ===== Devices list (premium) =====
      const isPrem = !!userProfile.isPremium;
      const devicesList = document.getElementById('devices-list');
      const devicesHint = document.getElementById('devices-premium-hint');
      if (devicesList) {
        if (!isPrem) {
          devicesList.innerHTML = '<p style="color:var(--muted);font-size:13px;">Devices are recorded. Upgrade to Premium to view and manage them.</p>';
          if (devicesHint) devicesHint.style.display = 'block';
        } else {
          if (devicesHint) devicesHint.style.display = 'none';
          const devices = userProfile.devices || [];
          if (!devices.length) {
            devicesList.innerHTML = '<p style="color:var(--muted);font-size:13px;">No devices recorded yet. Sign in from another device to see it here.</p>';
          } else {
            const currentId = getDeviceFingerprint();
            devicesList.innerHTML = devices.map(d => {
              const loc = d.location || {};
              const locStr = loc.city || loc.country ? `${loc.city || ''}${loc.city && loc.country ? ', ' : ''}${loc.country || ''}` : (loc.lat ? `${Number(loc.lat).toFixed(3)}, ${Number(loc.lng).toFixed(3)}` : 'Location unknown');
              const last = d.lastActive ? (typeof d.lastActive === 'string' ? new Date(d.lastActive).toLocaleString() : 'Recent') : '—';
              const isCurrent = d.deviceId === currentId;
              return `<div class="device-item" data-device-id="${d.deviceId}">
                <div class="device-info">
                  <div class="device-name">${d.label || 'Device'}${isCurrent ? ' <span style="color:var(--success);font-size:11px">(this device)</span>' : ''}</div>
                  <div class="device-meta">${locStr} · Last active: ${last}</div>
                </div>
                <div class="device-actions">
                  ${!isCurrent ? `<button class="btn small danger device-logout-btn" data-id="${d.deviceId}">Logout</button>` : ''}
                  <button class="btn small device-preview-btn" data-id="${d.deviceId}">Details</button>
                </div>
              </div>`;
            }).join('');
            devicesList.querySelectorAll('.device-logout-btn').forEach(btn => {
              btn.addEventListener('click', async () => {
                if (!confirm('Log out this device remotely?')) return;
                await logoutRemoteDevice(uid, btn.dataset.id);
                setupSettingsPage();
              });
            });
            devicesList.querySelectorAll('.device-preview-btn').forEach(btn => {
              btn.addEventListener('click', () => {
                const d = devices.find(x => x.deviceId === btn.dataset.id);
                if (!d) return;
                const loc = d.location || {};
                showDialog(
                  `Device: ${d.label}\nUA: ${(d.userAgent||'').slice(0,80)}...\nLocation: ${loc.lat ? loc.lat+', '+loc.lng : 'n/a'} (${loc.city||''} ${loc.country||''})\nAccuracy: ${loc.accuracy||'n/a'}m\nLast: ${d.lastActive}`,
                  { title: 'Device details', icon: '📱' }
                );
              });
            });
          }
        }
      }

      // ===== Theme controls (premium) =====
      const themeControls = document.getElementById('theme-controls');
      const themeHint = document.getElementById('theme-premium-hint');
      const themeSel = document.getElementById('app-theme-select');
      const bgSel = document.getElementById('bg-style-select');
      if (themeSel) themeSel.value = userProfile.appTheme || 'default';
      if (bgSel) bgSel.value = userProfile.bgStyle || 'gradient';
      if (!isPrem) {
        if (themeControls) themeControls.style.opacity = '0.55';
        if (themeHint) themeHint.style.display = 'block';
      } else {
        if (themeHint) themeHint.style.display = 'none';
        if (themeControls) themeControls.style.opacity = '1';
      }
      
      // Visual swatches for theme / background
      const themeGrid = document.getElementById('theme-swatch-grid');
      const bgGrid = document.getElementById('bg-swatch-grid');
      if (themeGrid && themeSel) {
        themeGrid.querySelectorAll('.theme-swatch').forEach(btn => {
          if (btn.dataset.theme === themeSel.value) btn.classList.add('selected');
          else btn.classList.remove('selected');
          btn.addEventListener('click', () => {
            themeGrid.querySelectorAll('.theme-swatch').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            themeSel.value = btn.dataset.theme;
            applyThemeAndBg(themeSel.value, (bgSel && bgSel.value) || 'gradient');
          });
        });
      }
      if (bgGrid && bgSel) {
        bgGrid.querySelectorAll('.bg-swatch').forEach(btn => {
          if (btn.dataset.bg === bgSel.value) btn.classList.add('selected');
          else btn.classList.remove('selected');
          btn.addEventListener('click', () => {
            bgGrid.querySelectorAll('.bg-swatch').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            bgSel.value = btn.dataset.bg;
            applyThemeAndBg((themeSel && themeSel.value) || 'default', bgSel.value);
          });
        });
      }

bindOnce(document.getElementById('save-theme-btn'), 'click', async () => {
        if (!isPrem) {
          openPremiumModal();
          return;
        }
        const theme = (themeSel && themeSel.value) || 'default';
        const bgStyle = (bgSel && bgSel.value) || 'gradient';
        try {
          await db.collection('users').doc(uid).set({ appTheme: theme, bgStyle }, { merge: true });
          try { localStorage.setItem('mj_theme_' + uid, JSON.stringify({ theme, bgStyle })); } catch(e){}
          applyThemeAndBg(theme, bgStyle);
          toast('✓ Theme applied');
        } catch (e) {
          // offline fallback
          queueOfflineAction({ type: 'settings', data: { appTheme: theme, bgStyle } });
          try { localStorage.setItem('mj_theme_' + uid, JSON.stringify({ theme, bgStyle })); } catch(e){}
          applyThemeAndBg(theme, bgStyle);
          toast('✓ Theme saved locally (will sync when online)');
        }
      });

      bindOnce(document.getElementById('enable-pin-btn'), 'click', async () => {
        const udoc = await db.collection('users').doc(uid).get().catch(()=>null);
        const isPremium = udoc && udoc.exists && udoc.data().isPremium;
        if (!isPremium) {
          showDialog('PIN Protection is a Premium feature', {
            title: '🔐 Premium Feature',
            buttons: [
              { text: 'Upgrade', class: 'btn primary', onClick: () => openPremiumModal() },
              { text: 'Cancel', class: 'btn' }
            ]
          });
          return;
        }
        document.getElementById('pin-setup').style.display = 'block';
      });

      bindOnce(document.getElementById('save-pin'), 'click', async () => {
        const newPinInput = document.getElementById('new-pin') || { value: '' };
        const confirmPinInput = document.getElementById('confirm-pin') || { value: '' };
        const a = (newPinInput.value || '').trim();
        const b = (confirmPinInput.value || '').trim();
        if (!a || a.length < 4) return showError('PIN must be 4 digits');
        if (a !== b) return showError('PINs do not match');
        if (!/^\d{4,6}$/.test(a)) return showError('PIN must be numeric (4-6 digits)');
        try {
          const pinHash = await hashPin(a, uid);
          if (!pinHash) throw new Error('hash failed');
          const lockMode = (document.getElementById('pin-lock-mode') || {}).value || 'immediate';
          await db.collection('users').doc(uid).update({
            pinHash: pinHash,
            pinEnabled: true,
            pinLockMode: lockMode,
            pinUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          localStorage.setItem('pinLocked', 'true');
          localStorage.setItem('pinLockMode', lockMode);
          localStorage.setItem('pinLastActivity', String(Date.now()));
          toast('✓ PIN enabled');
          document.getElementById('pin-status-text').textContent = 'PIN is enabled';
          document.getElementById('disable-pin-btn').style.display = 'inline-flex';
          document.getElementById('pin-setup').style.display = 'none';
        } catch (err) {
          console.error(err);
          showError('Unable to enable PIN');
        }
      });

      bindOnce(document.getElementById('disable-pin-btn'), 'click', async () => {
        if (!confirm('Disable PIN protection?')) return;
        try {
          await db.collection('users').doc(uid).update({ pinEnabled: false, pinHash: firebase.firestore.FieldValue.delete() });
          localStorage.setItem('pinLocked', 'false');
          toast('✓ PIN disabled');
          document.getElementById('pin-status-text').textContent = 'PIN not set';
          document.getElementById('disable-pin-btn').style.display = 'none';
        } catch (err) {
          console.error(err);
          showError('Unable to disable PIN');
        }
      });

      bindOnce(document.getElementById('save-settings'), 'click', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-settings');
        btn.setAttribute('disabled','true');
        try {
          const newUser = (document.getElementById('settings-username') || {}).value.trim();
          const newPassword = (document.getElementById('settings-password') || {}).value || '';
          const payload = {};
          if (newUser) payload.username = newUser;
          if (Object.keys(payload).length) {
            if (isOffline()) {
              queueOfflineAction({ type: 'settings', data: Object.assign({}, payload) });
              try {
                const cached = JSON.parse(localStorage.getItem('mj_user_profile_' + uid) || '{}');
                localStorage.setItem('mj_user_profile_' + uid, JSON.stringify(Object.assign(cached, payload)));
              } catch (e) {}
              toast('✓ Settings saved offline — will sync when online');
            } else {
              try {
                await db.collection('users').doc(uid).update(Object.assign({
                  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, payload));
                toast('✓ Settings saved');
              } catch (err) {
                queueOfflineAction({ type: 'settings', data: payload });
                toast('✓ Settings saved offline — will sync when online');
              }
            }
          }
          if (newPassword) {
            if (isOffline()) toast('Password change needs internet');
            else await auth.currentUser.updatePassword(newPassword);
          }
          if (document.getElementById('settings-password')) {
            document.getElementById('settings-password').value = '';
          }
        } catch (err) { console.error(err); showError(err); } 
        finally { btn.removeAttribute('disabled'); }
      });

      bindOnce(document.getElementById('change-email-btn'), 'click', (e) => {
        const modal = document.getElementById('email-change-modal');
        if (modal) modal.classList.remove('hidden');
        const newEmailInput = document.getElementById('new-email-input');
        if (newEmailInput) newEmailInput.value = document.getElementById('settings-email').value || '';
        const pwd = document.getElementById('email-change-password');
        if (pwd) pwd.value = '';
      });

      bindOnce(document.getElementById('email-change-cancel'), 'click', () => {
        document.getElementById('email-change-modal').classList.add('hidden');
      });

      bindOnce(document.getElementById('email-change-send'), 'click', async () => {
        const newEmailInput = document.getElementById('new-email-input');
        const pwdInput = document.getElementById('email-change-password');
        const newEmail = (newEmailInput && newEmailInput.value || '').trim();
        const password = (pwdInput && pwdInput.value) || '';
        
        if (!newEmail) return showError('Enter a new email address');
        
        try {
          const currentUser = auth.currentUser;
          const providerIds = (currentUser.providerData || []).map(p => p.providerId);
          
          if (providerIds.includes('password')) {
            if (!password) return showError('Enter your current password to confirm');
            const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
            await currentUser.reauthenticateWithCredential(cred);
          } else if (providerIds.includes('google.com')) {
            const provider = new firebase.auth.GoogleAuthProvider();
            await currentUser.reauthenticateWithPopup(provider);
          }
          
          await currentUser.verifyBeforeUpdateEmail(newEmail);
          document.getElementById('email-change-modal').classList.add('hidden');
          toast('✓ Verification email sent to ' + newEmail + '. Please check and confirm.');
        } catch (err) { console.error(err); showError(err); }
      });

      bindOnce(document.getElementById('delete-account'), 'click', () => {
        document.getElementById('reauth-modal').classList.remove('hidden');
      });

      bindOnce(document.getElementById('reauth-cancel'), 'click', () => {
        document.getElementById('reauth-modal').classList.add('hidden');
        document.getElementById('reauth-password').value = '';
      });

      bindOnce(document.getElementById('reauth-confirm'), 'click', async () => {
        const pw = (document.getElementById('reauth-password') || {}).value || '';
        if (!pw) return showError('Enter your current password');
        try {
          const cred = firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, pw);
          await auth.currentUser.reauthenticateWithCredential(cred);
          
          const batch = db.batch();
          batch.delete(db.collection('users').doc(uid));
          await batch.commit().catch(()=>{});
          await auth.currentUser.delete();
          
          toast('✓ Account deleted');
          window.location.href = 'login';
        } catch (err) { showError(err); }
      });

    } catch (e) { console.error(e); }
  })();
}

// ===========================
// PREMIUM GATING HELPER
// ===========================
async function ensurePremiumThenRun(action) {
  try {
    const u = auth.currentUser;
    if (!u) { showDialog('Please sign in to use this feature'); return; }
    const doc = await db.collection('users').doc(u.uid).get().catch(()=>null);
    const userData = doc && doc.exists ? doc.data() : {};
    if (userData && userData.isPremium) { action(); return; }
    openPremiumModal();
    return;
  } catch (e) { console.error(e); showError('Unable to verify premium status'); }
}

// ===========================
// EXPOSE UTILITIES
// ===========================
window.mj = window.mj || {};
window.mj.openPremiumModal = openPremiumModal;
window.mj.showError = showError;
window.mj.toast = toast;
window.mj.userProfile = () => userProfile;
window.mj.hashPin = hashPin;
window.mj.generateReferralCode = generateReferralCode;
