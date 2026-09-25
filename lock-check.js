// lock-check.js — Secure timed PIN lock for MyJournal+
// Include on protected pages. Supports immediate + inactivity timers (premium).

(function(){
  const PIN_PAGE_PATH = '/pin';
  const MODE_MS = {
    immediate: 0,
    '1min': 60 * 1000,
    '2min': 2 * 60 * 1000,
    '5min': 5 * 60 * 1000,
    '30min': 30 * 60 * 1000
  };

  try {
    const lockedFlag = localStorage.getItem('pinLocked') === 'true';
    if (!lockedFlag) return;

    const currentPath = window.location.pathname || '';
    if (currentPath.endsWith('pin') || currentPath.endsWith('pin.html') || currentPath.endsWith('/pin')) return;

    const mode = localStorage.getItem('pinLockMode') || 'immediate';
    const timeoutMs = MODE_MS[mode] != null ? MODE_MS[mode] : 0;

    function goToPin() {
      try {
        localStorage.setItem('pinPrevURL', window.location.href);
        window.location.replace(PIN_PAGE_PATH);
      } catch (e) {
        window.location.href = PIN_PAGE_PATH;
      }
    }

    if (timeoutMs === 0) {
      goToPin();
      return;
    }

    let last = parseInt(localStorage.getItem('pinLastActivity') || '0', 10) || Date.now();
    const now = Date.now();
    if (now - last >= timeoutMs) {
      goToPin();
      return;
    }

    function touch() {
      last = Date.now();
      try { localStorage.setItem('pinLastActivity', String(last)); } catch(e){}
    }
    ['click','keydown','touchstart','mousemove','scroll'].forEach(ev => {
      window.addEventListener(ev, touch, { passive: true });
    });

    const checkInterval = setInterval(() => {
      if (Date.now() - last >= timeoutMs) {
        clearInterval(checkInterval);
        goToPin();
      }
    }, 5000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        touch();
      } else {
        const leave = parseInt(localStorage.getItem('pinLastActivity') || '0', 10);
        if (Date.now() - leave >= timeoutMs) goToPin();
        else touch();
      }
    });
  } catch (e) {
    try {
      if (localStorage.getItem('pinLocked') === 'true' &&
          !(window.location.pathname || '').includes('pin')) {
        window.location.replace(PIN_PAGE_PATH);
      }
    } catch (err) {}
  }
})();
