import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBtYSlpZ0JHmUDNYCbp5kynR_yifj5y0dY",
  authDomain: "baseforbiotest.firebaseapp.com",
  projectId: "baseforbiotest",
  storageBucket: "baseforbiotest.firebasestorage.app",
  messagingSenderId: "678186767483",
  appId: "1:678186767483:web:ca06fa25c69fab8aa5fede"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const SINGLE_COUNT = 25;
const MULTIPLE_COUNT = 15;
const ADMIN_EMAIL = "faceits1mple2000@gmail.com";

let currentUser = null;
let isAdmin = false;
let allQuestions = [];
let singleQuestions = [];
let multipleQuestions = [];
let VARIANTS_LIST = [];
let currentVariant = null;
let variantsState = {};

// ===== AUTH =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    return;
  }
  
  currentUser = user;
  isAdmin = user.email === ADMIN_EMAIL;
  
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('userEmail').textContent = user.email;
  
  setupAdminPanel();
  
  // Проверяем доступ пользователя
  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists()) {
    // Создаем нового пользователя
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      allowed: false,
      createdAt: serverTimestamp()
    });
    alert('Тіркелу сәтті! Админ растауын күтіңіз.');
    await signOut(auth);
    return;
  }
  
  const userData = userDoc.data();
  if (!userData.allowed && !isAdmin) {
    alert('Рұқсат күтілуде. Админмен хабарласыңыз.');
    await signOut(auth);
    return;
  }
  
  await loadQuestionsFromFirestore();
  generateVariantList();
  loadLocal();
  renderSidebar();
  selectVariant(currentVariant || VARIANTS_LIST[0]);
});

document.getElementById('authBtn')?.addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const pass = document.getElementById('password').value;
  
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      await createUserWithEmailAndPassword(auth, email, pass);
    } else {
      document.getElementById('authStatus').textContent = e.message;
    }
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));

// ===== ADMIN PANEL =====
function setupAdminPanel() {
  if (!isAdmin) return;
  
  let panel = document.getElementById('adminPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'adminPanel';
    panel.innerHTML = `
      <button class="admin-btn" onclick="toggleAdmin()">👑 Админ</button>
      <div class="admin-dropdown" id="adminDropdown" style="display:none;">
        <h4>Пайдаланушылар</h4>
        <div id="adminUsers"></div>
        <button onclick="grantAll()">✅ Барлығына рұқсат</button>
        <button onclick="revokeAll()">❌ Барлығынан алу</button>
      </div>
    `;
    document.body.appendChild(panel);
  }
}

window.toggleAdmin = () => {
  const d = document.getElementById('adminDropdown');
  if (d.style.display === 'none') {
    loadAdminUsers();
    d.style.display = 'block';
  } else {
    d.style.display = 'none';
  }
};

async function loadAdminUsers() {
  const snap = await getDocs(collection(db, "users"));
  let html = '';
  snap.forEach(d => {
    const u = d.data();
    html += `
      <div class="admin-user">
        ${u.email}
        <span class="${u.allowed ? 'status-ok' : 'status-wait'}">${u.allowed ? '✓' : '○'}</span>
        <button onclick="toggleAccess('${d.id}', ${!u.allowed})">${u.allowed ? 'Алу' : 'Беру'}</button>
      </div>
    `;
  });
  document.getElementById('adminUsers').innerHTML = html;
}

window.toggleAccess = async (uid, allow) => {
  await updateDoc(doc(db, "users", uid), { allowed: allow });
  loadAdminUsers();
};

window.grantAll = async () => {
  const snap = await getDocs(collection(db, "users"));
  snap.forEach(async d => {
    if (d.data().email !== ADMIN_EMAIL) {
      await updateDoc(doc(db, "users", d.id), { allowed: true });
    }
  });
  loadAdminUsers();
};

window.revokeAll = async () => {
  const snap = await getDocs(collection(db, "users"));
  snap.forEach(async d => {
    if (d.data().email !== ADMIN_EMAIL) {
      await updateDoc(doc(db, "users", d.id), { allowed: false });
    }
  });
  loadAdminUsers();
};

// ===== LOAD QUESTIONS =====
async function loadQuestionsFromFirestore() {
  try {
    const snap = await getDocs(collection(db, "questions"));
    allQuestions = [];
    singleQuestions = [];
    multipleQuestions = [];
    
    snap.forEach(doc => {
      const q = doc.data();
      const correct = (q.correct || [0]).map(c => parseInt(c)).filter(c => !isNaN(c));
      
      const question = {
        id: doc.id,
        text: q.text,
        answers: q.answers || [],
        correct: correct,
        isMultiple: q.type === "multiple" || correct.length > 1
      };
      
      allQuestions.push(question);
      if (question.isMultiple) multipleQuestions.push(question);
      else singleQuestions.push(question);
    });
  } catch (e) {
    console.error("Error loading questions:", e);
    alert("Сұрақтарды жүктеу қатесі!");
  }
}

// ===== AUTO VARIANTS =====
function generateVariantList() {
  const maxSingle = Math.floor(singleQuestions.length / SINGLE_COUNT);
  const maxMulti = Math.floor(multipleQuestions.length / MULTIPLE_COUNT);
  const maxVariants = Math.min(maxSingle, maxMulti, 20);
  
  VARIANTS_LIST = [];
  for (let i = 1; i <= Math.max(1, maxVariants); i++) {
    VARIANTS_LIST.push(`${i}-нұсқа`);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateVariant(vid) {
  const used = new Set();
  Object.values(variantsState).forEach(v => v.questions?.forEach(q => used.add(q.originalId)));
  
  let availSingle = singleQuestions.filter(q => !used.has(q.id));
  let availMulti = multipleQuestions.filter(q => !used.has(q.id));
  
  if (availSingle.length < SINGLE_COUNT) availSingle = [...singleQuestions];
  if (availMulti.length < MULTIPLE_COUNT) availMulti = [...multipleQuestions];
  
  const selSingle = shuffle(availSingle).slice(0, SINGLE_COUNT);
  const selMulti = shuffle(availMulti).slice(0, MULTIPLE_COUNT);
  
  const process = (q, idx) => {
    const order = shuffle(q.answers.map((_, i) => i));
    return {
      id: `${vid}_${q.id}`,
      originalId: q.id,
      text: q.text,
      answers: order.map(i => q.answers[i]),
      correct: q.correct.map(c => order.indexOf(c)),
      isMultiple: q.isMultiple,
      userAnswers: [],
      checked: false
    };
  };
  
  return {
    id: vid,
    questions: [...selSingle.map((q, i) => process(q, i)), ...selMulti.map((q, i) => process(q, i + SINGLE_COUNT))],
    completed: false,
    score: 0,
    maxScore: SINGLE_COUNT + MULTIPLE_COUNT * 2
  };
}

// ===== STATE =====
function getKey() { return `bio_v6_${currentUser?.uid || 'guest'}`; }

function saveLocal() {
  try {
    localStorage.setItem(getKey(), JSON.stringify({v: variantsState, c: currentVariant, t: Date.now()}));
  } catch(e) {}
}

function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(getKey()));
    if (d) { variantsState = d.v || {}; currentVariant = d.c; }
  } catch(e) { variantsState = {}; }
}

// ===== CLOUD =====
window.saveCloud = async () => {
  if (!currentUser) return alert('Кіріңіз');
  
  const btn = document.getElementById('saveCloudBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  
  try {
    await setDoc(doc(db, "variants_progress", currentUser.uid), {
      d: JSON.stringify(variantsState),
      c: currentVariant,
      t: serverTimestamp(),
      u: currentUser.uid,
      e: currentUser.email
    });
    showNotification('Сақталды!', 'success');
  } catch (e) {
    showNotification('Қате!', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾'; }
  }
};

window.loadCloud = async () => {
  if (!currentUser || !confirm('Жүктеу?')) return;
  
  const btn = document.getElementById('loadCloudBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  
  try {
    const snap = await getDoc(doc(db, "variants_progress", currentUser.uid));
    if (!snap.exists()) {
      showNotification('Бұлтта жоқ!', 'info');
      return;
    }
    const d = snap.data();
    variantsState = JSON.parse(d.d);
    currentVariant = d.c;
    saveLocal();
    renderSidebar();
    selectVariant(currentVariant);
    showNotification('Жүктелді!', 'success');
  } catch (e) {
    showNotification('Қате!', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '☁️'; }
  }
};

// ===== UI =====
function renderSidebar() {
  const sb = document.getElementById('sidebar');
  const st = variantsState[currentVariant];
  const answered = st ? st.questions.filter(q => q.checked).length : 0;
  
  sb.innerHTML = `
    <h3>Варианттар</h3>
    <div class="cloud-btns">
      <button id="saveCloudBtn" onclick="saveCloud()">💾</button>
      <button id="loadCloudBtn" onclick="loadCloud()">☁️</button>
    </div>
    <div class="progress-text">${answered}/${st?.questions.length || 0}</div>
    <div class="variants-list">
      ${VARIANTS_LIST.map(v => {
        const vs = variantsState[v];
        let status = '', cls = '';
        if (vs?.completed) { status = '✓'; cls = 'done'; }
        else if (vs?.questions?.some(q => q.checked)) {
          const a = vs.questions.filter(q => q.checked).length;
          status = `${a}/${vs.questions.length}`;
          cls = 'active';
        }
        return `<button class="${v===currentVariant?'current':''} ${cls}" onclick="selectVariant('${v}')">${v} <span>${status}</span></button>`;
      }).join('')}
    </div>
  `;
}

window.selectVariant = (vid) => {
  currentVariant = vid;
  if (!variantsState[vid]) variantsState[vid] = generateVariant(vid);
  saveLocal();
  renderSidebar();
  renderContent();
  window.scrollTo(0, 0);
};

function renderContent() {
  const el = document.getElementById('variantContent');
  const st = variantsState[currentVariant];
  if (!st) return;
  
  const answered = st.questions.filter(q => q.userAnswers.length > 0).length;
  const allAnswered = answered === st.questions.length;
  
  if (st.completed) {
    renderResults(el, st);
    return;
  }
  
  el.innerHTML = `
    <div class="variant-header">
      <h2>${currentVariant}</h2>
      <button onclick="resetVariant()">🔄 Қайта</button>
    </div>
    <div class="questions">
      ${st.questions.map((q, i) => `
        <div class="q-card ${q.checked ? (isCorrect(q) ? 'right' : 'wrong') : ''}" id="q${i}">
          <div class="q-top">
            <span class="num">${i+1}</span>
            <span class="type">${q.isMultiple?'☑️':'◉'}</span>
            ${q.checked ? `<span class="res">${isCorrect(q)?'✓':'✗'}</span>` : ''}
          </div>
          <div class="q-txt">${q.text}</div>
          <div class="ans-list">
            ${q.answers.map((a,j) => `
              <label class="${q.userAnswers.includes(j)?'sel':''} ${q.checked?(q.correct.includes(j)?'cor':q.userAnswers.includes(j)?'err':''):''}" 
                     onclick="${q.checked?'':'toggleAnswer(${i},${j})'}">
                <input type="${q.isMultiple?'checkbox':'radio'}" ${q.userAnswers.includes(j)?'checked':''} ${q.checked?'disabled':''}>
                <span class="mark">${q.checked?(q.correct.includes(j)?'✓':q.userAnswers.includes(j)?'✗':''):''}</span>
                ${a}
              </label>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    ${allAnswered ? `<div class="finish-box"><button onclick="finishVariant()">🏁 Аяқтау</button></div>` : ''}
  `;
}

window.toggleAnswer = (qi, ai) => {
  const q = variantsState[currentVariant].questions[qi];
  if (q.isMultiple) {
    q.userAnswers = q.userAnswers.includes(ai) ? q.userAnswers.filter(i => i !== ai) : [...q.userAnswers, ai];
  } else {
    q.userAnswers = [ai];
  }
  updateCard(qi);
};

function updateCard(qi) {
  const st = variantsState[currentVariant];
  const q = st.questions[qi];
  const card = document.getElementById(`q${qi}`);
  if (!card) return;
  
  const labels = card.querySelectorAll('label');
  labels.forEach((l, i) => {
    l.classList.toggle('sel', q.userAnswers.includes(i));
    l.querySelector('input').checked = q.userAnswers.includes(i);
  });
  
  const all = st.questions.every(q => q.userAnswers.length > 0);
  if (all && !document.querySelector('.finish-box')) {
    renderContent();
  }
}

window.finishVariant = () => {
  const st = variantsState[currentVariant];
  const unans = st.questions.filter(q => q.userAnswers.length === 0);
  if (unans.length > 0) {
    showNotification(`Жауап берілмеген: ${unans.length}`, 'warning');
    document.getElementById(`q${st.questions.indexOf(unans[0])}`)?.scrollIntoView({behavior:'smooth'});
    return;
  }
  
  st.questions.forEach(q => {
    q.checked = true;
    if (isCorrect(q)) st.score += q.isMultiple ? 2 : 1;
  });
  
  st.completed = true;
  saveLocal();
  renderContent();
  renderSidebar();
  showNotification('Аяқталды!', 'success');
};

function renderResults(el, st) {
  const pct = Math.round((st.score/st.maxScore)*100);
  el.innerHTML = `
    <div class="res-card">
      <div class="score-big">${pct}%</div>
      <div class="score-det">${st.score}/${st.maxScore}</div>
      <button onclick="resetVariant()">Қайта</button>
    </div>
    <div class="res-list">
      ${st.questions.map((q,i) => `
        <div class="res-item ${isCorrect(q)?'ok':'bad'}">
          <div class="res-h"><span>${i+1}</span>${isCorrect(q)?'✓':'✗'}</div>
          <div>${q.text}</div>
          <div>Сіз: ${q.userAnswers.map(j=>q.answers[j]).join(', ')||'-'}</div>
          <div>Дұрыс: ${q.correct.map(j=>q.answers[j]).join(', ')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

window.resetVariant = () => {
  if (!confirm('Нөлдеу?')) return;
  delete variantsState[currentVariant];
  selectVariant(currentVariant);
};

function isCorrect(q) {
  const c = [...q.correct].sort((a,b)=>a-b);
  const u = [...q.userAnswers].sort((a,b)=>a-b);
  return c.length===u.length && c.every((v,i)=>v===u[i]);
}

function showNotification(m, t='success') {
  const n = document.createElement('div');
  n.className = `notif ${t}`;
  n.textContent = m;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => n.remove(), 3000);
}

// ===== STYLES (Ваш дизайн - синий/фиолетовый) =====
const css = document.createElement('style');
css.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: #333; }
  
  /* Auth */
  #authOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .auth-box { background: white; padding: 40px; border-radius: 12px; width: 90%; max-width: 400px; text-align: center; }
  .auth-box h2 { color: #667eea; margin-bottom: 20px; }
  .auth-box input { width: 100%; padding: 12px; margin: 8px 0; border: 2px solid #ddd; border-radius: 8px; }
  #authBtn { width: 100%; padding: 14px; margin-top: 16px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; }
  #authBtn:hover { background: #5568d3; }
  
  /* App */
  #app { display: flex; }
  
  /* Admin */
  #adminPanel { position: fixed; top: 20px; right: 20px; z-index: 100; }
  .admin-btn { background: #ff9800; color: white; padding: 10px 20px; border: none; border-radius: 20px; cursor: pointer; font-weight: bold; }
  .admin-dropdown { position: absolute; top: 50px; right: 0; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); width: 280px; }
  .admin-user { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
  .status-ok { color: #4caf50; }
  .status-wait { color: #999; }
  
  /* Sidebar */
  #sidebar { width: 260px; background: rgba(255,255,255,0.95); padding: 20px; position: fixed; height: 100vh; overflow-y: auto; box-shadow: 2px 0 10px rgba(0,0,0,0.1); }
  #sidebar h3 { color: #667eea; margin-bottom: 15px; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
  .cloud-btns { display: flex; gap: 10px; margin-bottom: 15px; }
  .cloud-btns button { flex: 1; padding: 10px; border: none; border-radius: 8px; background: #667eea; color: white; cursor: pointer; }
  .cloud-btns button:hover { background: #5568d3; }
  .progress-text { text-align: center; padding: 10px; background: #f0f0f0; border-radius: 8px; margin-bottom: 15px; color: #666; }
  .variants-list { display: flex; flex-direction: column; gap: 8px; }
  .variants-list button { display: flex; justify-content: space-between; padding: 12px; border: 2px solid #e0e0e0; background: white; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
  .variants-list button:hover { border-color: #667eea; transform: translateX(4px); }
  .variants-list button.current { background: #667eea; color: white; border-color: #667eea; }
  .variants-list button.active { border-left: 4px solid #ff9800; }
  .variants-list button.done { border-left: 4px solid #4caf50; }
  
  /* Content */
  #variantContent { margin-left: 260px; flex: 1; padding: 30px; max-width: 800px; }
  .variant-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
  .variant-header h2 { color: #667eea; font-size: 28px; }
  .variant-header button { padding: 10px 20px; border: none; border-radius: 8px; background: #ff9800; color: white; cursor: pointer; }
  
  .questions { display: flex; flex-direction: column; gap: 20px; }
  .q-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
  .q-card.right { background: #e8f5e9; }
  .q-card.wrong { background: #ffebee; }
  
  .q-top { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
  .num { background: #667eea; color: white; padding: 5px 15px; border-radius: 20px; font
