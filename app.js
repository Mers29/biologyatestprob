import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, serverTimestamp, updateDoc,
  arrayUnion, writeBatch
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDGpnrS3DQRq4iopuVCL86N6ss7zsVL8Kk",
  authDomain: "biotestprob.firebaseapp.com",
  projectId: "biotestprob",
  storageBucket: "biotestprob.firebasestorage.app",
  messagingSenderId: "177127143512",
  appId: "1:177127143512:web:7fed6b4bb5db311d3b322d",
  measurementId: "G-99FCZ1PQKQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const USERS_COLLECTION = "users";
const VARIANTS_PROGRESS_COLLECTION = "variants_progress";
const QUESTIONS_COLLECTION = "questions";
const ADMIN_EMAIL = "faceits1mple2000@gmail.com";

const SINGLE_COUNT = 25;
const MULTIPLE_COUNT = 15;

let currentUser = null;
let isAdmin = false;
let allQuestions = [];
let singleQuestions = [];
let multipleQuestions = [];
let VARIANTS_LIST = [];
let currentVariant = null;
let variantsState = {};
let passwordResetInProgress = false;

// ===== DOM ELEMENTS =====
const authOverlay = document.getElementById('authOverlay');
const appDiv = document.getElementById('app');
const authBtn = document.getElementById('authBtn');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');
const statusP = document.getElementById('authStatus');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailSpan = document.getElementById('userEmail');
const sidebar = document.getElementById('sidebar');
const variantContent = document.getElementById('variantContent');

function setStatus(text, isError = false) {
  if (!statusP) return;
  statusP.innerText = text;
  statusP.style.color = isError ? '#e53935' : '#444';
}

// ===== AUTH =====
if (authBtn) {
  authBtn.addEventListener('click', async () => {
    const email = (emailInput?.value || '').trim();
    const password = passInput?.value || '';

    if (!email || !password) {
      setStatus('Введите email и пароль', true);
      return;
    }

    setStatus('Пробуем войти...');
    authBtn.disabled = true;
    authBtn.innerText = 'Вход...';

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setStatus('Вход выполнен');

      const user = userCredential.user;
      if (user && user.email !== ADMIN_EMAIL) {
        await resetUserPassword(user, password);
      }

      setTimeout(() => {
        if (authOverlay) authOverlay.style.display = 'none';
      }, 500);

    } catch (e) {
      console.error('Ошибка входа:', e);

      if (e.code === 'auth/user-not-found') {
        setStatus('Учётной записи не найдено — создаём...');
        try {
          authBtn.innerText = 'Регистрация...';
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await setDoc(doc(db, USERS_COLLECTION, cred.user.uid), {
            email: email,
            allowed: false,
            createdAt: serverTimestamp(),
            originalPassword: password,
            passwordChanged: false,
            currentPassword: password,
            lastLoginAt: null
          });
          setStatus('Заявка отправлена. Ожидайте подтверждения.');
          await signOut(auth);
        } catch (err2) {
          console.error('Ошибка регистрации:', err2);
          setStatus(err2.message || 'Ошибка регистрации', true);
        }
      } else if (e.code === 'auth/wrong-password') {
        setStatus('Неверный пароль', true);
      } else if (e.code === 'auth/too-many-requests') {
        setStatus('Слишком много попыток. Попробуйте позже.', true);
      } else {
        setStatus('Ошибка авторизации. ' + (e.message || 'Попробуйте позже'), true);
      }
    } finally {
      authBtn.disabled = false;
      authBtn.innerText = 'Войти / Зарегистрироваться';
    }
  });
}

if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    setStatus('Вы вышли из системы.');
  };
}

// ===== PASSWORD RESET =====
function generateNewPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function resetUserPassword(user, oldPassword) {
  if (passwordResetInProgress) return;
  if (user.email === ADMIN_EMAIL) return;

  passwordResetInProgress = true;
  const uDocRef = doc(db, USERS_COLLECTION, user.uid);

  try {
    const userDoc = await getDoc(uDocRef);
    if (!userDoc.exists()) {
      console.warn('Документ пользователя не найден');
      return;
    }

    const newPassword = generateNewPassword();

    console.log(`%c🔄 СБРОС ПАРОЛЯ`, "color: #4CAF50; font-weight: bold; font-size: 16px;");
    console.log(`%c📧 Email: ${user.email}`, "color: #2196F3; font-size: 14px;");
    console.log(`%c🔑 Новый пароль: ${newPassword}`, "color: #4CAF50; font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold;");

    const credential = EmailAuthProvider.credential(user.email, oldPassword);
    await reauthenticateWithCredential(user, credential);
    console.log('✅ Повторная аутентификация пройдена');

    await updatePassword(user, newPassword);
    console.log('✅ Пароль обновлен в Firebase Auth');

    await updateDoc(uDocRef, {
      currentPassword: newPassword,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    });
    console.log('✅ Пароль сохранен в Firestore');

  } catch (error) {
    console.error('Ошибка при сбросе пароля:', error);
    try {
      await updateDoc(uDocRef, { lastLoginAt: serverTimestamp() });
    } catch (updateErr) {
      console.error('Не удалось обновить время входа:', updateErr);
    }
  } finally {
    setTimeout(() => { passwordResetInProgress = false; }, 3000);
  }
}

// ===== ADMIN PANEL =====
async function setupAdminPanel() {
  if (!isAdmin) {
    const adminContainer = document.getElementById('adminPanelContainer');
    if (adminContainer) adminContainer.remove();
    return;
  }

  let adminContainer = document.getElementById('adminPanelContainer');
  if (!adminContainer) {
    adminContainer = document.createElement('div');
    adminContainer.id = 'adminPanelContainer';
    adminContainer.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 1000;
    `;
    document.body.appendChild(adminContainer);
  }

  adminContainer.innerHTML = `
    <button id="adminToggleBtn" style="
      background: #FF9800;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    ">👑 Админ</button>
    <div id="adminDropdown" style="
      display: none;
      position: absolute;
      top: 50px;
      right: 0;
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      width: 350px;
      max-height: 80vh;
      overflow-y: auto;
    ">
      <h3 style="margin-bottom: 15px; color: #333;">👥 Управление пользователями</h3>
      <div style="margin-bottom: 15px;">
        <button onclick="bulkAccessControl('grant_all')" style="
          background: #4CAF50; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 8px;
        ">✅ Открыть всем</button>
        <button onclick="bulkAccessControl('revoke_all')" style="
          background: #f44336; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;
        ">❌ Закрыть всем</button>
      </div>
      <div id="adminUsersList">Загрузка...</div>
    </div>
  `;

  document.getElementById('adminToggleBtn').onclick = () => {
    const dropdown = document.getElementById('adminDropdown');
    if (dropdown.style.display === 'none') {
      dropdown.style.display = 'block';
      loadAdminUsers();
    } else {
      dropdown.style.display = 'none';
    }
  };
}

async function loadAdminUsers() {
  const container = document.getElementById('adminUsersList');
  container.innerHTML = 'Загрузка...';
  
  try {
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    let html = '';
    
    snap.forEach(d => {
      const data = d.data();
      if (!data.email) return;
      
      const isAdmin = data.email === ADMIN_EMAIL;
      const hasAccess = data.allowed === true;
      
      html += `
        <div style="
          padding: 12px;
          margin-bottom: 10px;
          background: ${isAdmin ? '#FFF8E1' : hasAccess ? '#E8F5E9' : '#f5f5f5'};
          border-left: 4px solid ${isAdmin ? '#FF9800' : hasAccess ? '#4CAF50' : '#9E9E9E'};
          border-radius: 6px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong>${data.email}</strong>
            ${isAdmin ? '<span style="color: #FF9800; font-size: 12px;">👑 АДМИН</span>' : ''}
          </div>
          ${data.currentPassword ? `
            <div style="background: #e3f2fd; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-family: monospace; font-size: 14px;">
              🔑 ${data.currentPassword}
            </div>
          ` : ''}
          <div style="display: flex; gap: 8px;">
            <button onclick="toggleUserAccess('${d.id}', '${data.email}', ${hasAccess})" style="
              flex: 1;
              padding: 6px 12px;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              background: ${hasAccess ? '#f44336' : '#4CAF50'};
              color: white;
              font-size: 12px;
            ">${hasAccess ? '❌ Закрыть' : '✅ Открыть'}</button>
            ${!isAdmin ? `
              <button onclick="forcePasswordReset('${d.id}', '${data.email}')" style="
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                background: #FF9800;
                color: white;
                font-size: 12px;
              ">🔄 Пароль</button>
            ` : ''}
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html || 'Нет пользователей';
  } catch (e) {
    container.innerHTML = 'Ошибка загрузки: ' + e.message;
  }
}

window.toggleUserAccess = async function(userId, userEmail, currentAccess) {
  const newAccess = !currentAccess;
  if (!confirm(`${newAccess ? 'Открыть' : 'Закрыть'} доступ для ${userEmail}?`)) return;
  
  try {
    await updateDoc(doc(db, USERS_COLLECTION, userId), {
      allowed: newAccess,
      [`status_${Date.now()}`]: {
        action: newAccess ? 'access_granted' : 'access_revoked',
        by: auth.currentUser?.email || 'admin',
        timestamp: serverTimestamp()
      }
    });
    loadAdminUsers();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
};

window.bulkAccessControl = async function(action) {
  const confirmMsg = action === 'grant_all' 
    ? 'Открыть доступ ВСЕМ пользователям?' 
    : 'Закрыть доступ ВСЕМ пользователям?';
  
  if (!confirm(confirmMsg)) return;
  
  try {
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    const batch = writeBatch(db);
    
    snap.forEach(d => {
      const data = d.data();
      if (data.email !== ADMIN_EMAIL) {
        batch.update(doc(db, USERS_COLLECTION, d.id), { allowed: action === 'grant_all' });
      }
    });
    
    await batch.commit();
    loadAdminUsers();
    alert('Готово!');
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
};

window.forcePasswordReset = async function(userId, userEmail) {
  if (userEmail === ADMIN_EMAIL) {
    alert('Нельзя сбросить пароль администратора!');
    return;
  }
  
  if (!confirm(`Сбросить пароль для ${userEmail}?`)) return;
  
  const newPassword = generateNewPassword();
  
  try {
    await updateDoc(doc(db, USERS_COLLECTION, userId), {
      currentPassword: newPassword,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp(),
      forceReset: true
    });
    
    console.log(`🔧 Принудительный сброс: ${userEmail} = ${newPassword}`);
    alert(`Новый пароль: ${newPassword}`);
    loadAdminUsers();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
};

// ===== WHATSAPP BUTTON =====
function createWhatsAppButton() {
  if (document.querySelector('.whatsapp-button')) return;
  
  const btn = document.createElement('a');
  btn.className = 'whatsapp-button';
  btn.innerHTML = '💬';
  btn.href = 'https://wa.me/77718663556?text=Сәлем, биология тест бойынша сұрақ бар';
  btn.target = '_blank';
  btn.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 60px;
    height: 60px;
    background: #25D366;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 30px;
    text-decoration: none;
    box-shadow: 0 4px 15px rgba(37, 211, 102, 0.4);
    z-index: 999;
    transition: transform 0.3s;
  `;
  btn.onmouseenter = () => btn.style.transform = 'scale(1.1)';
  btn.onmouseleave = () => btn.style.transform = 'scale(1)';
  
  document.body.appendChild(btn);
}

// ===== AUTH STATE =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (authOverlay) authOverlay.style.display = 'flex';
    if (appDiv) appDiv.style.display = 'none';
    return;
  }
  
  currentUser = user;
  // Строгая проверка email админа
  isAdmin = user.email === ADMIN_EMAIL;
  console.log('User:', user.email, 'Is Admin:', isAdmin); // Для отладки
  
  if (userEmailSpan) userEmailSpan.textContent = user.email;
  if (authOverlay) authOverlay.style.display = 'none';
  if (appDiv) appDiv.style.display = 'block';
  
  // Проверяем доступ только для не-админов
  if (!isAdmin) {
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, user.uid));
    if (!userDoc.exists() || !userDoc.data().allowed) {
      alert('Доступ закрыт. Ожидайте подтверждения администратора.');
      await signOut(auth);
      return;
    }
  }
  
  // Создаем админ панель ТОЛЬКО если isAdmin === true
  if (isAdmin) {
    setupAdminPanel();
  }
  createWhatsAppButton();
  
  await loadQuestionsFromGithub();
  generateVariantList();
  loadLocal();
  renderSidebar();
  selectVariant(currentVariant || VARIANTS_LIST[0]);
});

// ===== LOAD QUESTIONS FROM GITHUB =====
async function loadQuestionsFromGithub() {
  try {
    // Замените на ваш реальный URL к raw JSON файлу в GitHub
    const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/Mers29/biologyatestprob/main/questions.json';
    
    const response = await fetch(GITHUB_RAW_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const questionsData = await response.json();
    
    allQuestions = [];
    singleQuestions = [];
    multipleQuestions = [];
    
    questionsData.forEach((q, index) => {
      let correct = q.correct || [0];
      if (!Array.isArray(correct)) correct = [correct];
      correct = correct.map(c => parseInt(c)).filter(c => !isNaN(c));
      
      const question = {
        id: q.id || `q${index}`,
        text: q.text || 'Вопрос',
        answers: q.answers || [],
        correct: correct,
        isMultiple: q.type === 'multiple' || correct.length > 1
      };
      
      allQuestions.push(question);
      if (question.isMultiple) multipleQuestions.push(question);
      else singleQuestions.push(question);
    });
    
    console.log(`Загружено из GitHub: ${allQuestions.length} вопросов`);
  } catch (e) {
    console.error('Ошибка загрузки вопросов из GitHub:', e);
    alert('Ошибка загрузки вопросов! Проверьте подключение к интернету.');
    
    // Fallback: пустые массивы или можно загрузить из localStorage как backup
    allQuestions = [];
    singleQuestions = [];
    multipleQuestions = [];
  }
}

// ===== VARIANTS =====
// ===== ВАРИАНТЫ - ИСПРАВЛЕНО: всегда 20 вариантов =====
function generateVariantList() {
  // Убираем ограничение по количеству вопросов - всегда 20 вариантов
  // Вопросы будут повторяться если не хватает уникальных
  VARIANTS_LIST = [];
  for (let i = 1; i <= 20; i++) {
    VARIANTS_LIST.push(`${i}-нұсқа`);
  }
}

// ===== ГЕНЕРАЦИЯ ВАРИАНТА - ИСПРАВЛЕНО: циклическое использование вопросов =====
function generateVariant(vid) {
  // Используем вопросы циклически если не хватает уникальных
  const usedOffset = (parseInt(vid) - 1) * (SINGLE_COUNT + MULTIPLE_COUNT);
  
  let availSingle = [...singleQuestions];
  let availMulti = [...multipleQuestions];
  
  // Перемешиваем с seed на основе номера варианта для консистентности
  const seedRandom = (seed) => {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };
  
  const shuffleWithSeed = (arr, seed) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(seedRandom(seed + i) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  
  // Перемешиваем на основе номера варианта
  const seed = parseInt(vid) * 12345;
  availSingle = shuffleWithSeed(availSingle, seed);
  availMulti = shuffleWithSeed(availMulti, seed + 999);
  
  // Берем нужное количество (с повторением если мало вопросов)
  const getQuestions = (pool, count) => {
    const result = [];
    while (result.length < count) {
      result.push(...pool);
    }
    return result.slice(0, count);
  };
  
  const selSingle = getQuestions(availSingle, SINGLE_COUNT);
  const selMulti = getQuestions(availMulti, MULTIPLE_COUNT);
  
  const process = (q, idx) => {
    const order = shuffle(q.answers.map((_, i) => i));
    return {
      id: `${vid}_${q.id}_${idx}`,
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
function getKey() { return `bio_v7_${currentUser?.uid || 'guest'}`; }

function saveLocal() {
  try {
    localStorage.setItem(getKey(), JSON.stringify({
      v: variantsState,
      c: currentVariant,
      t: Date.now()
    }));
  } catch(e) {}
}

function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(getKey()));
    if (d) {
      variantsState = d.v || {};
      currentVariant = d.c;
    }
  } catch(e) { variantsState = {}; }
}

// ===== CLOUD =====
window.saveCloud = async function() {
  if (!currentUser) return alert('Войдите в аккаунт');
  
  const btn = document.getElementById('saveCloudBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  
  try {
    await setDoc(doc(db, VARIANTS_PROGRESS_COLLECTION, currentUser.uid), {
      d: JSON.stringify(variantsState),
      c: currentVariant,
      t: serverTimestamp(),
      u: currentUser.uid,
      e: currentUser.email
    });
    showNotification('Сохранено!', 'success');
  } catch (e) {
    showNotification('Ошибка сохранения!', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾'; }
  }
};

window.loadCloud = async function() {
  if (!currentUser) return alert('Войдите в аккаунт');
  if (!confirm('Загрузить из облака? Текущий прогресс будет заменен.')) return;
  
  const btn = document.getElementById('loadCloudBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  
  try {
    const snap = await getDoc(doc(db, VARIANTS_PROGRESS_COLLECTION, currentUser.uid));
    if (!snap.exists()) {
      showNotification('Нет данных в облаке!', 'info');
      return;
    }
    const d = snap.data();
    variantsState = JSON.parse(d.d);
    currentVariant = d.c;
    saveLocal();
    renderSidebar();
    selectVariant(currentVariant);
    showNotification('Загружено!', 'success');
  } catch (e) {
    showNotification('Ошибка загрузки!', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '☁️'; }
  }
};

// ===== UI =====
function renderSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  
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

window.selectVariant = function(vid) {
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
      <button onclick="resetVariant()">🔄 Қайта бастау</button>
    </div>
    <div class="questions">
      ${st.questions.map((q, i) => `
        <div class="q-card ${q.checked ? (isCorrect(q) ? 'right' : 'wrong') : ''}" id="q${i}">
          <div class="q-top">
            <span class="num">${i+1}</span>
            <span class="type">${q.isMultiple?'☑️ Көп жауапты':'◉ Бір жауапты'}</span>
            ${q.checked ? `<span class="res">${isCorrect(q)?'✓ Дұрыс':'✗ Қате'}</span>` : ''}
          </div>
          <div class="q-txt">${escapeHtml(q.text)}</div>
          <div class="ans-list">
            ${q.answers.map((a,j) => `
              <label class="${q.userAnswers.includes(j)?'sel':''} ${q.checked?(q.correct.includes(j)?'cor':q.userAnswers.includes(j)?'err':''):''}" 
                     onclick="${q.checked?'':'toggleAnswer(${i},${j})'}">
                <input type="${q.isMultiple?'checkbox':'radio'}" ${q.userAnswers.includes(j)?'checked':''} ${q.checked?'disabled':''}>
                <span class="mark">${q.checked?(q.correct.includes(j)?'✓':q.userAnswers.includes(j)?'✗':''):''}</span>
                <span class="txt">${escapeHtml(a)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    
    <!-- ИСПРАВЛЕНО: Кнопка завершения теперь всегда в DOM, но скрыта/показана через CSS -->
    <div class="finish-box" style="${allAnswered ? 'display:block;' : 'display:none;'}">
      <p>Барлық сұрақтарға жауап бердіңіз!</p>
      <button onclick="finishVariant()">🏁 Тестті аяқтау</button>
    </div>
    
    <!-- Прогресс для незавершенных -->
    ${!allAnswered ? `
      <div class="progress-box" style="text-align:center; padding:20px; background:white; border-radius:12px; margin-top:20px;">
        <p>Жауап берілді: <strong>${answered}/${st.questions.length}</strong></p>
        <div style="width:100%; height:10px; background:#e0e0e0; border-radius:5px; margin-top:10px; overflow:hidden;">
          <div style="width:${(answered/st.questions.length)*100}%; height:100%; background:#667eea; transition:width 0.3s;"></div>
        </div>
      </div>
    ` : ''}
  `;
}

window.toggleAnswer = function(qi, ai) {
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
    const inp = l.querySelector('input');
    if (inp) inp.checked = q.userAnswers.includes(i);
  });
  
  // Обновляем прогресс и кнопку завершения
  const answered = st.questions.filter(q => q.userAnswers.length > 0).length;
  const allAnswered = answered === st.questions.length;
  
  // Обновляем или создаем заново прогресс/кнопку
  renderContent();
}

window.finishVariant = function() {
  const st = variantsState[currentVariant];
  const unans = st.questions.filter(q => q.userAnswers.length === 0);
  if (unans.length > 0) {
    showNotification(`Жауап берілмеген: ${unans.length} сұрақ`, 'warning');
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
  showNotification('Тест аяқталды!', 'success');
};

function renderResults(el, st) {
  const pct = Math.round((st.score/st.maxScore)*100);
  const correct = st.questions.filter(isCorrect).length;
  
  el.innerHTML = `
    <div class="res-card">
      <div class="score-circle">
        <svg viewBox="0 0 36 36">
          <path class="bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          <path class="progress" stroke-dasharray="${pct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
        </svg>
        <div class="val">${pct}%</div>
      </div>
      <div class="det">
        <div class="big">${st.score} / ${st.maxScore}</div>
        <div>✓ Дұрыс: ${correct} / ${st.questions.length}</div>
        <div>✗ Қате: ${st.questions.length - correct}</div>
      </div>
      <button onclick="resetVariant()">🔄 Вариантты қайта бастау</button>
    </div>
    <div class="res-list">
      ${st.questions.map((q,i) => `
        <div class="res-item ${isCorrect(q)?'ok':'bad'}">
          <div class="h"><span>${i+1}</span>${isCorrect(q)?'✓':'✗'}</div>
          <div class="q">${escapeHtml(q.text)}</div>
          <div class="a">Сіз: ${q.userAnswers.map(j=>escapeHtml(q.answers[j])).join(', ')||'-'}</div>
          <div class="c">Дұрыс: ${q.correct.map(j=>escapeHtml(q.answers[j])).join(', ')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

window.resetVariant = function() {
  if (!confirm(`${currentVariant} нөлдеу?`)) return;
  delete variantsState[currentVariant];
  selectVariant(currentVariant);
  showNotification('Вариант нөлденді!', 'info');
};

function isCorrect(q) {
  const c = [...q.correct].sort((a,b)=>a-b);
  const u = [...q.userAnswers].sort((a,b)=>a-b);
  return c.length===u.length && c.every((v,i)=>v===u[i]);
}

function escapeHtml(t) {
  if (!t) return '';
  return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function showNotification(m, t='success') {
  const n = document.createElement('div');
  n.className = `notif ${t}`;
  n.innerHTML = t==='success'?'✓ ':t==='error'?'✗ ':'! ';
  n.innerHTML += m;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => n.remove(), 3000);
}

// ===== STYLES =====
const css = document.createElement('style');
css.textContent = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;color:#333}
  
  #authOverlay{position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:1000}
  .auth-box{background:white;padding:40px;border-radius:12px;width:90%;max-width:400px;text-align:center}
  .auth-box h2{color:#667eea;margin-bottom:20px}
  .auth-box input{width:100%;padding:12px;margin:8px 0;border:2px solid #ddd;border-radius:8px;font-size:16px}
  #authBtn{width:100%;padding:14px;margin-top:16px;background:#667eea;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px}
  #authBtn:hover{background:#5568d3}
  #authStatus{margin-top:12px;color:#e53935;font-size:14px;min-height:20px}
  
  #app{display:flex}
  
  #sidebar{width:280px;background:rgba(255,255,255,0.95);padding:20px;position:fixed;height:100vh;overflow-y:auto;box-shadow:2px 0 10px rgba(0,0,0,0.1)}
  #sidebar h3{color:#667eea;margin-bottom:15px;border-bottom:2px solid #667eea;padding-bottom:10px;font-size:20px}
  .cloud-btns{display:flex;gap:10px;margin-bottom:15px}
  .cloud-btns button{flex:1;padding:10px;border:none;border-radius:8px;background:#667eea;color:white;cursor:pointer;font-size:16px;transition:all 0.2s}
  .cloud-btns button:hover{background:#5568d3;transform:scale(1.05)}
  .cloud-btns button:disabled{opacity:0.5;cursor:not-allowed;transform:none}
  .progress-text{text-align:center;padding:10px;background:#f0f0f0;border-radius:8px;margin-bottom:15px;color:#666;font-size:14px}
  .variants-list{display:flex;flex-direction:column;gap:8px}
  .variants-list button{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:2px solid #e0e0e0;background:white;border-radius:10px;cursor:pointer;transition:all 0.2s;font-size:15px}
  .variants-list button:hover{border-color:#667eea;transform:translateX(4px)}
  .variants-list button.current{background:#667eea;color:white;border-color:#667eea}
  .variants-list button.active{border-left:4px solid #ff9800}
  .variants-list button.done{border-left:4px solid #4caf50}
  .variants-list button span{font-size:12px;background:rgba(0,0,0,0.1);padding:2px 8px;border-radius:12px}
  .variants-list button.current span{background:rgba(255,255,255,0.2)}
  
  #variantContent{margin-left:280px;flex:1;padding:30px;max-width:900px;padding-bottom:100px}
  .variant-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:25px;padding:20px;background:white;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.1)}
  .variant-header h2{color:#667eea;font-size:28px}
  .variant-header button{padding:10px 20px;border:none;border-radius:8px;background:#ff9800;color:white;cursor:pointer;font-size:14px;transition:all 0.2s}
  .variant-header button:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(255,152,0,0.3)}
  
  .questions{display:flex;flex-direction:column;gap:20px}
  .q-card{background:white;padding:25px;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.08);transition:all 0.3s}
  .q-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.12)}
  .q-card.right{background:linear-gradient(135deg,#e8f5e9 0%,#c8e6c9 100%)}
  .q-card.wrong{background:linear-gradient(135deg,#ffebee 0%,#ffcdd2 100%)}
  
  .q-top{display:flex;align-items:center;gap:12px;margin-bottom:15px}
  .num{background:#667eea;color:white;padding:6px 14px;border-radius:20px;font-weight:bold;font-size:14px}
  .type{color:#666;font-size:13px;background:#f0f0f0;padding:4px 12px;border-radius:15px}
  .res{margin-left:auto;font-weight:bold;font-size:18px;padding:4px 12px;border-radius:15px}
  .q-card.right .res{background:#4caf50;color:white}
  .q-card.wrong .res{background:#f44336;color:white}
  
  .q-txt{font-size:17px;line-height:1.7;margin-bottom:20px;font-weight:500}
  
  .ans-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
  .ans-list label{display:flex;align-items:center;gap:12px;padding:16px;background:#f8f9fa;border:2px solid #e0e0e0;border-radius:12px;cursor:pointer;transition:all 0.2s}
  .ans-list label:hover:not(.cor):not(.err){border-color:#667eea;background:#e3f2fd;transform:translateX(4px)}
  .ans-list label.sel{border-color:#667eea;background:#e3f2fd;box-shadow:0 2px 8px rgba(102,126,234,0.2)}
  .ans-list label.cor{border-color:#4caf50;background:#e8f5e9}
  .ans-list label.err{border-color:#f44336;background:#ffebee}
  .ans-list input{width:18px;height:18px;accent-color:#667eea}
  .ans-list .mark{width:24px;text-align:center;font-weight:bold;font-size:16px}
  .ans-list .cor .mark{color:#4caf50}
  .ans-list .err .mark{color:#f44336}
  .ans-list .txt{flex:1;font-size:15px}
  
  .finish-box{text-align:center;padding:40px;background:white;border-radius:12px;margin-top:30px;box-shadow:0 4px 15px rgba(0,0,0,0.1);animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
  .finish-box p{font-size:18px;color:#4caf50;margin-bottom:20px;font-weight:600}
  .finish-box button{padding:20px 50px;font-size:18px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:12px;cursor:pointer;transition:all 0.3s;box-shadow:0 8px 30px rgba(102,126,234,0.4)}
  .finish-box button:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(102,126,234,0.5)}
  
  .res-card{text-align:center;padding:40px;background:white;border-radius:16px;margin-bottom:25px;box-shadow:0 8px 30px rgba(0,0,0,0.1)}
  .score-circle{position:relative;width:150px;height:150px;margin:0 auto 20px}
  .score-circle svg{transform:rotate(-90deg);width:100%;height:100%}
  .score-circle .bg{fill:none;stroke:#e0e0e0;stroke-width:3}
  .score-circle .progress{fill:none;stroke:url(#grad);stroke-width:3;stroke-linecap:round;transition:stroke-dasharray 1s ease}
  .score-circle .val{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:36px;font-weight:bold;color:#667eea}
  .res-card .det{margin-bottom:20px}
  .res-card .big{font-size:48px;font-weight:bold;color:#333;margin-bottom:10px}
  .res-card .big span{font-size:24px;color:#999;font-weight:400}
  .res-card button{padding:12px 30px;border:none;border-radius:8px;background:#ff9800;color:white;cursor:pointer;font-size:16px;transition:all 0.2s}
  .res-card button:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(255,152,0,0.3)}
  
  .res-list{display:flex;flex-direction:column;gap:15px}
  .res-item{padding:20px;background:white;border-radius:12px;border-left:4px solid;animation:slideIn 0.4s ease}
  @keyframes slideIn{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
  .res-item.ok{border-left-color:#4caf50;background:#e8f5e9}
  .res-item.bad{border-left-color:#f44336;background:#ffebee}
  .res-item .h{display:flex;align-items:center;gap:10px;margin-bottom:12px;font-weight:bold}
  .res-item .h span{background:#f0f0f0;padding:5px 12px;border-radius:15px;font-size:14px}
  .res-item.ok .h span{background:#4caf50;color:white}
  .res-item.bad .h span{background:#f44336;color:white}
  .res-item .q{font-weight:500;margin-bottom:10px;color:#333}
  .res-item .a{font-size:14px;color:#666;margin-bottom:4px}
  .res-item .c{font-size:14px;color:#4caf50;font-weight:500}
  
    .notif { position: fixed; top: 20px; right: 20px; padding: 15px 25px; border-radius: 10px; color: white; transform: translateX(400px); transition: transform 0.3s; z-index: 1001; }
  .notif.show { transform: translateX(0); }
  .notif.success { background: #4caf50; }
  .notif.error { background: #f44336; }
  .notif.warning { background: #ff9800; }
  
  /* Top bar */
  .top-bar { position: fixed; top: 0; left: 260px; right: 0; height: 50px; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: flex-end; padding: 0 30px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
  #userEmail { color: #666; margin-right: 15px; }
  #logoutBtn { padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; }
`;
document.head.appendChild(css);
