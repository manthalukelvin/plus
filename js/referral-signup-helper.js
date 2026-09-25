/**
 * Growth Specialist & user-referral tracking for MyJournal+
 *
 * - Captures ?ref=CODE from the URL (and stores it)
 * - Tracks link clicks into campaigns/ for specialist dashboards
 * - On signup: writes referrals/ so specialist + admin dashboards update live
 * - Also supports user-to-user referralCount on users/ (existing 3-for-premium)
 */

(function (global) {
  'use strict';

  function getDb() {
    if (typeof db !== 'undefined' && db) return db;
    if (global.db) return global.db;
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      try { return firebase.firestore(); } catch (e) { return null; }
    }
    return null;
  }

  function getFieldValue() {
    if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
      return firebase.firestore.FieldValue;
    }
    return null;
  }

  function normalizeCode(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw.trim().toLowerCase();
  }

  /** Persist ref from URL query (call early on page load). */
  function captureRefFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = normalizeCode(params.get('ref') || params.get('referral') || '');
      if (code) {
        localStorage.setItem('ref_code', code);
        try { sessionStorage.setItem('ref_code', code); } catch (e) {}
        try {
          const clean = window.location.pathname + (window.location.hash || '');
          window.history.replaceState({}, document.title, clean);
        } catch (e) {}
        return code;
      }
    } catch (e) {
      console.warn('captureRefFromUrl', e);
    }
    return normalizeCode(localStorage.getItem('ref_code') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ref_code') : '') || '');
  }

  function getStoredRefCode() {
    return normalizeCode(
      localStorage.getItem('ref_code') ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ref_code') : '') ||
      ''
    );
  }

  /**
   * Record a click on a specialist acquisition link.
   * Creates/updates campaigns/{marketerId_code} with clicks++.
   */
  async function trackReferralClick(codeOverride) {
    const code = normalizeCode(codeOverride || getStoredRefCode());
    if (!code) return null;
    const firestore = getDb();
    const FV = getFieldValue();
    if (!firestore || !FV) return null;

    try {
      let snap = await firestore.collection('marketers')
        .where('referralCode', '==', code)
        .limit(1)
        .get();
      if (snap.empty) {
        snap = await firestore.collection('marketers')
          .where('referralCode', '==', code.toUpperCase())
          .limit(1)
          .get();
      }
      if (snap.empty) {
        const all = await firestore.collection('marketers').limit(200).get();
        const match = all.docs.find(d => normalizeCode(d.data().referralCode || '') === code);
        if (!match) {
          console.warn('trackReferralClick: specialist code not found', code);
          return null;
        }
        snap = { empty: false, docs: [match] };
      }

      const specialistId = snap.docs[0].id;
      const campaignId = specialistId + '_' + code;
      const campRef = firestore.collection('campaigns').doc(campaignId);
      const campSnap = await campRef.get();
      if (campSnap.exists) {
        await campRef.update({
          clicks: FV.increment(1),
          lastClickAt: FV.serverTimestamp()
        });
      } else {
        await campRef.set({
          marketerId: specialistId,
          code: code,
          clicks: 1,
          signups: 0,
          createdAt: FV.serverTimestamp(),
          lastClickAt: FV.serverTimestamp()
        });
      }
      return specialistId;
    } catch (e) {
      console.warn('trackReferralClick error', e);
      return null;
    }
  }

  /**
   * After a new user is created, attribute them to a growth specialist (referrals/)
   * and/or update user-to-user referralCount. Returns specialistId or null.
   */
  async function trackReferralSignup(newUserId, newUserEmail, codeOverride) {
    const code = normalizeCode(codeOverride || getStoredRefCode());
    if (!code || !newUserId) return null;

    const firestore = getDb();
    const FV = getFieldValue();
    if (!firestore || !FV) {
      console.warn('trackReferralSignup: Firestore not ready');
      return null;
    }

    try {
      let specialistId = null;
      let snap = await firestore.collection('marketers')
        .where('referralCode', '==', code)
        .limit(1)
        .get();
      if (snap.empty) {
        snap = await firestore.collection('marketers')
          .where('referralCode', '==', code.toUpperCase())
          .limit(1)
          .get();
      }
      if (snap.empty) {
        const all = await firestore.collection('marketers').limit(200).get();
        const match = all.docs.find(d => normalizeCode(d.data().referralCode || '') === code);
        if (match) snap = { empty: false, docs: [match] };
      }

      if (!snap.empty) {
        specialistId = snap.docs[0].id;
        if (specialistId === newUserId) {
          console.warn('Self-referral blocked');
          return null;
        }

        const existing = await firestore.collection('referrals')
          .where('referredUserId', '==', newUserId)
          .limit(1)
          .get();
        if (existing.empty) {
          await firestore.collection('referrals').add({
            marketerId: specialistId,
            referredUserId: newUserId,
            referredUserEmail: newUserEmail || '',
            status: 'pending',
            premium: false,
            retained: false,
            campaign: code,
            signupDate: FV.serverTimestamp(),
            createdAt: FV.serverTimestamp()
          });
        }

        const campaignId = specialistId + '_' + code;
        const campRef = firestore.collection('campaigns').doc(campaignId);
        const campSnap = await campRef.get();
        if (campSnap.exists) {
          await campRef.update({
            signups: FV.increment(1),
            lastSignupAt: FV.serverTimestamp()
          });
        } else {
          await campRef.set({
            marketerId: specialistId,
            code: code,
            clicks: 0,
            signups: 1,
            createdAt: FV.serverTimestamp(),
            lastSignupAt: FV.serverTimestamp()
          });
        }

        try {
          await firestore.collection('users').doc(newUserId).set({
            referredBySpecialist: specialistId,
            referredByCode: code,
            referredBy: code
          }, { merge: true });
        } catch (e) { /* non-fatal */ }
      }

      // User-to-user referral path (3-for-premium)
      let userRefSnap = await firestore.collection('users')
        .where('referralCode', '==', code.toUpperCase())
        .limit(1)
        .get();
      if (userRefSnap.empty) {
        userRefSnap = await firestore.collection('users')
          .where('referralCode', '==', code)
          .limit(1)
          .get();
      }
      if (!userRefSnap.empty) {
        const referrerId = userRefSnap.docs[0].id;
        if (referrerId !== newUserId) {
          const currentCount = userRefSnap.docs[0].data().referralCount || 0;
          const updates = { referralCount: currentCount + 1 };
          if (currentCount + 1 >= 3) updates.isPremium = true;
          await firestore.collection('users').doc(referrerId).update(updates);
        }
      }

      try {
        localStorage.removeItem('ref_code');
        sessionStorage.removeItem('ref_code');
      } catch (e) {}

      return specialistId;
    } catch (e) {
      console.error('trackReferralSignup error', e);
      return null;
    }
  }

  async function markReferralPremium(userId) {
    const firestore = getDb();
    if (!firestore || !userId) return;
    try {
      const snap = await firestore.collection('referrals')
        .where('referredUserId', '==', userId)
        .limit(1)
        .get();
      if (snap.empty) return;
      await snap.docs[0].ref.update({ premium: true });
    } catch (e) {
      console.warn('markReferralPremium', e);
    }
  }

  async function markReferralQualified(userId) {
    const firestore = getDb();
    const FV = getFieldValue();
    if (!firestore || !userId || !FV) return;
    try {
      const snap = await firestore.collection('referrals')
        .where('referredUserId', '==', userId)
        .limit(1)
        .get();
      if (snap.empty) return;
      await snap.docs[0].ref.update({
        status: 'qualified',
        qualifiedDate: FV.serverTimestamp()
      });
    } catch (e) {
      console.warn('markReferralQualified', e);
    }
  }

  function initReferralTracking() {
    const code = captureRefFromUrl();
    if (code) {
      const tryClick = () => {
        if (getDb()) {
          trackReferralClick(code);
          return true;
        }
        return false;
      };
      if (!tryClick()) {
        let n = 0;
        const t = setInterval(() => {
          n++;
          if (tryClick() || n > 40) clearInterval(t);
        }, 250);
      }
    }
  }

  global.trackReferralSignup = trackReferralSignup;
  global.trackReferralClick = trackReferralClick;
  global.markReferralPremium = markReferralPremium;
  global.markReferralQualified = markReferralQualified;
  global.captureRefFromUrl = captureRefFromUrl;
  global.getStoredRefCode = getStoredRefCode;
  global.initReferralTracking = initReferralTracking;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReferralTracking);
  } else {
    initReferralTracking();
  }
})(typeof window !== 'undefined' ? window : this);
