import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, serverTimestamp, updateDoc, deleteDoc
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
    showAuth();
    return;
  }
  currentUser = user;
  isAdmin = user.email === ADMIN_EMAIL;
  
  hideAuth();
  setupAdminPanel();
  
  await loadQuestionsFromFirestore();
  generateVariantList(); // Авто-генерация списка вариантов
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
      await setDoc(doc(db, "users", auth.currentUser.uid), {
        email: email,
        allowed: false,
        createdAt: serverTimestamp()
      });
    }
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));

// ===== ADMIN PANEL =====
function setupAdminPanel() {
  if (!isAdmin) {
    document.getElementById('adminPanel')?.remove();
    return;
  }
  
  let panel = document.getElementById('adminPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'adminPanel';
    panel.innerHTML = `
      <div class="admin-toggle" onclick="toggleAdmin()">👑 Админ</div>
      <div class="admin-content" id="adminContent" style="display:none;">
        <h3>Админ панель</h3>
        <button onclick="loadAllUsers()">Пайдаланушылар</button>
        <button onclick="grantAllAccess()">Барлығына рұқсат</button>
        <button onclick="revokeAllAccess()">Барлық рұқсатты алу</button>
        <div id="adminUsers"></div>
      </div>
    `;
    document.body.appendChild(panel);
  }
}

window.toggleAdmin = () => {
  const content = document.getElementById('adminContent');
  content.style.display = content.style.display === 'none' ? 'block' : 'none';
};

window.loadAllUsers = async () => {
  const snap = await getDocs(collection(db, "users"));
  let html = '<h4>Пайдаланушылар:</h4>';
  snap.forEach(d => {
    const u = d.data();
    html += `
      <div class="user-row">
        ${u.email} 
        <span class="${u.allowed ? 'allowed' : 'denied'}">${u.allowed ? '✓' : '✗'}</span>
        <button onclick="toggleUser('${d.id}', ${!u.allowed})">${u.allowed ? 'Алу' : 'Беру'}</button>
      </div>
    `;
  });
  document.getElementById('adminUsers').innerHTML = html;
};

window.toggleUser = async (uid, allow) => {
  await updateDoc(doc(db, "users", uid), { allowed: allow });
  loadAllUsers();
};

window.grantAllAccess = async () => {
  const snap = await getDocs(collection(db, "users"));
  snap.forEach(async (d) => {
    if (d.data().email !== ADMIN_EMAIL) {
      await updateDoc(doc(db, "users", d.id), { allowed: true });
    }
  });
  loadAllUsers();
};

window.revokeAllAccess = async () => {
  const snap = await getDocs(collection(db, "users"));
  snap.forEach(async (d) => {
    if (d.data().email !== ADMIN_EMAIL) {
      await updateDoc(doc(db, "users", d.id), { allowed: false });
    }
  });
  loadAllUsers();
};

// ===== LOAD QUESTIONS =====
async function loadQuestionsFromFirestore() {
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
  
  console.log(`Жүктелді: ${singleQuestions.length} single, ${multipleQuestions.length} multiple`);
}

// ===== AUTO GENERATE VARIANTS =====
function generateVariantList() {
  // Сколько вариантов можно создать из имеющихся вопросов
  const maxBySingle = Math.floor(singleQuestions.length / SINGLE_COUNT);
  const maxByMultiple = Math.floor(multipleQuestions.length / MULTIPLE_COUNT);
  const maxVariants = Math.min(maxBySingle, maxByMultiple, 20); // макс 20 вариантов
  
  VARIANTS_LIST = [];
  for (let i = 1; i <= maxVariants; i++) {
    VARIANTS_LIST.push(`${i}-нұсқа`);
  }
  
  // Если вопросов мало — дублируем (но предупреждаем)
  if (VARIANTS_LIST.length === 0) {
    console.warn('Вопросов недостаточно! Нужно минимум 25 single и 15 multiple');
    VARIANTS_LIST = ["1-нұсқа"]; // минимум 1
  }
  
  console.log(`Создано вариантов: ${VARIANTS_LIST.length}`);
}

// ===== GENERATE VARIANT =====
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateVariant(vid) {
  // Использованные вопросы в других вариантах текущего пользователя
  const used = new Set();
  Object.values(variantsState).forEach(v => v.questions?.forEach(q => used.add(q.originalId)));
  
  let availSingle = singleQuestions.filter(q => !used.has(q.id));
  let availMulti = multipleQuestions.filter(q => !used.has(q.id));
  
  // Если уникальных не хватает — берем из общего пула (с повторами)
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
function getKey() { return `bio_v5_${currentUser?.uid || 'guest'}`; }

function saveLocal() {
  try {
    localStorage.setItem(getKey(), JSON.stringify({v: variantsState, c: currentVariant, t: Date.now()}));
  } catch(e) { console.error('Local save error:', e); }
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
  const originalText = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳'; }
  
  try {
    // Проверяем доступ
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    if (!userDoc.exists() || !userDoc.data().allowed) {
      showNotification('❌ Рұқсат жоқ! Админмен хабарласыңыз.', 'error');
      return;
    }
    
    const payload = {
      d: JSON.stringify(variantsState),
      c: currentVariant,
      t: serverTimestamp(),
      u: currentUser.uid,
      e: currentUser.email
    };
    
    await setDoc(doc(db, "variants_progress", currentUser.uid), payload);
    showNotification('✅ Бұлтқа сақталды!', 'success');
    
  } catch (e) {
    console.error('Save error:', e);
    showNotification('❌ Сақтау қатесі!', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalText || '💾'; }
  }
};

window.loadCloud = async () => {
  if (!currentUser) return alert('Кіріңіз');
  if (!confirm('Бұлттан жүктеу? Барлық жергілікті деректер ауыстырылады!')) return;
  
  const btn = document.getElementById('loadCloudBtn');
  const originalText = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳'; }
  
  try {
    const snap = await getDoc(doc(db, "variants_progress", currentUser.uid));
    if (!snap.exists()) {
      showNotification('ℹ️ Бұлтта деректер жоқ', 'info');
      return;
    }
    
    const d = snap.data();
    if (!d.d) {
      showNotification('❌ Деректер бүлінген', 'error');
      return;
    }
    
    variantsState = JSON.parse(d.d);
    currentVariant = d.c || VARIANTS_LIST[0];
    saveLocal();
    renderSidebar();
    selectVariant(currentVariant);
    showNotification('✅ Бұлттан жүктелді!', 'success');
    
  } catch (e) {
    console.error('Load error:', e);
    showNotification('❌ Жүктеу қатесі!', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalText || '☁️'; }
  }
};

// ===== UI =====
function renderSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  
  const st = variantsState[currentVariant];
  const answered = st ? st.questions.filter(q => q.checked).length : 0;
  const total = st ? st.questions.length : 0;
  
  sb.innerHTML = `
    <div class="sidebar-header">
      <h3>Варианттар (${VARIANTS_LIST.length})</h3>
      <div class="cloud-btns">
        <button id="saveCloudBtn" onclick="saveCloud()" title="Бұлтқа сақтау">💾</button>
        <button id="loadCloudBtn" onclick="loadCloud()" title="Бұлттан жүктеу">☁️</button>
      </div>
    </div>
    <div class="variant-progress">${currentVariant ? `${answered}/${total} жауап` : ''}</div>
    <div class="variants-list">
      ${VARIANTS_LIST.map((v, idx) => {
        const vs = variantsState[v];
        let status = '';
        let cls = '';
        if (vs?.completed) {
          status = '✓';
          cls = 'completed';
        } else if (vs?.questions?.some(q => q.checked)) {
          const ans = vs.questions.filter(q => q.checked).length;
          status = `${ans}/${vs.questions.length}`;
          cls = 'progress';
        }
        return `
          <button class="variant-btn ${v===currentVariant?'active':''} ${cls}" onclick="selectVariant('${v}')">
            <span class="v-name">${v}</span>
            <span class="v-status">${status}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

window.selectVariant = (vid) => {
  currentVariant = vid;
  if (!variantsState[vid]) {
    variantsState[vid] = generateVariant(vid);
    saveLocal();
  }
  renderSidebar();
  renderContent();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function renderContent() {
  const el = document.getElementById('variantContent');
  const st = variantsState[currentVariant];
  if (!st) return;
  
  const answered = st.questions.filter(q => q.checked).length;
  const allAnswered = answered === st.questions.length;
  
  if (st.completed) {
    renderResults(el, st);
    return;
  }
  
  el.innerHTML = `
    <div class="variant-header">
      <div class="v-info">
        <h1>${currentVariant}</h1>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${(answered/st.questions.length)*100}%"></div>
          <span>${answered}/${st.questions.length}</span>
        </div>
      </div>
      <button class="btn-reset" onclick="resetVariant()">🔄 Қайта бастау</button>
    </div>
    
    <div class="questions-list">
      ${st.questions.map((q, i) => `
        <div class="question-card ${q.checked ? (isCorrect(q) ? 'correct' : 'wrong') : ''}" id="q${i}">
          <div class="q-header">
            <span class="q-num">${i + 1}</span>
            <span class="q-type">${q.isMultiple ? '☑️ Көп жауапты' : '◉ Бір жауапты'}</span>
            ${q.checked ? `<span class="q-result">${isCorrect(q) ? '✓ Дұрыс' : '✗ Қате'}</span>` : ''}
          </div>
          
          <div class="q-text">${escapeHtml(q.text)}</div>
          
          <div class="answers">
            ${q.answers.map((a, j) => `
              <label class="answer ${q.userAnswers.includes(j) ? 'selected' : ''} 
                     ${q.checked ? (q.correct.includes(j) ? 'correct-ans' : (q.userAnswers.includes(j) ? 'wrong-ans' : '')) : ''}"
                     onclick="${q.checked ? '' : `toggleAnswer(${i}, ${j})`}">
                <input type="${q.isMultiple ? 'checkbox' : 'radio'}" 
                       ${q.userAnswers.includes(j) ? 'checked' : ''} 
                       ${q.checked ? 'disabled' : ''}>
                <span class="checkmark">${q.checked ? (q.correct.includes(j) ? '✓' : (q.userAnswers.includes(j) ? '✗' : '')) : ''}</span>
                <span class="a-text">${escapeHtml(a)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    
    ${allAnswered ? `
      <div class="finish-section">
        <div class="finish-msg">Барлық сұрақтарға жауап бердіңіз!</div>
        <button class="btn-finish" onclick="finishVariant()">
          <span>🏁 Тестті аяқтау</span>
          <small>Нәтижелерді көру</small>
        </button>
      </div>
    ` : ''}
  `;
  
  // Плавная анимация появления
  setTimeout(() => {
    document.querySelectorAll('.question-card').forEach((c, i) => {
      setTimeout(() => c.classList.add('show'), i * 50);
    });
  }, 10);
}

window.toggleAnswer = (qi, ai) => {
  const q = variantsState[currentVariant].questions[qi];
  if (q.checked) return;
  
  if (q.isMultiple) {
    if (q.userAnswers.includes(ai)) {
      q.userAnswers = q.userAnswers.filter(i => i !== ai);
    } else {
      q.userAnswers.push(ai);
    }
  } else {
    q.userAnswers = [ai];
  }
  
  // Обновляем только эту карточку без полного перерендера
  updateAnswerVisuals(qi);
};

function updateAnswerVisuals(qi) {
  const q = variantsState[currentVariant].questions[qi];
  const card = document.getElementById(`q${qi}`);
  if (!card) return;
  
  const labels = card.querySelectorAll('.answer');
  labels.forEach((lbl, idx) => {
    lbl.classList.toggle('selected', q.userAnswers.includes(idx));
    const input = lbl.querySelector('input');
    if (input) input.checked = q.userAnswers.includes(idx);
  });
  
  // Проверяем все ли отвечены для показа кнопки финиша
  const st = variantsState[currentVariant];
  const allAnswered = st.questions.every(q => q.userAnswers.length > 0);
  
  // Показываем/скрываем кнопку финиша
  let finishSection = document.querySelector('.finish-section');
  if (allAnswered && !finishSection) {
    renderContent(); // Перерендер для показа кнопки
  }
}

window.finishVariant = () => {
  const st = variantsState[currentVariant];
  
  // Проверяем все ли отвечены
  const unanswered = st.questions.filter(q => q.userAnswers.length === 0);
  if (unanswered.length > 0) {
    showNotification(`Жауап берілмеген: ${unanswered.length} сұрақ`, 'warning');
    // Скролл к первому неотвеченному
    document.getElementById(`q${st.questions.indexOf(unanswered[0])}`)?.scrollIntoView({behavior: 'smooth', block: 'center'});
    return;
  }
  
  // Проверяем все ответы
  st.questions.forEach(q => {
    q.checked = true;
    if (isCorrect(q)) {
      st.score += q.isMultiple ? 2 : 1;
    }
  });
  
  st.completed = true;
  saveLocal();
  renderContent();
  renderSidebar();
  showNotification('🎉 Тест аяқталды!', 'success');
  
  // Скролл к результатам
  setTimeout(() => {
    document.querySelector('.results-container')?.scrollIntoView({behavior: 'smooth'});
  }, 100);
};

function renderResults(el, st) {
  const correct = st.questions.filter(isCorrect).length;
  const percent = Math.round((st.score / st.maxScore) * 100);
  
  el.innerHTML = `
    <div class="results-container">
      <div class="score-card">
        <div class="score-circle">
          <svg viewBox="0 0 36 36">
            <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <path class="circle-progress" stroke-dasharray="${percent}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          </svg>
          <div class="score-value">${percent}%</div>
        </div>
        <div class="score-details">
          <div class="score-main">${st.score} <span>/ ${st.maxScore}</span></div>
          <div class="score-break">
            <div>✓ Дұрыс: ${correct}/${st.questions.length}</div>
            <div>✗ Қате: ${st.questions.length - correct}</div>
          </div>
        </div>
      </div>
      
      <div class="results-list">
        <h3>Толық нәтижелер:</h3>
        ${st.questions.map((q, i) => `
          <div class="result-item ${isCorrect(q) ? 'correct' : 'wrong'}">
            <div class="result-header">
              <span class="r-num">${i + 1}</span>
              <span class="r-badge">${isCorrect(q) ? '✓' : '✗'}</span>
            </div>
            <div class="r-text">${escapeHtml(q.text)}</div>
            <div class="r-answers">
              <div class=" yours">Сіз: ${q.userAnswers.map(j => escapeHtml(q.answers[j])).join(', ') || '-'}</div>
              <div class="correct">Дұрыс: ${q.correct.map(j => escapeHtml(q.answers[j])).join(', ')}</div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <button class="btn-reset" onclick="resetVariant()">🔄 Вариантты қайта бастау</button>
    </div>
  `;
}

window.resetVariant = () => {
  if (!confirm(`${currentVariant} нөлдеу?`)) return;
  delete variantsState[currentVariant];
  selectVariant(currentVariant);
  showNotification('Нөлденді!', 'info');
};

function isCorrect(q) {
  const c = [...q.correct].sort((a, b) => a - b);
  const u = [...q.userAnswers].sort((a, b) => a - b);
  return c.length === u.length && c.every((v, i) => v === u[i]);
}

function escapeHtml(t) {
  if (!t) return '';
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showNotification(m, type = 'success') {
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.innerHTML = `<span class="icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : '!'}</span>${m}`;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }, 3000);
}

function showAuth() {
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function hideAuth() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

// ===== STYLES =====
const css = document.createElement('style');
css.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f0f2f5; color: #333; line-height: 1.6; }
  
  /* Auth */
  #authOverlay { position: fixed; inset: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .auth-box { background: white; padding: 40px; border-radius: 20px; width: 90%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; }
  .auth-box h2 { color: #667eea; margin-bottom: 24px; font-size: 28px; }
  .auth-box input { width: 100%; padding: 14px 16px; margin: 8px 0; border: 2px solid #e0e0e0; border-radius: 12px; font-size: 16px; transition: all 0.3s; }
  .auth-box input:focus { outline: none; border-color: #667eea; }
  #authBtn { width: 100%; padding: 16px; margin-top: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s; }
  #authBtn:hover { transform: translateY(-2px); }
  #authBtn:disabled { opacity: 0.6; cursor: not-allowed; }
  
  /* App */
  #app { display: flex; min-height: 100vh; }
  
  /* Admin */
  #adminPanel { position: fixed; top: 20px; right: 20px; z-index: 100; }
  .admin-toggle { background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); color: white; padding: 12px 20px; border-radius: 50px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 15px rgba(255,152,0,0.4); transition: transform 0.2s; }
  .admin-toggle:hover { transform: scale(1.05); }
  .admin-content { position: absolute; top: 60px; right: 0; background: white; padding: 20px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); width: 300px; }
  .admin-content h3 { margin-bottom: 16px; color: #333; }
  .admin-content button { width: 100%; padding: 12px; margin: 8px 0; border: none; border-radius: 8px; background: #667eea; color: white; cursor: pointer; }
  .user-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
  .allowed { color: #4caf50; font-weight: bold; }
  .denied { color: #f44336; font-weight: bold; }
  
  /* Sidebar */
  #sidebar { width: 300px; background: white; padding: 24px; position: fixed; height: 100vh; overflow-y: auto; box-shadow: 4px 0 20px rgba(0,0,0,0.08); z-index: 50; }
  .sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 2px solid #f0f0f0; }
  .sidebar-header h3 { color: #667eea; font-size: 20px; }
  .cloud-btns { display: flex; gap: 8px; }
  .cloud-btns button { width: 40px; height: 40px; border: none; border-radius: 10px; background: #f0f0f0; cursor: pointer; font-size: 18px; transition: all 0.2s; }
  .cloud-btns button:hover { background: #667eea; color: white; transform: scale(1.1); }
  .cloud-btns button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .variant-progress { text-align: center; padding: 12px; background: #f8f9fa; border-radius: 10px; margin-bottom: 16px; font-size: 14px; color: #666; }
  .variants-list { display: flex; flex-direction: column; gap: 8px; }
  .variant-btn { display: flex; justify-content: space-between; align-items: center; padding: 16px; border: 2px solid #e0e0e0; border-radius: 12px; background: white; cursor: pointer; transition: all 0.2s; }
  .variant-btn:hover { border-color: #667eea; transform: translateX(4px); box-shadow: 0 4px 12px rgba(102,126,234,0.15); }
  .variant-btn.active { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-color: transparent; }
  .variant-btn.completed { border-left: 4px solid #4caf50; }
  .variant-btn.progress { border-left: 4px solid #ff9800; }
  .v-name { font-weight: 600; }
  .v-status { font-size: 12px; background: rgba(0,0,0,0.1); padding: 4px 10px; border-radius: 20px; }
  .variant-btn.active .v-status { background: rgba(255,255,255,0.2); }
  
  /* Content */
  #variantContent { margin-left: 300px; flex: 1; padding: 32px; max-width: 900px; }
  .variant-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; padding: 24px; background: white; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  .v-info h1 { color: #667eea; font-size: 32px; margin-bottom: 12px; }
  .progress-bar { width: 300px; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; position: relative; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.5s ease; }
  .progress-bar span { position: absolute; right: 0; top: -20px; font-size: 12px; color: #666; }
  .btn-reset { padding: 12px 24px; border: none; border-radius: 12px; background: #ff9800; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .btn-reset:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(255,152,0,0.3); }
  
  /* Questions */
  .questions-list { display: flex; flex-direction: column; gap: 24px; }
  .question-card { background: white; padding: 28px; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); opacity: 0; transform: translateY(20px); transition: all 0.4s ease; }
  .question-card.show { opacity: 1; transform: translateY(0); }
  .question-card.correct { background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); }
  .question-card.wrong { background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); }
  
  .q-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .q-num { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; font-weight: bold; font-size: 18px; }
  .q-type { padding: 6px 14px; background: #f0f0f0; border-radius: 20px; font-size: 13px; color: #666; }
  .q-result { margin-left: auto; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; }
  .correct .q-result { background: #4caf50; color: white; }
  .wrong .q-result { background: #f44336; color: white; }
  
  .q-text { font-size: 18px; line-height: 1.7; margin-bottom: 24px; color: #333; font-weight: 500; }
  
  .answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
  .answer { display: flex; align-items: center; padding: 16px 20px; background: #f8f9fa; border: 2px solid #e0e0e0; border-radius: 12px; cursor: pointer; transition: all 0.2s; gap: 12px; }
  .answer:hover:not(.correct-ans):not(.wrong-ans) { border-color: #667eea; background: #e3f2fd; transform: translateX(4px); }
  .answer.selected { border-color: #667eea; background: #e3f2fd; box-shadow: 0 2px 8px rgba(102,126,234,0.2); }
  .answer.correct-ans { border-color: #4caf50; background: #e8f5e9; }
  .answer.wrong-ans { border-color: #f44336; background: #ffebee; }
  
  .answer input { width: 20px; height: 20px; accent-color: #667eea; }
  .checkmark { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; }
  .correct-ans .checkmark { color: #4caf50; }
  .wrong-ans .checkmark { color: #f44336; }
  .a-text { flex: 1; font-size: 15px; }
  
  /* Finish */
  .finish-section { text-align: center; padding: 40px; background: white; border-radius: 20px; margin-top: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }
  .finish-msg { font-size: 20px; color: #4caf50; margin-bottom: 20px; font-weight: 600; }
  .btn-finish { padding: 20px 48px; border: none; border-radius: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 18px; font-weight: 700; cursor: pointer; transition: all 0.3s; box-shadow: 0 8px 30px rgba(102,126,234,0.4); }
  .btn-finish:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(102,126,234,0.5); }
  .btn-finish small { display: block; font-size: 14px; opacity: 0.9; margin-top: 4px; font-weight: 400; }
  
  /* Results */
  .results-container { animation: fadeIn 0.6s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  
  .score-card { display: flex; align-items: center; gap: 40px; padding: 40px; background: white; border-radius: 24px; margin-bottom: 32px; box-shadow: 0 8px 30px rgba(0,0,0,0.1); }
  .score-circle { position: relative; width: 150px; height: 150px; }
  .score-circle svg { transform: rotate(-90deg); width: 100%; height: 100%; }
  .circle-bg { fill: none; stroke: #e0e0e0; stroke-width: 3; }
  .circle-progress { fill: none; stroke: url(#grad); stroke-width: 3; stroke-linecap: round; transition: stroke-dasharray 1s ease; }
  .score-value { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 32px; font-weight: bold; color: #667eea; }
  .score-details { flex: 1; }
  .score-main { font-size: 48px; font-weight: bold; color: #333; margin-bottom: 8px; }
  .score-main span { font-size: 24px; color: #999; font-weight: 400; }
  .score-break { display: flex; gap: 24px; font-size: 16px; color: #666; }
  .score-break div { display: flex; align-items: center; gap: 8px; }
  
  .results-list h3 { margin-bottom: 20px; color: #333; font-size: 20px; }
  .result-item { padding: 20px; margin-bottom: 12px; border-radius: 16px; border-left: 4px solid; animation: slideIn 0.4s ease; }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
  .result-item.correct { background: #e8f5e9; border-left-color: #4caf50; }
  .result-item.wrong { background: #ffebee; border-left-color: #f44336; }
  .result-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .r-num { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: #f0f0f0; border-radius: 8px; font-weight: bold; font-size: 14px; }
  .r-badge { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: bold; }
  .correct .r-badge { background: #4caf50; color: white; }
  .wrong .r-badge { background: #f44336; color: white; }
  .r-text { font-weight: 500; margin-bottom: 12px; color: #333; }
  .r-answers { font-size: 14px; display: flex; flex-direction: column; gap: 4px; }
  .yours { color: #666; }
  .correct .r-answers .correct { color: #4caf50; font-weight: 600; }
  
  /* Notification */
  .notification { position: fixed; top: 24px; right: 24px; padding: 16px 24px; background: white; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 12px; transform: translateX(400px); transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 1001; }
  .notification.show { transform: translateX(0); }
  .notification .icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: bold; }
  .notification.success .icon { background: #e8f5e9; color: #4caf50; }
  .notification.error .icon { background: #ffebee; color: #f44336; }
  .notification.warning .icon { background: #fff3e0; color: #ff9800; }
  
  /* Top bar */
  .top-bar { position: fixed; top: 0; left: 300px; right: 0; height: 60px; background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: flex-end; padding: 0 32px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); z-index: 40; }
  #userEmail { color: #666; font-size: 14px; }
  #logoutBtn { margin-left: 16px; padding: 8px 16px; border: none; border-radius: 8px; background: #f44336; color: white; cursor: pointer; font-size: 14px; }
  
  /* SVG gradient */
  .score-circle defs { position: absolute; }
`;
document.head.appendChild(css);

// Добавляем SVG gradient для кругового прогресса
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("width", "0");
svg.setAttribute("height", "0");
svg.innerHTML = `
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
`;
document.body.appendChild(svg);
