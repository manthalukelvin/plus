let specialists = [];
let allReferrals = [];
let allCommissions = [];
let users = [];
let fraudFlags = [];
let resources = [];
let consultMsgs = [];
let selectedSpec = null;
let activeConsultId = null;

function showMsg(t) {
  document.getElementById('msgText').textContent = t;
  document.getElementById('msgBar').classList.remove('hidden');
}
function hideMsg() { document.getElementById('msgBar').classList.add('hidden'); }

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});
document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());
document.getElementById('closeModalBtn').addEventListener('click', () => {
  document.getElementById('editModal').classList.add('hidden');
  selectedSpec = null;
});
document.getElementById('searchSpec').addEventListener('input', renderSpecialists);
document.getElementById('scanBtn').addEventListener('click', runFraudScan);
document.getElementById('scanBtn2').addEventListener('click', runFraudScan);
document.getElementById('syncThresholdsBtn').addEventListener('click', syncThresholdCommissions);
document.getElementById('addResBtn').addEventListener('click', addResource);
document.getElementById('adminConsultSend').addEventListener('click', sendAdminConsult);

requireRole(['admin'], (user) => {
  document.getElementById('userName').textContent = user.email || '';
  startListeners();
});

function startListeners() {
  db.collection('marketers').onSnapshot(snap => {
    specialists = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    document.getElementById('specCount').textContent = specialists.length;
    document.getElementById('ovSpecialists').textContent = specialists.length;
    renderSpecialists();
    renderThresholds();
    renderConsultList();
  });

  db.collection('referrals').onSnapshot(snap => {
    allReferrals = snap.docs.map(d => ({ referralId: d.id, ...d.data() }));
    allReferrals.sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
      const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
      return tb - ta;
    });
    updateOverviewMetrics();
    renderPipeline();
    renderThresholds();
  });

  db.collection('commissions').onSnapshot(snap => {
    allCommissions = snap.docs.map(d => ({ commissionId: d.id, ...d.data() }));
    allCommissions.sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
      const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
      return tb - ta;
    });
    updateOverviewMetrics();
    renderPayouts();
  });

  db.collection('users').onSnapshot(snap => {
    users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderUsers();
  });

  db.collection('fraudFlags').onSnapshot(snap => {
    fraudFlags = snap.docs.map(d => ({ flagId: d.id, ...d.data() }));
    renderFraud();
  });

  db.collection('marketingResources').onSnapshot(snap => {
    resources = snap.docs.map(d => ({ resourceId: d.id, ...d.data() }));
    renderAdminRes();
  });

  db.collection('growthConsults').onSnapshot(snap => {
    consultMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderConsultList();
    if (activeConsultId) renderAdminConsultThread(activeConsultId);
  });
}

function isRetained(r) {
  if (r.retained === true) return true;
  if (r.status !== 'qualified' && r.status !== 'paid' && r.status !== 'retained') return false;
  return daysSince(r.qualifiedDate || r.signupDate || r.createdAt) >= 7;
}

function metricsFor(specId) {
  const refs = allReferrals.filter(r => r.marketerId === specId);
  const retained = refs.filter(isRetained).length;
  const premium = refs.filter(r => r.premium).length;
  return { total: refs.length, retained, premium, earnings: calcEarnings(retained, premium) };
}

function updateOverviewMetrics() {
  document.getElementById('ovRefs').textContent = allReferrals.length;
  document.getElementById('ovRetained').textContent = allReferrals.filter(isRetained).length;
  document.getElementById('ovPremium').textContent = allReferrals.filter(r => r.premium).length;
  const pending = allCommissions.filter(c => c.status === 'pending').reduce((s, c) => s + (c.amount || 0), 0);
  const paid = allCommissions.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);
  document.getElementById('ovPending').textContent = money(pending);
  document.getElementById('ovPaid').textContent = money(paid);
}

function renderSpecialists() {
  const q = (document.getElementById('searchSpec').value || '').toLowerCase();
  const list = specialists.filter(m =>
    (m.displayName || '').toLowerCase().includes(q) ||
    (m.referralCode || '').toLowerCase().includes(q)
  );
  const el = document.getElementById('specialistsList');
  if (!list.length) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem">No specialists found.</p>';
    return;
  }
  el.innerHTML = list.map(m => {
    const met = metricsFor(m.uid);
    return `<div class="glass-card p-4 mb-4">
      <div class="flex-between">
        <div>
          <strong style="font-size:1.05rem">${m.displayName || '—'}</strong>
          <div class="text-xs text-muted font-mono">Code: ${m.referralCode || '—'}</div>
          <div class="text-xs text-muted mt-1">
            Status: <span class="${m.status === 'active' ? 'text-emerald' : 'text-red'}">${m.status || '—'}</span>
            · Growth &amp; User Acquisition Specialist
          </div>
        </div>
        <div style="text-align:right">
          <div class="text-xs text-muted">Est. earnings</div>
          <div class="kpi-value text-purple" style="font-size:1.2rem">${money(met.earnings.totalEarned)}</div>
        </div>
      </div>
      <div class="grid-3 mt-3" style="font-size:.85rem">
        <div><span class="text-muted text-xs">Signups</span><br><strong>${met.total}</strong></div>
        <div><span class="text-muted text-xs">Retained 7d</span><br><strong class="text-emerald">${met.retained}</strong></div>
        <div><span class="text-muted text-xs">Premium</span><br><strong class="text-gold">${met.premium}</strong></div>
      </div>
      <div class="mt-3 progress-dual">
        <div>
          <div class="flex-between text-xs mb-1"><span>Retention batch</span><span>${met.earnings.retainedProgress}/${COMMISSION.RETAINED_PER_BATCH}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${(met.earnings.retainedProgress/COMMISSION.RETAINED_PER_BATCH)*100}%"></div></div>
        </div>
        <div>
          <div class="flex-between text-xs mb-1"><span>Premium batch</span><span>${met.earnings.premiumProgress}/${COMMISSION.PREMIUM_PER_BATCH}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${(met.earnings.premiumProgress/COMMISSION.PREMIUM_PER_BATCH)*100}%;background:linear-gradient(90deg,#d97706,#ec4899)"></div></div>
        </div>
      </div>
      <div class="mt-3" style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openEdit('${m.uid}')">Edit</button>
        <button class="btn btn-sm btn-ghost" style="${m.status==='active'?'background:rgba(239,68,68,.2);color:#fca5a5':''}"
          onclick="toggleStatus('${m.uid}','${m.status}')">${m.status==='active'?'Suspend':'Activate'}</button>
        <button class="btn btn-sm btn-emerald" onclick="markRetainedBatch('${m.uid}')">Confirm retention payout</button>
        <button class="btn btn-sm btn-sky" onclick="markPremiumBatch('${m.uid}')">Confirm premium payout</button>
      </div>
    </div>`;
  }).join('');
}

function openEdit(uid) {
  selectedSpec = specialists.find(m => m.uid === uid);
  if (!selectedSpec) return;
  document.getElementById('editTitle').textContent = 'Edit ' + (selectedSpec.displayName || '');
  document.getElementById('editName').value = selectedSpec.displayName || '';
  document.getElementById('editCode').value = selectedSpec.referralCode || '';
  document.getElementById('editBase').value = selectedSpec.signupBaseUrl || '';
  document.getElementById('editNotes').value = selectedSpec.adminNotes || '';
  document.getElementById('editModal').classList.remove('hidden');
}

document.getElementById('saveNameBtn').addEventListener('click', async () => {
  if (!selectedSpec) return;
  await db.collection('marketers').doc(selectedSpec.uid).update({ displayName: document.getElementById('editName').value.trim() });
  showMsg('Name updated'); document.getElementById('editModal').classList.add('hidden');
});
document.getElementById('saveCodeBtn').addEventListener('click', async () => {
  if (!selectedSpec) return;
  const code = document.getElementById('editCode').value.trim().toLowerCase().replace(/\s+/g, '');
  await db.collection('marketers').doc(selectedSpec.uid).update({ referralCode: code });
  showMsg('Code updated: ' + code); document.getElementById('editModal').classList.add('hidden');
});
document.getElementById('saveBaseBtn').addEventListener('click', async () => {
  if (!selectedSpec) return;
  await db.collection('marketers').doc(selectedSpec.uid).update({ signupBaseUrl: document.getElementById('editBase').value.trim() });
  showMsg('Signup URL updated'); document.getElementById('editModal').classList.add('hidden');
});
document.getElementById('saveNotesBtn').addEventListener('click', async () => {
  if (!selectedSpec) return;
  await db.collection('marketers').doc(selectedSpec.uid).update({ adminNotes: document.getElementById('editNotes').value.trim() });
  showMsg('Notes saved'); document.getElementById('editModal').classList.add('hidden');
});

async function toggleStatus(uid, current) {
  const newStatus = current === 'active' ? 'suspended' : 'active';
  await db.collection('marketers').doc(uid).update({ status: newStatus });
  showMsg('Status → ' + newStatus);
}

async function markRetainedBatch(uid) {
  const met = metricsFor(uid);
  if (met.earnings.retainedBatches < 1) {
    showMsg('Not enough retained users for a full batch yet (' + met.retained + '/50)');
    return;
  }
  // Create one commission per unaccounted batch (simple: always add latest batch amount if admin confirms)
  await db.collection('commissions').add({
    marketerId: uid,
    amount: COMMISSION.RETAINED_PAYOUT,
    reason: 'Retention batch: $2 for 50 users retained 7 days (confirmed)',
    status: 'pending',
    type: 'retention',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  showMsg('Retention commission $' + COMMISSION.RETAINED_PAYOUT + ' created (pending)');
}

async function markPremiumBatch(uid) {
  const met = metricsFor(uid);
  if (met.earnings.premiumBatches < 1) {
    showMsg('Not enough premium for a full batch yet (' + met.premium + '/15)');
    return;
  }
  await db.collection('commissions').add({
    marketerId: uid,
    amount: COMMISSION.PREMIUM_PAYOUT,
    reason: 'Premium batch: $5 for 15 verified Premium customers (confirmed)',
    status: 'pending',
    type: 'premium',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  showMsg('Premium commission $' + COMMISSION.PREMIUM_PAYOUT + ' created (pending)');
}

async function syncThresholdCommissions() {
  let created = 0;
  for (const s of specialists) {
    const met = metricsFor(s.uid);
    const existingRet = allCommissions.filter(c => c.marketerId === s.uid && c.type === 'retention').length;
    const existingPrem = allCommissions.filter(c => c.marketerId === s.uid && c.type === 'premium').length;
    const needRet = met.earnings.retainedBatches - existingRet;
    const needPrem = met.earnings.premiumBatches - existingPrem;
    for (let i = 0; i < needRet; i++) {
      await db.collection('commissions').add({
        marketerId: s.uid, amount: COMMISSION.RETAINED_PAYOUT,
        reason: 'Auto: retention batch ($2 / 50 retained 7d)',
        status: 'pending', type: 'retention',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      created++;
    }
    for (let i = 0; i < needPrem; i++) {
      await db.collection('commissions').add({
        marketerId: s.uid, amount: COMMISSION.PREMIUM_PAYOUT,
        reason: 'Auto: premium batch ($5 / 15 premium)',
        status: 'pending', type: 'premium',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      created++;
    }
  }
  showMsg(created ? 'Created ' + created + ' threshold commission(s)' : 'All thresholds already synced');
}

function renderPipeline() {
  const tbody = document.getElementById('pipelineBody');
  const rows = allReferrals.slice(0, 150).map(r => {
    const m = specialists.find(x => x.uid === r.marketerId);
    const days = daysSince(r.signupDate || r.createdAt);
    const ret = isRetained(r);
    const cls = ret ? 'badge-green' : r.status === 'qualified' ? 'badge-blue' : r.status === 'pending' ? 'badge-amber' : 'badge-red';
    return `<tr>
      <td>${m ? m.displayName : (r.marketerId || '').slice(0,8)}</td>
      <td class="truncate">${r.referredUserEmail || '—'}</td>
      <td><span class="badge ${cls}">${ret ? 'retained' : (r.status || '—')}</span></td>
      <td>${days}d</td>
      <td>${r.premium ? '✓' : '—'}</td>
      <td>${fmtDate(r.createdAt)}</td>
      <td>
        ${!r.premium ? `<button class="btn btn-ghost btn-sm" onclick="setPremium('${r.referralId}',true)">Set premium</button>` : ''}
        ${r.status === 'pending' ? `<button class="btn btn-ghost btn-sm" onclick="setQualified('${r.referralId}')">Qualify</button>` : ''}
      </td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('') || '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--muted)">No referrals yet. Signups with ?ref=CODE appear here automatically.</td></tr>';
}

async function setPremium(id, val) {
  await db.collection('referrals').doc(id).update({ premium: val });
  showMsg('Premium flag updated');
}
async function setQualified(id) {
  await db.collection('referrals').doc(id).update({
    status: 'qualified',
    qualifiedDate: firebase.firestore.FieldValue.serverTimestamp()
  });
  showMsg('Marked qualified');
}

function renderPayouts() {
  const el = document.getElementById('payoutsList');
  if (!allCommissions.length) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:1.5rem">No commissions yet.</p>';
    return;
  }
  el.innerHTML = allCommissions.map(c => {
    const m = specialists.find(x => x.uid === c.marketerId);
    const cls = c.status === 'paid' ? 'badge-green' : c.status === 'approved' ? 'badge-blue' : c.status === 'pending' ? 'badge-amber' : 'badge-red';
    let actions = '';
    if (c.status === 'pending') {
      actions = `<button class="btn btn-sm btn-sky" onclick="updateCommission('${c.commissionId}','approved')">Approve</button>
        <button class="btn btn-sm btn-ghost" style="background:rgba(239,68,68,.2);color:#fca5a5" onclick="updateCommission('${c.commissionId}','rejected')">Reject</button>`;
    } else if (c.status === 'approved') {
      actions = `<button class="btn btn-sm btn-emerald" onclick="updateCommission('${c.commissionId}','paid')">Mark paid</button>`;
    }
    return `<div class="flex-between" style="padding:.7rem 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <div>
        <strong>${money(c.amount)} → ${m ? m.displayName : (c.marketerId||'').slice(0,8)}</strong>
        <div class="text-xs text-muted">${c.reason || ''} · ${fmtDate(c.createdAt)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
        <span class="badge ${cls}">${c.status}</span>${actions}
      </div>
    </div>`;
  }).join('');
}

async function updateCommission(id, status) {
  const data = { status };
  if (status === 'paid') data.paidAt = firebase.firestore.FieldValue.serverTimestamp();
  await db.collection('commissions').doc(id).update(data);
  showMsg('Commission → ' + status);
}

function renderThresholds() {
  const el = document.getElementById('thresholdsList');
  if (!specialists.length) {
    el.innerHTML = '<p class="text-muted">No specialists yet.</p>';
    return;
  }
  el.innerHTML = specialists.map(s => {
    const met = metricsFor(s.uid);
    const readyRet = met.earnings.retainedBatches > 0;
    const readyPrem = met.earnings.premiumBatches > 0;
    return `<div class="glass-card p-4 mb-3">
      <div class="flex-between mb-2">
        <strong>${s.displayName || s.uid}</strong>
        <span class="text-purple">${money(met.earnings.totalEarned)} estimated</span>
      </div>
      <div class="grid-2">
        <div>
          <div class="text-xs text-muted mb-1">Retained ${met.retained} · batches ${met.earnings.retainedBatches}
            ${readyRet ? '<span class="badge badge-green">Payable</span>' : ''}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${(met.earnings.retainedProgress/COMMISSION.RETAINED_PER_BATCH)*100}%"></div></div>
        </div>
        <div>
          <div class="text-xs text-muted mb-1">Premium ${met.premium} · batches ${met.earnings.premiumBatches}
            ${readyPrem ? '<span class="badge badge-amber">Payable</span>' : ''}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${(met.earnings.premiumProgress/COMMISSION.PREMIUM_PER_BATCH)*100}%;background:linear-gradient(90deg,#d97706,#ec4899)"></div></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderConsultList() {
  const bySpec = {};
  consultMsgs.forEach(m => {
    if (!bySpec[m.specialistId]) bySpec[m.specialistId] = [];
    bySpec[m.specialistId].push(m);
  });
  const el = document.getElementById('consultSpecialists');
  const ids = Object.keys(bySpec);
  if (!ids.length) {
    el.innerHTML = '<p class="text-muted text-xs">No consultations yet.</p>';
    return;
  }
  el.innerHTML = ids.map(id => {
    const s = specialists.find(x => x.uid === id);
    const unread = bySpec[id].filter(m => m.from === 'specialist' && !m.readByAdmin).length;
    return `<button class="nav-btn" style="width:100%;margin-bottom:.25rem" onclick="openConsult('${id}')">
      ${(s && s.displayName) || id.slice(0,8)}
      ${unread ? `<span class="badge badge-amber">${unread}</span>` : ''}
    </button>`;
  }).join('');
}

function openConsult(id) {
  activeConsultId = id;
  const s = specialists.find(x => x.uid === id);
  document.getElementById('consultTitle').textContent = (s && s.displayName) || 'Specialist';
  document.getElementById('consultReplyWrap').classList.remove('hidden');
  renderAdminConsultThread(id);
  // mark read
  consultMsgs.filter(m => m.specialistId === id && m.from === 'specialist' && !m.readByAdmin)
    .forEach(m => db.collection('growthConsults').doc(m.id).update({ readByAdmin: true }));
}

function renderAdminConsultThread(id) {
  const msgs = consultMsgs.filter(m => m.specialistId === id).sort((a, b) => {
    const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
    const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
    return ta - tb;
  });
  const el = document.getElementById('adminConsultThread');
  el.innerHTML = msgs.map(m => {
    const cls = m.from === 'admin' ? 'from-admin' : 'from-specialist';
    return `<div class="consult-msg ${cls}"><div class="text-xs text-muted mb-1">${m.from === 'admin' ? 'You' : 'Specialist'} · ${fmtDate(m.createdAt)}</div>${escapeHtml(m.body || '')}</div>`;
  }).join('') || '<p class="text-muted text-xs">No messages</p>';
  el.scrollTop = el.scrollHeight;
}

async function sendAdminConsult() {
  if (!activeConsultId) return;
  const input = document.getElementById('adminConsultInput');
  const body = input.value.trim();
  if (!body) return;
  await db.collection('growthConsults').add({
    specialistId: activeConsultId,
    from: 'admin',
    body,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    readByAdmin: true
  });
  input.value = '';
}

function escapeHtml(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

async function runFraudScan() {
  const flags = [];
  allReferrals.forEach(r => {
    if (r.marketerId === r.referredUserId) {
      flags.push({ type: 'self_referral', marketerId: r.marketerId, details: 'Self-referral detected', severity: 'high' });
    }
  });
  const emailMap = {};
  allReferrals.forEach(r => {
    const e = (r.referredUserEmail || '').toLowerCase();
    if (!e) return;
    if (!emailMap[e]) emailMap[e] = [];
    if (!emailMap[e].includes(r.marketerId)) emailMap[e].push(r.marketerId);
  });
  Object.keys(emailMap).forEach(e => {
    if (emailMap[e].length > 1) {
      flags.push({ type: 'duplicate_user', details: e + ' referred by multiple: ' + emailMap[e].join(', '), severity: 'medium' });
    }
  });
  for (const f of flags) {
    await db.collection('fraudFlags').add({ ...f, createdAt: firebase.firestore.FieldValue.serverTimestamp(), resolved: false });
  }
  showMsg(flags.length ? 'Found ' + flags.length + ' issue(s)' : 'No issues found');
}

function renderFraud() {
  const open = fraudFlags.filter(f => !f.resolved);
  const el = document.getElementById('fraudList');
  if (!open.length) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem">No open flags.</p>';
    return;
  }
  el.innerHTML = open.map(f => `
    <div class="glass-card p-4 mb-3" style="border-left:4px solid ${f.severity==='high'?'#ef4444':'#f59e0b'}">
      <div class="flex-between">
        <div>
          <strong style="text-transform:capitalize">${(f.type||'').replace(/_/g,' ')}</strong>
          <span class="badge ${f.severity==='high'?'badge-red':'badge-amber'}">${f.severity}</span>
          <p class="text-xs text-muted mt-1">${f.details||''}</p>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="resolveFlag('${f.flagId}')">Resolve</button>
      </div>
    </div>`).join('');
}
async function resolveFlag(id) {
  await db.collection('fraudFlags').doc(id).update({ resolved: true });
  showMsg('Resolved');
}

async function addResource() {
  const title = document.getElementById('resTitle').value.trim();
  const description = document.getElementById('resDesc').value.trim();
  const url = document.getElementById('resUrl').value.trim();
  if (!title || !url) return;
  await db.collection('marketingResources').add({
    title, description, url, active: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  document.getElementById('resTitle').value = '';
  document.getElementById('resDesc').value = '';
  document.getElementById('resUrl').value = '';
  showMsg('Resource added');
}
function renderAdminRes() {
  document.getElementById('adminResList').innerHTML = resources.map(r => `
    <div class="glass-card p-3 mb-2 flex-between">
      <div><strong>${r.title}</strong><div class="text-xs text-muted">${r.url}</div></div>
      <span class="badge ${r.active?'badge-green':'badge-amber'}">${r.active?'Active':'Off'}</span>
    </div>`).join('') || '<p class="text-muted">None yet</p>';
}

function renderUsers() {
  const el = document.getElementById('usersList');
  const list = users.filter(u => {
    const role = u.role || '';
    const roles = u.roles || [];
    return role !== 'admin' && !u.isAdmin && !roles.includes('admin');
  });
  el.innerHTML = list.map(u => {
    const isGrowth = u.role === 'marketer' || u.role === 'growth' || (u.roles && (u.roles.includes('marketer') || u.roles.includes('growth')));
    return `<div class="flex-between" style="padding:.55rem 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <div>
        <strong>${u.displayName || u.email || '—'}</strong>
        <div class="text-xs text-muted">${u.email || ''} · ${u.role || 'user'}</div>
      </div>
      ${!isGrowth
        ? `<button class="btn btn-primary btn-sm" onclick="promote('${u.uid}','${(u.displayName||u.email||'Specialist').replace(/'/g,"\\'")}')">Make Growth Specialist</button>`
        : '<span class="text-xs text-emerald">Already specialist</span>'}
    </div>`;
  }).join('') || '<p class="text-muted">No users</p>';
}

async function promote(uid, displayName) {
  try {
    await db.collection('users').doc(uid).update({ role: 'growth' });
    const code = displayName.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 1000);
    await db.collection('marketers').doc(uid).set({
      displayName,
      referralCode: code,
      status: 'active',
      commissionModel: 'threshold',
      milestoneTarget: 50,
      assignedAmount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showMsg('Promoted to Growth Specialist. Code: ' + code);
  } catch (e) {
    showMsg('Error: ' + e.message);
  }
}
