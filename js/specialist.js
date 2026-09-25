let currentUser = null;
let specialist = null;
let referrals = [];
let commissions = [];
let campaigns = [];
let resources = [];
let consultMsgs = [];

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());
document.getElementById('copyBtn').addEventListener('click', () => {
  const link = document.getElementById('refLink').value;
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => {
    const b = document.getElementById('copyBtn');
    b.textContent = 'Copied!';
    setTimeout(() => b.textContent = 'Copy link', 2000);
  });
});
document.getElementById('refFilter').addEventListener('change', renderReferrals);
document.getElementById('consultSend').addEventListener('click', sendConsult);

requireRole(['growth', 'marketer'], (user) => {
  currentUser = user;
  document.getElementById('userName').textContent = user.email || '';
  startListeners(user.uid);
});

function startListeners(uid) {
  db.collection('marketers').doc(uid).onSnapshot(snap => {
    if (snap.exists) {
      specialist = { uid, ...snap.data() };
      renderSpecialist();
    }
  });

  db.collection('referrals').where('marketerId', '==', uid).orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      referrals = snap.docs.map(d => ({ referralId: d.id, ...d.data() }));
      renderAll();
    }, err => console.warn('Referrals index may be needed:', err.message));

  // Fallback without orderBy if index missing
  db.collection('referrals').where('marketerId', '==', uid)
    .onSnapshot(snap => {
      if (referrals.length === 0) {
        referrals = snap.docs.map(d => ({ referralId: d.id, ...d.data() }));
        referrals.sort((a, b) => {
          const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
          const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
          return tb - ta;
        });
        renderAll();
      }
    });

  db.collection('commissions').where('marketerId', '==', uid)
    .onSnapshot(snap => {
      commissions = snap.docs.map(d => ({ commissionId: d.id, ...d.data() }));
      commissions.sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return tb - ta;
      });
      renderCommissions();
      renderPayoutStatus();
    });

  db.collection('campaigns').where('marketerId', '==', uid)
    .onSnapshot(snap => {
      campaigns = snap.docs.map(d => ({ campaignId: d.id, ...d.data() }));
      renderLinkStats();
    });

  db.collection('marketingResources').where('active', '==', true)
    .onSnapshot(snap => {
      resources = snap.docs.map(d => ({ resourceId: d.id, ...d.data() }));
      renderResources();
    });

  // Consult messages (collection: growthConsults)
  db.collection('growthConsults').where('specialistId', '==', uid)
    .onSnapshot(snap => {
      consultMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      consultMsgs.sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return ta - tb;
      });
      renderConsult();
    });
}

function countMetrics() {
  const total = referrals.length;
  // Retained = qualified (or paid) AND at least 7 days since signup/qualified
  const retained = referrals.filter(r => {
    if (r.status !== 'qualified' && r.status !== 'paid' && r.status !== 'retained') return false;
    if (r.retained === true) return true;
    const base = r.qualifiedDate || r.signupDate || r.createdAt;
    return daysSince(base) >= 7;
  }).length;
  const premium = referrals.filter(r => r.premium === true).length;
  return { total, retained, premium, earnings: calcEarnings(retained, premium) };
}

function renderAll() {
  renderOverview();
  renderProgress();
  renderReferrals();
  renderLinkStats();
}

function renderSpecialist() {
  if (!specialist) return;
  const code = specialist.referralCode || '';
  // Prefer admin-configured base, else production signup, else same-origin
  const defaultBase = 'https://myjournalplus.com/signup';
  const base = (specialist.signupBaseUrl && specialist.signupBaseUrl.trim())
    || defaultBase
    || (window.location.origin.replace(/\/$/, '') + '/signup');
  // Keep original case of code in the link so matching works both ways
  const link = code
    ? base + (base.includes('?') ? '&' : '?') + 'ref=' + encodeURIComponent(code)
    : 'Waiting for admin to set your code…';
  document.getElementById('refLink').value = link;
  document.getElementById('refCode').textContent = code || 'Not set';
  document.getElementById('profName').textContent = specialist.displayName || '—';
  document.getElementById('profEmail').textContent = currentUser.email || '—';
  document.getElementById('profCode').textContent = code || 'Not set';
  document.getElementById('profStatus').textContent = specialist.status || '—';
}

function renderOverview() {
  const m = countMetrics();
  document.getElementById('kpiTotal').textContent = m.total;
  document.getElementById('kpiRetained').textContent = m.retained;
  document.getElementById('kpiPremium').textContent = m.premium;
  document.getElementById('kpiEarned').textContent = money(m.earnings.totalEarned);

  document.getElementById('retainedBatches').textContent = m.earnings.retainedBatches + ' batches';
  document.getElementById('premiumBatches').textContent = m.earnings.premiumBatches + ' batches';
  const rp = (m.earnings.retainedProgress / COMMISSION.RETAINED_PER_BATCH) * 100;
  const pp = (m.earnings.premiumProgress / COMMISSION.PREMIUM_PER_BATCH) * 100;
  document.getElementById('retainedBar').style.width = rp + '%';
  document.getElementById('premiumBar').style.width = pp + '%';
  document.getElementById('retainedHint').textContent =
    m.earnings.retainedProgress + ' / ' + COMMISSION.RETAINED_PER_BATCH + ' toward next $' + COMMISSION.RETAINED_PAYOUT;
  document.getElementById('premiumHint').textContent =
    m.earnings.premiumProgress + ' / ' + COMMISSION.PREMIUM_PER_BATCH + ' toward next $' + COMMISSION.PREMIUM_PAYOUT;

  // 7-day chart
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    days.push(d);
  }
  const counts = days.map(day => referrals.filter(r => {
    const rd = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt || 0);
    rd.setHours(0,0,0,0);
    return rd.getTime() === day.getTime();
  }).length);
  const max = Math.max(1, ...counts);
  document.getElementById('chartBars').innerHTML = days.map((day, i) => {
    const h = Math.round((counts[i] / max) * 130);
    const label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<div class="chart-bar-wrap"><div class="chart-bar" style="height:${h}px" title="${counts[i]}"></div><div class="chart-label">${label}</div></div>`;
  }).join('');
}

function renderProgress() {
  const m = countMetrics();
  document.getElementById('progRetainedCount').textContent = m.retained;
  document.getElementById('progPremiumCount').textContent = m.premium;
  document.getElementById('progRetainedBar').style.width =
    ((m.earnings.retainedProgress / COMMISSION.RETAINED_PER_BATCH) * 100) + '%';
  document.getElementById('progPremiumBar').style.width =
    ((m.earnings.premiumProgress / COMMISSION.PREMIUM_PER_BATCH) * 100) + '%';
  document.getElementById('progRetainedText').textContent =
    m.earnings.nextRetainedAt === COMMISSION.RETAINED_PER_BATCH && m.earnings.retainedProgress === 0 && m.retained > 0
      ? 'Threshold reached — ready for review'
      : 'Need ' + m.earnings.nextRetainedAt + ' more for next $' + COMMISSION.RETAINED_PAYOUT;
  document.getElementById('progPremiumText').textContent =
    m.earnings.nextPremiumAt === COMMISSION.PREMIUM_PER_BATCH && m.earnings.premiumProgress === 0 && m.premium > 0
      ? 'Threshold reached — ready for review'
      : 'Need ' + m.earnings.nextPremiumAt + ' more for next $' + COMMISSION.PREMIUM_PAYOUT;
  document.getElementById('progRetainedEarned').innerHTML =
    '<strong>' + money(m.earnings.retainedEarned) + '</strong> earned from retention';
  document.getElementById('progPremiumEarned').innerHTML =
    '<strong>' + money(m.earnings.premiumEarned) + '</strong> earned from premium';
}

function renderReferrals() {
  const filter = document.getElementById('refFilter').value;
  let list = referrals;
  if (filter === 'pending') list = referrals.filter(r => r.status === 'pending');
  else if (filter === 'qualified') list = referrals.filter(r => r.status === 'qualified' || r.status === 'paid');
  else if (filter === 'retained') list = referrals.filter(r => {
    if (r.retained) return true;
    if (r.status !== 'qualified' && r.status !== 'paid') return false;
    return daysSince(r.qualifiedDate || r.signupDate || r.createdAt) >= 7;
  });
  else if (filter === 'premium') list = referrals.filter(r => r.premium);

  const tbody = document.getElementById('referralsBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--muted)">No referrals in this view yet.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(r => {
    const days = daysSince(r.signupDate || r.createdAt);
    const retained = r.retained || ((r.status === 'qualified' || r.status === 'paid') && days >= 7);
    let status = r.status || 'pending';
    if (retained && status === 'qualified') status = 'retained';
    const cls = status === 'retained' || status === 'paid' ? 'badge-green' :
                status === 'qualified' ? 'badge-blue' :
                status === 'pending' ? 'badge-amber' : 'badge-red';
    return `<tr>
      <td class="truncate">${r.referredUserEmail || r.referredUserId || '—'}</td>
      <td><span class="badge ${cls}">${status}</span></td>
      <td>${days}d</td>
      <td>${r.premium ? '✓' : '—'}</td>
      <td>${fmtDate(r.createdAt)}</td>
    </tr>`;
  }).join('');
}

function renderCommissions() {
  const el = document.getElementById('commissionsList');
  if (!commissions.length) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:1.5rem">No commission records yet. Thresholds create earnings automatically for admin review.</p>';
    return;
  }
  el.innerHTML = commissions.map(c => {
    const cls = c.status === 'paid' ? 'badge-green' : c.status === 'approved' ? 'badge-blue' : c.status === 'pending' ? 'badge-amber' : 'badge-red';
    return `<div class="flex-between" style="padding:.55rem 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <div><strong>${money(c.amount)}</strong><div class="text-xs text-muted">${c.reason || ''}</div></div>
      <span class="badge ${cls}">${c.status}</span>
    </div>`;
  }).join('');
}

function renderPayoutStatus() {
  const pending = commissions.filter(c => c.status === 'pending').reduce((s, c) => s + (c.amount || 0), 0);
  const approved = commissions.filter(c => c.status === 'approved').reduce((s, c) => s + (c.amount || 0), 0);
  const paid = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);
  document.getElementById('payPending').textContent = money(pending);
  document.getElementById('payApproved').textContent = money(approved);
  document.getElementById('payPaid').textContent = money(paid);
}

function renderLinkStats() {
  const clicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
  const signups = referrals.length;
  document.getElementById('linkClicks').textContent = clicks;
  document.getElementById('linkSignups').textContent = signups;
  document.getElementById('linkConv').textContent = clicks > 0 ? ((signups / clicks) * 100).toFixed(1) + '%' : '—';
}

function renderResources() {
  const el = document.getElementById('resourcesList');
  if (!resources.length) {
    el.innerHTML = '<p class="text-muted" style="grid-column:1/-1;text-align:center;padding:2rem">No resources yet.</p>';
    return;
  }
  el.innerHTML = resources.map(r => `
    <a href="${r.url}" target="_blank" rel="noopener" class="p-4" style="display:block;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:var(--radius);color:inherit;text-decoration:none">
      <strong>${r.title}</strong>
      <p class="text-xs text-muted mt-2">${r.description || ''}</p>
    </a>`).join('');
}

function renderConsult() {
  const el = document.getElementById('consultThread');
  if (!consultMsgs.length) {
    el.innerHTML = '<p class="text-muted text-xs" style="text-align:center;padding:1rem">No messages yet. Reach out when you hit a threshold.</p>';
    return;
  }
  el.innerHTML = consultMsgs.map(m => {
    const cls = m.from === 'admin' ? 'from-admin' : 'from-specialist';
    return `<div class="consult-msg ${cls}"><div class="text-xs text-muted mb-1">${m.from === 'admin' ? 'Admin' : 'You'} · ${fmtDate(m.createdAt)}</div>${escapeHtml(m.body || '')}</div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendConsult() {
  const input = document.getElementById('consultInput');
  const body = input.value.trim();
  if (!body || !currentUser) return;
  await db.collection('growthConsults').add({
    specialistId: currentUser.uid,
    from: 'specialist',
    body,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    readByAdmin: false
  });
  input.value = '';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
