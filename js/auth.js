function getDeviceFingerprint() {
  const nav = navigator, screen = window.screen;
  const parts = [
    nav.userAgent, nav.language, nav.platform,
    (nav.hardwareConcurrency || '').toString(),
    screen.width + 'x' + screen.height,
    (screen.colorDepth || '').toString(),
    new Date().getTimezoneOffset().toString()
  ];
  let hash = 0;
  const raw = parts.join('|');
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return 'dev_' + Math.abs(hash).toString(36);
}

async function ensureUserDoc(user) {
  const userRef = db.collection('users').doc(user.uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    const deviceId = getDeviceFingerprint();
    await userRef.set({
      role: 'user',
      email: user.email || '',
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
      deviceId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    });
    const deviceRef = db.collection('deviceFingerprints').doc(deviceId);
    const deviceSnap = await deviceRef.get();
    if (deviceSnap.exists) {
      await deviceRef.update({
        userIds: firebase.firestore.FieldValue.arrayUnion(user.uid),
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        count: firebase.firestore.FieldValue.increment(1)
      });
    } else {
      await deviceRef.set({
        deviceId, userIds: [user.uid],
        firstSeen: firebase.firestore.FieldValue.serverTimestamp(),
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        count: 1
      });
    }
  } else {
    await userRef.update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() });
  }
}

async function getUserRole(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data();
  // Support role field and roles array
  if (d.role === 'admin' || (d.roles && d.roles.includes('admin')) || d.isAdmin) return 'admin';
  if (d.role === 'marketer' || d.role === 'growth' || (d.roles && (d.roles.includes('marketer') || d.roles.includes('growth')))) return 'growth';
  return d.role || 'user';
}

function redirectByRole(role) {
  if (role === 'admin') window.location.href = 'admin.html';
  else if (role === 'growth' || role === 'marketer') window.location.href = 'specialist.html';
  else {
    alert('Your account does not have Growth Specialist or Admin access yet. Contact an administrator.');
    auth.signOut();
  }
}

function requireRole(allowed, callback) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = 'dashboard.html'; return; }
    const role = await getUserRole(user.uid);
    const ok = allowed.includes(role) || (allowed.includes('growth') && role === 'marketer');
    if (!ok) { redirectByRole(role); return; }
    callback(user, role);
  });
}

/** Calculate earnings from counts */
function calcEarnings(retainedCount, premiumCount) {
  const retainedBatches = Math.floor(retainedCount / COMMISSION.RETAINED_PER_BATCH);
  const premiumBatches = Math.floor(premiumCount / COMMISSION.PREMIUM_PER_BATCH);
  return {
    retainedBatches,
    premiumBatches,
    retainedEarned: retainedBatches * COMMISSION.RETAINED_PAYOUT,
    premiumEarned: premiumBatches * COMMISSION.PREMIUM_PAYOUT,
    totalEarned: retainedBatches * COMMISSION.RETAINED_PAYOUT + premiumBatches * COMMISSION.PREMIUM_PAYOUT,
    nextRetainedAt: COMMISSION.RETAINED_PER_BATCH - (retainedCount % COMMISSION.RETAINED_PER_BATCH),
    nextPremiumAt: COMMISSION.PREMIUM_PER_BATCH - (premiumCount % COMMISSION.PREMIUM_PER_BATCH),
    retainedProgress: retainedCount % COMMISSION.RETAINED_PER_BATCH,
    premiumProgress: premiumCount % COMMISSION.PREMIUM_PER_BATCH
  };
}

function money(n) { return '$' + (Number(n) || 0).toFixed(2); }

function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(ts) {
  if (!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
