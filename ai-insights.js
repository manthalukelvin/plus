// ai-insights.js — AI Assistant for MyJournal+ (fixed + chat history in Firestore)
// Premium-gated. Uses secure backend when BACKEND_AI_INSIGHTS_URL is set;
// otherwise optional client Gemini key (localStorage mj_gemini_key or LOCAL_AI_API_KEY).

const BACKEND_AI_INSIGHTS_URL = window.BACKEND_AI_INSIGHTS_URL || "https://myjournalplus.freedev.app/api/ai-chat";
const LOCAL_AI_API_KEY = window.LOCAL_AI_API_KEY
  || (typeof localStorage !== 'undefined' ? (localStorage.getItem('mj_gemini_key') || '') : '')
  || "";  // never ship a real key in frontend
const LOCAL_AI_PROVIDER = window.LOCAL_AI_PROVIDER || "gemini";

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

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const totalEntriesEl = document.getElementById('totalEntries');
const totalMoodsEl = document.getElementById('totalMoods');
const aiContainer = document.querySelector('.ai-container');

let currentUser = null;
let userEntries = [];
let userMoods = [];
let conversationContext = "";
let chatHistory = []; // { role: 'user'|'assistant', text, at }
const MAX_STORED_MESSAGES = 80;

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function formatMessageHtml(text) {
  // Light markdown-ish: bold, newlines
  let t = escapeHtml(text);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\n/g, '<br>');
  return t;
}

function addMessage(text, sender = 'assistant', isHtml = false, skipSave = false) {
  if (!chatMessages) return;
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message ' + sender;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  if (isHtml) contentDiv.innerHTML = text;
  else contentDiv.innerHTML = formatMessageHtml(text);

  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (!skipSave && (sender === 'user' || sender === 'assistant')) {
    chatHistory.push({ role: sender, text: String(text), at: Date.now() });
    if (chatHistory.length > MAX_STORED_MESSAGES) {
      chatHistory = chatHistory.slice(-MAX_STORED_MESSAGES);
    }
    persistChatDebounced();
  }
}

function addTypingIndicator() {
  if (!chatMessages) return;
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';
  messageDiv.id = 'typingIndicator';
  const typingDiv = document.createElement('div');
  typingDiv.className = 'typing-indicator';
  typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  messageDiv.appendChild(typingDiv);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const typing = document.getElementById('typingIndicator');
  if (typing) typing.remove();
}

function showError(message) {
  if (!chatMessages) return;
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = '⚠️ ' + message;
  chatMessages.appendChild(errorDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showSuccess(message) {
  if (!chatMessages) return;
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.textContent = '✓ ' + message;
  chatMessages.appendChild(successDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showSimpleDialog(message, opts) {
  opts = opts || {};
  // Minimal fallback when main.js helpers are absent
  if (typeof showDialog === 'function') {
    showDialog(message, opts);
    return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#1a1440;border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:24px;max-width:400px;color:#fff;font-family:Inter,system-ui,sans-serif';
  box.innerHTML = '<p style="margin:0 0 16px;line-height:1.5">' + escapeHtml(message) + '</p>';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
  (opts.buttons || [{ text: 'OK', onClick: () => {} }]).forEach(b => {
    const btn = document.createElement('button');
    btn.textContent = b.text;
    btn.className = b.class || 'btn';
    btn.style.cssText = 'padding:8px 14px;border-radius:10px;border:none;cursor:pointer;font-weight:600;' +
      (b.class && b.class.includes('primary') ? 'background:linear-gradient(90deg,#7b6cff,#4dd3ff);color:#041025;' : 'background:rgba(255,255,255,.1);color:#fff;');
    btn.onclick = () => { document.body.removeChild(overlay); if (b.onClick) b.onClick(); };
    row.appendChild(btn);
  });
  box.appendChild(row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

let persistTimer = null;
function persistChatDebounced() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistChat, 600);
}

async function persistChat() {
  if (!currentUser || !chatHistory.length) return;
  try {
    await db.collection('users').doc(currentUser.uid).collection('aiChats').doc('latest').set({
      messages: chatHistory.slice(-MAX_STORED_MESSAGES),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      messageCount: chatHistory.length
    }, { merge: true });
  } catch (e) {
    console.warn('persistChat failed', e);
  }
}

async function loadChatHistory() {
  if (!currentUser || !chatMessages) return;
  try {
    const snap = await db.collection('users').doc(currentUser.uid).collection('aiChats').doc('latest').get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    const msgs = Array.isArray(data.messages) ? data.messages : [];
    if (!msgs.length) return;
    chatHistory = msgs;
    // Clear default welcome then re-render
    chatMessages.innerHTML = '';
    msgs.forEach(m => {
      if (m && m.text) addMessage(m.text, m.role === 'user' ? 'user' : 'assistant', false, true);
    });
  } catch (e) {
    console.warn('loadChatHistory', e);
  }
}

async function loadUserData() {
  if (!currentUser) return;
  try {
    const entriesSnap = await db.collection('users').doc(currentUser.uid).collection('entries').orderBy('createdAt', 'desc').limit(40).get();
    userEntries = entriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    let moodsSnap;
    try {
      moodsSnap = await db.collection('users').doc(currentUser.uid).collection('moods').orderBy('createdAt', 'desc').limit(30).get();
    } catch (e) {
      moodsSnap = await db.collection('users').doc(currentUser.uid).collection('moods').limit(30).get();
    }
    userMoods = moodsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (totalEntriesEl) totalEntriesEl.textContent = userEntries.length;
    if (totalMoodsEl) totalMoodsEl.textContent = userMoods.length;
    buildConversationContext();
  } catch (e) {
    console.error('Error loading user data:', e);
    showError('Failed to load your entries. Please refresh.');
  }
}

function buildConversationContext() {
  let context = "You are MyJournal+'s compassionate AI Assistant. Your role is to:\n";
  context += "1. Analyze journal entries to identify patterns, themes, and emotional trends\n";
  context += "2. Track mood data and provide insights about emotional well-being\n";
  context += "3. Offer supportive, non-judgmental guidance based on the user's personal journal\n";
  context += "4. Suggest actionable steps for mental health improvement\n";
  context += "5. Celebrate progress and provide encouragement\n";
  context += "6. Always prioritize mental health and suggest professional help if needed\n\n";
  context += "IMPORTANT GUIDELINES:\n";
  context += "- Be warm, empathetic, and genuinely supportive\n";
  context += "- Never provide medical advice; suggest professional help when appropriate\n";
  context += "- Use specific examples from their journal when relevant\n";
  context += "- Acknowledge their feelings and validate their experiences\n";
  context += "- Focus on growth, resilience, and positive coping strategies\n";
  context += "- Keep responses concise but meaningful (2-4 short paragraphs max)\n\n";

  if (userEntries.length > 0) {
    context += "USER'S RECENT ENTRIES SUMMARY:\n";
    userEntries.slice(0, 6).forEach((entry, idx) => {
      const title = entry.title || '(Untitled)';
      const raw = (entry.content || entry.body || entry.text || '').replace(/<\/?[^>]+(>|$)/g, '');
      const snippet = raw.substring(0, 160) + (raw.length > 160 ? '...' : '');
      context += `${idx + 1}. "${title}": ${snippet}\n`;
    });
    context += "\n";
  }
  if (userMoods.length > 0) {
    context += "USER'S MOOD HISTORY (Last 10):\n";
    const recentMoods = userMoods.slice(0, 10);
    const moodCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    recentMoods.forEach(mood => {
      const v = Number(mood.value || mood.mood || mood.score);
      if (moodCounts[v] !== undefined) moodCounts[v]++;
    });
    const moodLabels = { 1: 'Terrible', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
    Object.keys(moodCounts).forEach(value => {
      if (moodCounts[value] > 0) context += `${moodLabels[value]} (${value}): ${moodCounts[value]} times\n`;
    });
    context += "\n";
  }
  conversationContext = context;
}

async function ensurePremiumAccessOrRedirect() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        showSimpleDialog('Please sign in to use AI Insights. Free users get 2 AI uses; Premium unlocks unlimited.', {
          buttons: [
            { text: 'Sign in', class: 'btn primary', onClick: () => { window.location.href = 'login.html'; } },
            { text: 'Back', class: 'btn', onClick: () => { window.location.href = 'home.html'; } }
          ]
        });
        return resolve(false);
      }
      try {
        const doc = await db.collection('users').doc(user.uid).get().catch(() => null);
        const data = doc && doc.exists ? doc.data() : {};
        if (!data || !data.isPremium) {
          showSimpleDialog('You've used your free AI insights. Upgrade to MyJournal+ Premium for unlimited AI.', {
            buttons: [
              { text: 'Upgrade', class: 'btn primary', onClick: () => { window.location.href = 'confirm.html'; } },
              { text: 'Back', class: 'btn', onClick: () => { window.location.href = 'home.html'; } }
            ]
          });
          return resolve(false);
        }
        resolve(true);
      } catch (e) {
        console.error('premium check error', e);
        resolve(false);
      }
    });
  });
}

async function callGemini(systemPrompt) {
  const models = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  ];
  let lastErr = '';
  for (const model of models) {
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(LOCAL_AI_API_KEY);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7, topP: 0.95 }
        })
      });
      if (!res.ok) {
        lastErr = model + ': ' + res.status + ' ' + (await res.text()).slice(0, 200);
        continue;
      }
      const json = await res.json();
      const text = (json.candidates && json.candidates[0] && json.candidates[0].content &&
        json.candidates[0].content.parts && json.candidates[0].content.parts[0] &&
        json.candidates[0].content.parts[0].text) || '';
      if (text) {
        console.log('AI model used:', model);
        return text;
      }
      lastErr = model + ': empty response';
    } catch (err) {
      lastErr = model + ': ' + (err && err.message ? err.message : String(err));
    }
  }
  throw new Error(lastErr || 'No Gemini model responded');
}

async function sendMessage(presetText) {
  const text = (presetText != null ? String(presetText) : (userInput && userInput.value) || '').trim();
  if (!text) return;
  if (userInput) {
    userInput.value = '';
    userInput.style.height = 'auto';
  }
  addMessage(text, 'user');
  addTypingIndicator();
  if (sendBtn) sendBtn.disabled = true;

  try {
    const recentTurns = chatHistory.slice(-8).map(m =>
      (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.text
    ).join('\n');
    const systemPrompt = conversationContext +
      (recentTurns ? '\nRecent conversation:\n' + recentTurns + '\n' : '') +
      '\nUser question: ' + text + '\n\nProvide a warm, supportive response (concise).';

    let responseText = '';

    if (BACKEND_AI_INSIGHTS_URL && auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(BACKEND_AI_INSIGHTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + idToken
        },
        body: JSON.stringify({ prompt: systemPrompt, maxTokens: 600 })
      });
      if (!res.ok) {
        const textResp = await res.text();
        removeTypingIndicator();
        showError('AI backend error: ' + res.status + ' ' + textResp.slice(0, 120));
        return;
      }
      const json = await res.json();
      responseText = json.text || json.response || 'Sorry, I could not generate a response.';
    } else if (LOCAL_AI_API_KEY) {
      if (LOCAL_AI_PROVIDER === 'gemini') {
        responseText = await callGemini(systemPrompt);
      } else {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + LOCAL_AI_API_KEY
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: systemPrompt }],
            max_tokens: 600
          })
        });
        if (!res.ok) {
          removeTypingIndicator();
          showError('OpenAI API error: ' + res.status);
          return;
        }
        const json = await res.json();
        responseText = (json.choices && json.choices[0] && json.choices[0].message.content) || 'No response';
      }
    } else {
      removeTypingIndicator();
      showError('AI not configured. Ask an admin to set a Gemini API key, or run: localStorage.setItem("mj_gemini_key","YOUR_KEY") then reload.');
      return;
    }

    removeTypingIndicator();
    addMessage(responseText, 'assistant');
  } catch (error) {
    removeTypingIndicator();
    console.error('Error calling AI:', error);
    showError('AI request failed: ' + (error && error.message ? error.message.slice(0, 160) : 'Please try again later.'));
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

sendBtn && sendBtn.addEventListener('click', () => sendMessage());
if (userInput) {
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  });
}

clearChatBtn && clearChatBtn.addEventListener('click', async () => {
  if (!confirm('Clear all chat messages? This removes saved history too.')) return;
  chatHistory = [];
  if (chatMessages) {
    chatMessages.innerHTML = '<div class="message system"><div class="message-content">👋 Welcome to your AI Journal Assistant! I\'m here to help you analyze your entries, understand your moods, and provide personalized insights for your mental wellbeing.</div></div>';
  }
  if (currentUser) {
    try {
      await db.collection('users').doc(currentUser.uid).collection('aiChats').doc('latest').delete();
    } catch (e) { /* ok */ }
  }
  showSuccess('Chat cleared');
});

// FAQ / quick prompts
document.querySelectorAll('.faq-item').forEach(item => {
  item.addEventListener('click', () => {
    const q = item.getAttribute('data-faq') || item.textContent;
    if (q) sendMessage(q);
  });
});

(async function initPage() {
  const allowed = await ensurePremiumAccessOrRedirect();
  if (!allowed) {
    if (aiContainer) {
      aiContainer.innerHTML = `<div class="ai-premium-gate" style="padding:28px;max-width:520px;margin:40px auto;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:12px">✨</div>
        <h2 style="margin:0 0 8px">AI Insights — Premium</h2>
        <p style="color:var(--muted,rgba(255,255,255,.6));line-height:1.6">Unlock journaling analysis, mood summaries, and personalized prompts with Premium.</p>
        <p style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a href="confirm.html" class="btn primary" style="text-decoration:none;padding:10px 18px;border-radius:12px;background:linear-gradient(90deg,#7b6cff,#4dd3ff);color:#041025;font-weight:700">Upgrade</a>
          <a href="home.html" class="btn" style="text-decoration:none;padding:10px 18px;border-radius:12px;background:rgba(255,255,255,.08);color:#fff">Back</a>
        </p>
      </div>`;
    }
    return;
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) return;
    currentUser = user;
    await loadUserData();
    await loadChatHistory();
    if (!chatHistory.length) {
      if (userEntries.length === 0 && userMoods.length === 0) {
        addMessage("Welcome! I notice you don't have any entries yet. Start journaling, and I'll help you gain insights about your thoughts, feelings, and growth. 📝", 'assistant');
      } else {
        addMessage(`Great to see you again! I've reviewed your ${userEntries.length} entries and ${userMoods.length} mood logs. Ask me anything about your journal journey, and I'll provide personalized insights. 🌟`, 'assistant');
      }
    }
  });
})();
