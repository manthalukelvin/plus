(() => {
  'use strict';

  let deferredPrompt = null;
  const BANNER_ID = 'mj-pwa-install-banner';
  const LS_INSTALLED = 'mj_pwa_installed';
  const LS_DISMISSED = 'mj_pwa_dismissed_until';
  const LS_INSTALL_REPORTED = 'mj_pwa_install_reported';

  /** True when the app is already running as an installed PWA */
  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.navigator.standalone === true
    );
  }

  /** True when we should treat this browser/profile as already having installed the PWA */
  function isInstalled() {
    if (isStandalone()) return true;
    if (localStorage.getItem(LS_INSTALLED) === '1') return true;
    return false;
  }

  function isDismissed() {
    return Number(localStorage.getItem(LS_DISMISSED) || 0) >= Date.now();
  }

  function removeBanner() {
    const el = document.getElementById(BANNER_ID);
    if (el) el.remove();
  }

  /** Hide the install UI permanently for this browser and mark as installed */
  function markInstalled() {
    localStorage.setItem(LS_INSTALLED, '1');
    localStorage.removeItem(LS_DISMISSED);
    deferredPrompt = null;
    removeBanner();
    reportInstallToBackend();
  }

  /**
   * Count PWA installs (server-side / Firestore).
   * Safe to call multiple times – only reports once per browser profile.
   */
  function reportInstallToBackend() {
    if (localStorage.getItem(LS_INSTALL_REPORTED) === '1') return;
    localStorage.setItem(LS_INSTALL_REPORTED, '1');

    try {
      // Prefer Firebase if already loaded on the page
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        const db = firebase.firestore();
        const auth = firebase.auth();
        const payload = {
          type: 'pwa_install',
          platform: navigator.platform || 'unknown',
          userAgent: (navigator.userAgent || '').slice(0, 200),
          language: navigator.language || null,
          standalone: isStandalone(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          uid: auth.currentUser ? auth.currentUser.uid : null
        };

        // Global counter (atomic)
        db.collection('stats').doc('pwa').set(
          {
            totalInstalls: firebase.firestore.FieldValue.increment(1),
            lastInstallAt: firebase.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        ).catch(function () {});

        // Per-user install record when authenticated
        if (auth.currentUser) {
          db.collection('users').doc(auth.currentUser.uid)
            .collection('pwaInstalls')
            .add(payload)
            .catch(function () {});

          db.collection('users').doc(auth.currentUser.uid).set(
            {
              pwaInstalled: true,
              pwaInstalledAt: firebase.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          ).catch(function () {});
        } else {
          // Anonymous install event for analytics
          db.collection('pwaInstallEvents').add(payload).catch(function () {});
        }
        return;
      }

      // Fallback: send to future Node.js backend if available
      if (window.MJ_API_BASE) {
        fetch(window.MJ_API_BASE + '/api/analytics/pwa-install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: navigator.platform || 'unknown',
            userAgent: (navigator.userAgent || '').slice(0, 200)
          }),
          credentials: 'include'
        }).catch(function () {});
      }
    } catch (e) {
      // Never break the app because of analytics
      console.warn('[PWA] install report failed', e);
    }
  }

  function installNow() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choice) {
      if (choice.outcome === 'accepted') {
        markInstalled();
      }
      deferredPrompt = null;
      removeBanner();
    });
    return true;
  }

  function showBanner(mode) {
    // Hard guard – never show to users who already installed the PWA
    if (isInstalled() || document.getElementById(BANNER_ID)) return;
    if (isDismissed() && mode !== 'manual') return;

    var el = document.createElement('section');
    el.id = BANNER_ID;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Install MyJournal+');
    el.innerHTML =
      '<div class="mj-pwa-content">' +
        '<img src="/icons/icon-192.png" alt="" width="48" height="48" onerror="this.style.display=\'none\'">' +
        '<div class="mj-pwa-copy">' +
          '<strong>Install MyJournal+</strong>' +
          '<span>' + (mode === 'ios'
            ? 'Tap Share, then “Add to Home Screen”.'
            : mode === 'browser'
              ? 'Use your browser’s Install App option to add MyJournal+ to your device.'
              : 'Install the app for faster access and an app-like experience.') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="mj-pwa-actions">' +
        '<button type="button" data-pwa="close">Not now</button>' +
        '<button type="button" class="mj-pwa-primary" data-pwa="install">' +
          (mode === 'ios' || mode === 'browser' ? 'Got it' : 'Install') +
        '</button>' +
      '</div>';

    if (!document.getElementById('mj-pwa-banner-style')) {
      var style = document.createElement('style');
      style.id = 'mj-pwa-banner-style';
      style.textContent =
        '#' + BANNER_ID + '{' +
          'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;' +
          'max-width:500px;margin:auto;padding:14px;border-radius:18px;' +
          'background:#10182deF;color:#eef2ff;border:1px solid rgba(123,108,255,.45);' +
          'box-shadow:0 18px 50px rgba(0,0,0,.4);font-family:system-ui,sans-serif;' +
          'animation:mjPwaIn .35s ease;' +
        '}' +
        '@keyframes mjPwaIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
        '#' + BANNER_ID + ' .mj-pwa-content{display:flex;gap:12px;align-items:center}' +
        '#' + BANNER_ID + ' img{border-radius:12px;flex-shrink:0}' +
        '#' + BANNER_ID + ' .mj-pwa-copy{display:grid;gap:4px}' +
        '#' + BANNER_ID + ' .mj-pwa-copy span{font-size:13px;color:#b9c3d9;line-height:1.35}' +
        '#' + BANNER_ID + ' .mj-pwa-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}' +
        '#' + BANNER_ID + ' button{border:0;border-radius:10px;padding:9px 14px;cursor:pointer;background:#27324a;color:#fff;font-weight:600}' +
        '#' + BANNER_ID + ' .mj-pwa-primary{background:linear-gradient(135deg,#7b6cff,#4dd3ff);color:#061020}';
      document.head.append(style);
    }

    document.body.append(el);

    el.querySelector('[data-pwa="close"]').onclick = function () {
      // Dismiss for 12 hours – do NOT mark as installed
      localStorage.setItem(LS_DISMISSED, String(Date.now() + 12 * 3600 * 1000));
      removeBanner();
    };
    el.querySelector('[data-pwa="install"]').onclick = function () {
      if (mode === 'native') {
        installNow();
      } else {
        // iOS / generic browser – user must follow the instructions
        removeBanner();
      }
    };
  }

  // Chrome / Edge / Samsung etc. – native install prompt
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;

    // Never show if already installed
    if (isInstalled()) {
      deferredPrompt = null;
      return;
    }
    if (!isDismissed()) {
      showBanner('native');
    }
  });

  // Fired when the user actually installs the PWA
  window.addEventListener('appinstalled', function () {
    markInstalled();
  });

  // Public API so other pages can trigger the prompt
  window.mjPromptPwaInstall = function () {
    if (isInstalled()) {
      removeBanner();
      return false;
    }
    localStorage.removeItem(LS_DISMISSED);
    if (deferredPrompt) return installNow();
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      showBanner('ios');
      return false;
    }
    showBanner('browser');
    return false;
  };

  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(console.error);
    });
  }

  // On every page load: if already installed → ensure banner is gone and never shown again
  window.addEventListener('load', function () {
    if (isInstalled()) {
      removeBanner();
      // If the user is in standalone mode we can still report once
      if (isStandalone() && localStorage.getItem(LS_INSTALL_REPORTED) !== '1') {
        reportInstallToBackend();
      }
      return;
    }

    // Only auto-show fallback banner if the browser never fired beforeinstallprompt
    if (deferredPrompt || isDismissed()) return;

    setTimeout(function () {
      if (isInstalled() || deferredPrompt || isDismissed()) return;
      showBanner(/iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'browser');
    }, 2800);
  });

  // Extra safety: if display-mode changes to standalone after install, hide immediately
  if (window.matchMedia) {
    var mq = window.matchMedia('(display-mode: standalone)');
    var onChange = function () {
      if (mq.matches) markInstalled();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
