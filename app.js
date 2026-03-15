// app.js - Biology Quiz with Variants System (адаптирован под существующий JSON)
// Строгие требования: 25 single (4 ответа, 1 правильный) + 15 multiple (4+ ответов, 2+ правильных)
// Рандомизация, 1 изображение на вариант, ручное сохранение

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyBtYSlpZ0JHmUDNYCbp5kynR_yifj5y0dY",
  authDomain: "baseforbiotest.firebaseapp.com",
  projectId: "baseforbiotest",
  storageBucket: "baseforbiotest.firebasestorage.app",
  messagingSenderId: "678186767483",
  appId: "1:678186767483:web:ca06fa25c69fab8aa5fede",
  measurementId: "G-Y2WZ1W3SBN"
};

// ===== INIT =====
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===== CONSTANTS =====
const SINGLE_COUNT = 25;
const MULTIPLE_COUNT = 15;
const VARIANTS_LIST = ["1-нұсқа", "2-нұсқа", "3-нұсқа", "4-нұсқа", "5-нұсқа", "6-нұсқа", "7-нұсқа", "8-нұсқа"];

// ===== GLOBAL STATE =====
let currentUser = null;
let allQuestions = []; // Все вопросы из JSON
let singleQuestions = []; // Только single choice (фильтрованные)
let multipleQuestions = []; // Только multiple choice (фильтрованные)
let imageQuestions = []; // Вопросы с изображениями
let currentVariant = null;
let variantsState = {}; // Состояние всех вариантов
let isAdmin = false;

// ===== DOM ELEMENTS =====
const authOverlay = document.getElementById('authOverlay');
const appDiv = document.getElementById('app');
const sidebar = document.getElementById('sidebar');
const variantContent = document.getElementById('variantContent');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');
const authBtn = document.getElementById('authBtn');
const authStatus = document.getElementById('authStatus');
const userEmailSpan = document.getElementById('userEmail');

// ===== AUTH =====
authBtn?.addEventListener('click', async () => {
  const email = emailInput?.value?.trim();
  const password = passInput?.value;
  
  if (!email || !password) {
    authStatus.textContent = 'Email және құпия сөзді енгізіңіз';
    return;
  }
  
  try {
    authBtn.disabled = true;
    authBtn.textContent = 'Кіру...';
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        authStatus.textContent = 'Аккаунт табылмады, тіркелу...';
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        throw e;
      }
    }
  } catch (error) {
    authStatus.textContent = 'Қате: ' + error.message;
    authBtn.disabled = false;
    authBtn.textContent = 'Кіру / Тіркелу';
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    authOverlay.style.display = 'flex';
    appDiv.style.display = 'none';
    return;
  }
  
  currentUser = user;
  userEmailSpan.textContent = user.email;
  isAdmin = user.email === "faceits1mple2000@gmail.com";
  
  authOverlay.style.display = 'none';
  appDiv.style.display = 'block';
  
  // Загружаем и обрабатываем вопросы
  await loadAndProcessQuestions();
  
  // Загружаем локальный прогресс
  loadLocalProgress();
  
  // Рендерим сайдбар
  renderSidebar();
  
  // Выбираем первый вариант или текущий
  if (!currentVariant || !variantsState[currentVariant]) {
    selectVariant(VARIANTS_LIST[0]);
  } else {
    selectVariant(currentVariant);
  }
});

// ===== LOAD & PROCESS QUESTIONS =====
async function loadAndProcessQuestions() {
  try {
    const response = await fetch('questions.json?t=' + Date.now());
    if (!response.ok) throw new Error('Failed to load');
    
    allQuestions = await response.json();
    
    // Фильтруем и валидируем вопросы
    singleQuestions = [];
    multipleQuestions = [];
    imageQuestions = [];
    
    allQuestions.forEach((q, idx) => {
      // Нормализуем correct в массив
      let correct = q.correct;
      if (!Array.isArray(correct)) correct = [correct];
      
      const question = {
        ...q,
        id: q.id || `q_${idx}`,
        correct: correct,
        isMultiple: correct.length > 1
      };
      
      // Проверяем требования
      if (!question.isMultiple && question.answers.length === 4 && correct.length === 1) {
        // Single: ровно 4 ответа, 1 правильный
        singleQuestions.push(question);
      } else if (question.isMultiple && question.answers.length >= 4 && correct.length >= 2) {
        // Multiple: 4+ ответов, 2+ правильных
        multipleQuestions.push(question);
      }
      
      // Собираем вопросы с изображениями
      if (q.image) {
        imageQuestions.push(question);
      }
    });
    
    console.log(`Загружено: ${singleQuestions.length} single, ${multipleQuestions.length} multiple, ${imageQuestions.length} с изображениями`);
    
    // Проверяем достаточность
    if (singleQuestions.length < SINGLE_COUNT * VARIANTS_LIST.length) {
      console.warn(`Мало single вопросов! Нужно: ${SINGLE_COUNT * VARIANTS_LIST.length}, есть: ${singleQuestions.length}`);
    }
    if (multipleQuestions.length < MULTIPLE_COUNT * VARIANTS_LIST.length) {
      console.warn(`Мало multiple вопросов! Нужно: ${MULTIPLE_COUNT * VARIANTS_LIST.length}, есть: ${multipleQuestions.length}`);
    }
    if (imageQuestions.length < VARIANTS_LIST.length) {
      console.warn(`Мало вопросов с изображениями! Нужно: ${VARIANTS_LIST.length}, есть: ${imageQuestions.length}`);
    }
    
  } catch (error) {
    console.error('Error loading questions:', error);
    alert('Сұрақтарды жүктеу қатесі!');
  }
}

// ===== VARIANT GENERATION =====
function generateVariant(variantId) {
  // Проверяем использованные вопросы в других вариантах
  const usedIds = new Set();
  Object.values(variantsState).forEach(v => {
    if (v.questions) {
      v.questions.forEach(q => usedIds.add(q.originalId));
    }
  });
  
  // Фильтруем неиспользованные
  let availableSingle = singleQuestions.filter(q => !usedIds.has(q.id));
  let availableMultiple = multipleQuestions.filter(q => !usedIds.has(q.id));
  let availableImages = imageQuestions.filter(q => !usedIds.has(q.id));
  
  // Если не хватает уникальных - берем из общего пула (с повторениями, но редкими)
  if (availableSingle.length < SINGLE_COUNT) availableSingle = [...singleQuestions];
  if (availableMultiple.length < MULTIPLE_COUNT) availableMultiple = [...multipleQuestions];
  if (availableImages.length < 1) availableImages = [...imageQuestions];
  
  // Перемешиваем
  availableSingle = shuffleArray([...availableSingle]);
  availableMultiple = shuffleArray([...availableMultiple]);
  availableImages = shuffleArray([...availableImages]);
  
  // Выбираем вопросы
  const selectedSingle = availableSingle.slice(0, SINGLE_COUNT);
  const selectedMultiple = availableMultiple.slice(0, MULTIPLE_COUNT);
  
  // Выбираем 1 вопрос с изображением (может быть из single или multiple)
  const imageQuestion = availableImages[0];
  
  // Помечаем, какой вопрос получит изображение
  let imageAdded = false;
  
  // Обрабатываем вопросы: перемешиваем ответы, сохраняем маппинг правильных
  const processQuestion = (q, index, forceImage = false) => {
    const answers = [...q.answers];
    const correct = [...q.correct];
    
    // Перемешиваем ответы
    const order = shuffleArray(answers.map((_, i) => i));
    const shuffledAnswers = order.map(i => answers[i]);
    const shuffledCorrect = correct.map(c => order.indexOf(c));
    
    // Определяем, нужно ли добавить изображение
    let hasImage = false;
    if ((forceImage || q.id === imageQuestion?.id) && !imageAdded) {
      hasImage = true;
      imageAdded = true;
    }
    
    return {
      id: `${variantId}_${q.id}`,
      originalId: q.id,
      text: q.text,
      answers: shuffledAnswers,
      correct: shuffledCorrect,
      image: hasImage ? q.image : null,
      isMultiple: q.isMultiple,
      userAnswers: [],
      checked: false,
      order: order // сохраняем для отладки
    };
  };
  
  // Обрабатываем single (первые 25)
  const finalSingle = selectedSingle.map((q, i) => processQuestion(q, i));
  
  // Обрабатываем multiple (следующие 15), добавляем изображение если еще не добавлено
  let finalMultiple = selectedMultiple.map((q, i) => processQuestion(q, i + SINGLE_COUNT));
  
  // Если изображение еще не добавлено, добавляем в случайный multiple вопрос
  if (!imageAdded && finalMultiple.length > 0) {
    const randomIdx = Math.floor(Math.random() * finalMultiple.length);
    finalMultiple[randomIdx].image = imageQuestion?.image || null;
  }
  
  // Формируем финальную очередь: сначала single, потом multiple
  const allQuestions = [...finalSingle, ...finalMultiple];
  
  return {
    id: variantId,
    questions: allQuestions,
    currentIndex: 0,
    completed: false,
    score: 0,
    maxScore: SINGLE_COUNT * 1 + MULTIPLE_COUNT * 2, // single=1, multiple=2
    lastSaved: null
  };
}

function getStorageKey() {
  return currentUser ? `bio_variants_v3_${currentUser.uid}` : 'bio_variants_v3_guest';
}

function saveLocalProgress() {
  try {
    // Очищаем данные перед сохранением
    const cleanData = {
      variants: {},
      currentVariant: currentVariant,
      timestamp: Date.now()
    };
    
    Object.keys(variantsState).forEach(key => {
      const v = variantsState[key];
      if (!v) return;
      
      cleanData.variants[key] = {
        id: v.id,
        completed: v.completed || false,
        score: v.score || 0,
        maxScore: v.maxScore || 55,
        currentIndex: v.currentIndex || 0,
        questions: v.questions ? v.questions.map(q => ({
          id: q.id,
          originalId: q.originalId,
          text: q.text,
          answers: q.answers,
          correct: q.correct,
          image: q.image || null,
          isMultiple: q.isMultiple,
          userAnswers: q.userAnswers || [],
          checked: q.checked || false,
          score: q.score || 0
        })) : []
      };
    });
    
    localStorage.setItem(getStorageKey(), JSON.stringify(cleanData));
    
    // Показываем тихое уведомление только при явном сохранении
    // showNotification('Жергілікті сақтау сәтті', 'success');
  } catch (e) {
    console.error('Local save error:', e);
  }
}

function loadLocalProgress() {
  try {
    const saved = localStorage.getItem(getStorageKey());
    if (!saved) return;
    
    const data = JSON.parse(saved);
    
    if (data.variants && typeof data.variants === 'object') {
      variantsState = {};
      
      Object.keys(data.variants).forEach(key => {
        const v = data.variants[key];
        variantsState[key] = {
          ...v,
          questions: v.questions ? v.questions.map(q => ({
            ...q,
            correct: Array.isArray(q.correct) ? q.correct : [q.correct],
            userAnswers: q.userAnswers || []
          })) : []
        };
      });
      
      currentVariant = data.currentVariant || null;
    }
  } catch (e) {
    console.error('Local load error:', e);
    variantsState = {};
  }
}

// Сохранение в облако - ТОЛЬКО по кнопке, ВСЁ В ОДНУ СТРОКУ
window.saveToCloud = async function() {
  if (!currentUser) {
    alert('Бұлтқа сақтау үшін кіріңіз');
    return;
  }
  
  const btn = document.getElementById('saveCloudBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '...';
  }
  
  try {
    // Сжимаем всё в одну строку JSON
    const dataToSave = {
      v: currentVariant,  // текущий вариант (короткое имя)
      d: Date.now(),      // timestamp
      // variantsState сжимаем в компактный JSON
      data: JSON.stringify(variantsState)
    };
    
    await setDoc(doc(db, "p", currentUser.uid), dataToSave);
    
    showNotification('✅ Сақталды!', 'success');
    
  } catch (error) {
    console.error('Save error:', error);
    showNotification('❌ Қате!', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💾';
    }
  }
};

// Загрузка из облака
window.loadFromCloud = async function() {
  if (!currentUser) {
    alert('Кіріңіз');
    return;
  }
  
  if (!confirm('Жүктеу?')) return;
  
  const btn = document.getElementById('loadCloudBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '...';
  }
  
  try {
    const docSnap = await getDoc(doc(db, "p", currentUser.uid));
    
    if (!docSnap.exists()) {
      showNotification('Бұлтта жоқ', 'info');
      return;
    }
    
    const doc = docSnap.data();
    
    // Распаковываем из строки
    if (doc.data) {
      variantsState = JSON.parse(doc.data);
      currentVariant = doc.v || VARIANTS_LIST[0];
      
      saveLocalProgress(); // синхронизируем локально
      renderSidebar();
      selectVariant(currentVariant);
      
      showNotification('✅ Жүктелді!', 'success');
    }
    
  } catch (error) {
    console.error('Load error:', error);
    showNotification('❌ Қате!', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '☁️';
    }
  }
};

// ===== UI RENDERING =====
function renderSidebar() {
  if (!sidebar) return;
  
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <h3>Варианттар</h3>
      <div class="sidebar-actions">
        <button onclick="saveToCloud()" id="saveCloudBtn" class="btn-small btn-save">💾</button>
        <button onclick="loadFromCloud()" id="loadCloudBtn" class="btn-small btn-load">☁️</button>
      </div>
    </div>
    <div class="variants-list">
      ${VARIANTS_LIST.map(vid => {
        const state = variantsState[vid];
        let statusClass = '';
        let statusIcon = '';
        
        if (state?.completed) {
          statusClass = 'completed';
          statusIcon = '✓';
        } else if (state?.questions) {
          const answered = state.questions.filter(q => q.checked).length;
          if (answered > 0) {
            statusClass = 'in-progress';
            statusIcon = `${answered}/${state.questions.length}`;
          }
        }
        
        const activeClass = vid === currentVariant ? 'active' : '';
        
        return `
          <button class="variant-btn ${activeClass} ${statusClass}" onclick="selectVariant('${vid}')">
            <span class="variant-name">${vid}</span>
            <span class="variant-status">${statusIcon}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

window.selectVariant = function(variantId) {
  currentVariant = variantId;
  
  // Генерируем если нет
  if (!variantsState[variantId] || !variantsState[variantId].questions) {
    variantsState[variantId] = generateVariant(variantId);
    saveLocalProgress();
  }
  
  renderSidebar();
  renderVariantContent();
  
  // Скролл наверх
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function renderVariantContent() {
  if (!variantContent || !currentVariant) return;
  
  const state = variantsState[currentVariant];
  if (!state?.questions) return;
  
  let html = `
    <div class="variant-header">
      <div class="variant-title">
        <h2>${currentVariant}</h2>
        <div class="variant-stats">
          ${state.completed 
            ? `Балл: <strong>${state.score}/${state.maxScore}</strong> (${Math.round(state.score/state.maxScore*100)}%)`
            : `Жауап берілді: ${state.questions.filter(q => q.checked).length}/${state.questions.length}`
          }
        </div>
      </div>
      <div class="variant-actions">
        <button onclick="resetVariant()" class="btn btn-reset">🔄 Қайта бастау</button>
        ${state.completed ? `<button onclick="showResults()" class="btn btn-primary">📊 Нәтижелер</button>` : ''}
      </div>
    </div>
  `;
  
  if (state.completed) {
    html += renderResults(state);
  } else {
    html += renderQuestions(state);
  }
  
  variantContent.innerHTML = html;
}

function renderQuestions(state) {
  let html = '<div class="questions-container">';
  
  state.questions.forEach((q, index) => {
    const qNum = index + 1;
    const isAnswered = q.checked;
    const isMultiple = q.isMultiple;
    
    html += `
      <div class="question-card ${isAnswered ? 'answered' : ''}" id="q${index}">
        <div class="question-header">
          <span class="q-number">№${qNum}</span>
          <span class="q-type">${isMultiple ? '☑️ Көп жауапты' : '◉ Бір жауапты'}</span>
          ${isAnswered ? `<span class="q-status ${isQuestionCorrect(q) ? 'correct' : 'wrong'}">${isQuestionCorrect(q) ? '✓ Дұрыс' : '✗ Қате'}</span>` : ''}
        </div>
        
        <div class="question-text">${escapeHtml(q.text)}</div>
        
        ${q.image ? `
          <div class="question-image-wrapper">
            <img src="${q.image}" alt="Сурет" class="question-image" onclick="window.open('${q.image}', '_blank')" loading="lazy">
          </div>
        ` : ''}
        
        <div class="answers-grid" data-qindex="${index}">
          ${q.answers.map((ans, ansIdx) => `
            <label class="answer-option ${q.userAnswers.includes(ansIdx) ? 'selected' : ''} 
                   ${isAnswered ? (q.correct.includes(ansIdx) ? 'correct' : (q.userAnswers.includes(ansIdx) ? 'wrong' : '')) : ''}"
                   onclick="${isAnswered ? '' : `toggleAnswer(${index}, ${ansIdx})`}">
              <input type="${isMultiple ? 'checkbox' : 'radio'}" 
                     name="q${index}" 
                     ${q.userAnswers.includes(ansIdx) ? 'checked' : ''}
                     ${isAnswered ? 'disabled' : ''}
                     onclick="event.stopPropagation()">
              <span class="answer-text">${escapeHtml(ans)}</span>
              ${isAnswered ? `<span class="answer-icon">${q.correct.includes(ansIdx) ? '✓' : (q.userAnswers.includes(ansIdx) ? '✗' : '')}</span>` : ''}
            </label>
          `).join('')}
        </div>
        
        ${!isAnswered ? `
          <button onclick="checkAnswer(${index})" class="btn btn-check" id="check-btn-${index}">
            ✓ Тексеру
          </button>
        ` : ''}
      </div>
    `;
  });
  
  // Кнопка завершения (показываем если все отвечены)
  const allAnswered = state.questions.every(q => q.checked);
  if (allAnswered && !state.completed) {
    html += `
      <div class="finish-section">
        <div class="finish-message">Барлық сұрақтарға жауап бердіңіз!</div>
        <button onclick="finishVariant()" class="btn btn-finish">
          🏁 Тестті аяқтау
        </button>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

function renderResults(state) {
  const correctCount = state.questions.filter(q => isQuestionCorrect(q)).length;
  const percentage = Math.round((state.score / state.maxScore) * 100);
  
  let html = `
    <div class="results-container">
      <div class="score-card">
        <div class="score-circle">
          <div class="score-value">${state.score}</div>
          <div class="score-max">/${state.maxScore}</div>
        </div>
        <div class="score-percentage">${percentage}%</div>
        <div class="score-breakdown">
          <div>Дұрыс жауаптар: ${correctCount}/${state.questions.length}</div>
          <div>Single: ${state.questions.slice(0, SINGLE_COUNT).filter(isQuestionCorrect).length}/${SINGLE_COUNT}</div>
          <div>Multiple: ${state.questions.slice(SINGLE_COUNT).filter(isQuestionCorrect).length}/${MULTIPLE_COUNT}</div>
        </div>
      </div>
      
      <div class="results-details">
        <h3>Толық нәтижелер:</h3>
        <div class="results-list">
  `;
  
  state.questions.forEach((q, idx) => {
    const correct = isQuestionCorrect(q);
    html += `
      <div class="result-item ${correct ? 'correct' : 'wrong'}">
        <div class="result-header">
          <span class="result-num">№${idx + 1}</span>
          <span class="result-badge">${correct ? '✓ Дұрыс' : '✗ Қате'}</span>
        </div>
        <div class="result-question">${escapeHtml(q.text)}</div>
        <div class="result-answers">
          <div class="user-answer">Сіз: ${q.userAnswers.length > 0 ? q.userAnswers.map(i => escapeHtml(q.answers[i])).join(', ') : 'Жоқ'}</div>
          <div class="correct-answer">Дұрыс: ${q.correct.map(i => escapeHtml(q.answers[i])).join(', ')}</div>
        </div>
      </div>
    `;
  });
  
  html += '</div></div></div>';
  return html;
}

// ===== ACTIONS =====
window.toggleAnswer = function(qIndex, ansIndex) {
  const state = variantsState[currentVariant];
  const q = state.questions[qIndex];
  
  if (q.checked) return;
  
  if (q.isMultiple) {
    // Multiple: toggle
    if (q.userAnswers.includes(ansIndex)) {
      q.userAnswers = q.userAnswers.filter(i => i !== ansIndex);
    } else {
      q.userAnswers.push(ansIndex);
    }
  } else {
    // Single: replace
    q.userAnswers = [ansIndex];
  }
  
  // Обновляем только эту карточку для производительности
  updateQuestionCard(qIndex);
};

function updateQuestionCard(qIndex) {
  const state = variantsState[currentVariant];
  const q = state.questions[qIndex];
  const card = document.getElementById(`q${qIndex}`);
  if (!card) return;
  
  // Обновляем отображение ответов
  const options = card.querySelectorAll('.answer-option');
  options.forEach((opt, idx) => {
    opt.classList.toggle('selected', q.userAnswers.includes(idx));
    const input = opt.querySelector('input');
    if (input) input.checked = q.userAnswers.includes(idx);
  });
}

window.checkAnswer = function(qIndex) {
  const state = variantsState[currentVariant];
  const q = state.questions[qIndex];
  
  if (q.userAnswers.length === 0) {
    showNotification('Жауапты таңдаңыз!', 'warning');
    return;
  }
  
  q.checked = true;
  
  // Подсчет баллов
  if (isQuestionCorrect(q)) {
    q.score = q.isMultiple ? 2 : 1;
    state.score += q.score;
  } else {
    q.score = 0;
  }
  
  saveLocalProgress();
  renderVariantContent();
  
  // Авто-скролл к следующему
  setTimeout(() => {
    const nextUnanswered = state.questions.findIndex((q, i) => i > qIndex && !q.checked);
    if (nextUnanswered !== -1) {
      document.getElementById(`q${nextUnanswered}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (state.questions.every(q => q.checked)) {
      document.querySelector('.finish-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, 300);
};

window.finishVariant = function() {
  const state = variantsState[currentVariant];
  state.completed = true;
  saveLocalProgress();
  renderVariantContent();
  showNotification('🎉 Тест сәтті аяқталды!', 'success');
};

window.resetVariant = function() {
  if (!confirm(`${currentVariant} вариантын нөлдеуге сенімдісіз бе? Барлық жауаптар жойылады!`)) return;
  
  delete variantsState[currentVariant];
  selectVariant(currentVariant);
  showNotification('Вариант нөлденді', 'info');
};

window.showResults = function() {
  renderVariantContent();
};

// ===== HELPERS =====
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isQuestionCorrect(q) {
  const correct = [...q.correct].sort((a, b) => a - b);
  const user = [...q.userAnswers].sort((a, b) => a - b);
  
  if (user.length !== correct.length) return false;
  return correct.every((c, i) => c === user[i]);
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showNotification(message, type = 'info') {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.textContent = message;
  document.body.appendChild(notif);
  
  setTimeout(() => notif.classList.add('show'), 10);
  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// ===== STYLES =====
const styles = document.createElement('style');
styles.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    color: #333;
    line-height: 1.6;
  }
  
  /* Auth */
  #authOverlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .auth-box {
    background: white;
    padding: 40px;
    border-radius: 16px;
    width: 90%;
    max-width: 400px;
    text-align: center;
  }
  
  .auth-box h2 { margin-bottom: 20px; color: #667eea; }
  .auth-box input {
    width: 100%;
    padding: 12px;
    margin: 8px 0;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 16px;
  }
  .auth-box input:focus { outline: none; border-color: #667eea; }
  .auth-box button {
    width: 100%;
    padding: 14px;
    margin-top: 16px;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.3s;
  }
  .auth-box button:hover { background: #5568d3; transform: translateY(-2px); }
  .auth-box button:disabled { opacity: 0.6; cursor: not-allowed; }
  
  #authStatus { margin-top: 12px; color: #e53935; font-size: 14px; }
  
  /* App Layout */
  #app { display: flex; min-height: 100vh; }
  
  /* Sidebar */
  #sidebar {
    width: 280px;
    background: rgba(255,255,255,0.98);
    padding: 20px;
    position: fixed;
    height: 100vh;
    overflow-y: auto;
    box-shadow: 2px 0 20px rgba(0,0,0,0.1);
    z-index: 100;
  }
  
  .sidebar-header {
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid #e0e0e0;
  }
  
  .sidebar-header h3 {
    color: #667eea;
    font-size: 1.3em;
    margin-bottom: 10px;
  }
  
  .sidebar-actions {
    display: flex;
    gap: 8px;
  }
  
  .btn-small {
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }
  .btn-save { background: #4caf50; color: white; }
  .btn-load { background: #2196f3; color: white; }
  .btn-small:hover { opacity: 0.9; transform: scale(1.05); }
  .btn-small:disabled { opacity: 0.5; cursor: not-allowed; }
  
  .variants-list { display: flex; flex-direction: column; gap: 8px; }
  
  .variant-btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    background: white;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }
  
  .variant-btn:hover {
    border-color: #667eea;
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(102,126,234,0.2);
  }
  
  .variant-btn.active {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }
  
  .variant-btn.in-progress { border-left: 4px solid #ff9800; }
  .variant-btn.completed { border-left: 4px solid #4caf50; }
  
  .variant-status {
    font-size: 12px;
    background: rgba(0,0,0,0.1);
    padding: 2px 8px;
    border-radius: 12px;
  }
  
  /* Main Content */
  #variantContent {
    margin-left: 280px;
    flex: 1;
    padding: 30px;
    max-width: 900px;
  }
  
  .variant-header {
    background: white;
    padding: 24px;
    border-radius: 16px;
    margin-bottom: 24px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }
  
  .variant-title h2 {
    color: #667eea;
    font-size: 1.8em;
    margin-bottom: 8px;
  }
  
  .variant-stats {
    color: #666;
    font-size: 1.1em;
  }
  
  .variant-actions { display: flex; gap: 12px; }
  
  .btn {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  
  .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
  .btn:active { transform: translateY(0); }
  
  .btn-reset { background: #ff9800; color: white; }
  .btn-primary { background: #2196f3; color: white; }
  .btn-check { 
    background: #667eea; 
    color: white; 
    width: 100%; 
    margin-top: 16px;
    justify-content: center;
  }
  .btn-finish {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 18px;
    padding: 16px 40px;
  }
  
  /* Questions */
  .questions-container { display: flex; flex-direction: column; gap: 24px; }
  
  .question-card {
    background: white;
    border-radius: 16px;
    padding: 28px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    transition: all 0.3s;
  }
  
  .question-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.12); }
  .question-card.answered { opacity: 0.95; }
  
  .question-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  
  .q-number {
    background: #667eea;
    color: white;
    padding: 6px 14px;
    border-radius: 20px;
    font-weight: bold;
    font-size: 14px;
  }
  
  .q-type {
    background: #f0f0f0;
    padding: 4px 12px;
    border-radius: 15px;
    font-size: 13px;
    color: #666;
  }
  
  .q-status {
    margin-left: auto;
    padding: 4px 12px;
    border-radius: 15px;
    font-size: 13px;
    font-weight: bold;
  }
  .q-status.correct { background: #e8f5e9; color: #2e7d32; }
  .q-status.wrong { background: #ffebee; color: #c62828; }
  
  .question-text {
    font-size: 1.15em;
    line-height: 1.7;
    margin-bottom: 20px;
    color: #333;
    font-weight: 500;
  }
  
  .question-image-wrapper {
    margin: 20px 0;
    text-align: center;
    border-radius: 12px;
    overflow: hidden;
    background: #f5f5f5;
  }
  
  .question-image {
    max-width: 100%;
    max-height: 400px;
    cursor: zoom-in;
    transition: transform 0.3s;
    display: block;
    margin: 0 auto;
  }
  .question-image:hover { transform: scale(1.02); }
  
  .answers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 12px;
  }
  
  .answer-option {
    display: flex;
    align-items: center;
    padding: 16px;
    background: #f8f9fa;
    border: 2px solid #e9ecef;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    gap: 12px;
  }
  
  .answer-option:hover:not(.correct):not(.wrong) {
    background: #e3f2fd;
    border-color: #2196f3;
    transform: translateX(4px);
  }
  
  .answer-option.selected {
    background: #e3f2fd;
    border-color: #2196f3;
    box-shadow: 0 2px 8px rgba(33,150,243,0.2);
  }
  
  .answer-option.correct {
    background: #e8f5e9;
    border-color: #4caf50;
    color: #2e7d32;
  }
  
  .answer-option.wrong {
    background: #ffebee;
    border-color: #f44336;
    color: #c62828;
  }
  
  .answer-option input {
    width: 18px;
    height: 18px;
    accent-color: #667eea;
  }
  
  .answer-text { flex: 1; font-size: 15px; }
  .answer-icon { font-weight: bold; font-size: 16px; }
  
  /* Finish Section */
  .finish-section {
    background: white;
    padding: 40px;
    border-radius: 16px;
    text-align: center;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    margin-top: 20px;
  }
  
  .finish-message {
    font-size: 1.3em;
    color: #4caf50;
    margin-bottom: 20px;
    font-weight: 600;
  }
  
  /* Results */
  .results-container { animation: fadeIn 0.5s; }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .score-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    margin-bottom: 30px;
    box-shadow: 0 10px 30px rgba(102,126,234,0.3);
  }
  
  .score-circle {
    width: 140px;
    height: 140px;
    border: 6px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    margin: 0 auto 20px;
  }
  
  .score-value { font-size: 48px; font-weight: bold; }
  .score-max { font-size: 24px; opacity: 0.8; }
  .score-percentage { font-size: 36px; font-weight: bold; margin-bottom: 16px; }
  .score-breakdown { opacity: 0.9; font-size: 16px; line-height: 1.8; }
  
  .results-details h3 {
    color: #667eea;
    margin-bottom: 20px;
    font-size: 1.4em;
  }
  
  .results-list { display: flex; flex-direction: column; gap: 12px; }
  
  .result-item {
    background: white;
    padding: 20px;
    border-radius: 12px;
    border-left: 4px solid;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  
  .result-item.correct { border-left-color: #4caf50; }
  .result-item.wrong { border-left-color: #f44336; }
  
  .result-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    align-items: center;
  }
  
  .result-num {
    background: #f0f0f0;
    padding: 4px 12px;
    border-radius: 15px;
    font-size: 13px;
    font-weight: bold;
  }
  
  .result-badge {
    padding: 4px 12px;
    border-radius: 15px;
    font-size: 13px;
    font-weight: bold;
  }
  .result-item.correct .result-badge { background: #e8f5e9; color: #2e7d32; }
  .result-item.wrong .result-badge { background: #ffebee; color: #c62828; }
  
  .result-question { font-weight: 600; margin-bottom: 12px; color: #333; }
  .result-answers { font-size: 14px; color: #666; display: flex; flex-direction: column; gap: 4px; }
  .user-answer { color: #666; }
  .correct-answer { color: #4caf50; font-weight: 500; }
  
  /* Notification */
  .notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    border-radius: 12px;
    color: white;
    font-weight: 600;
    transform: translateX(400px);
    transition: transform 0.3s;
    z-index: 1001;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  }
  .notification.show { transform: translateX(0); }
  .notification.success { background: #4caf50; }
  .notification.error { background: #f44336; }
  .notification.warning { background: #ff9800; }
  .notification.info { background: #2196f3; }
  
  /* Top bar */
  .top-bar {
    position: fixed;
    top: 0;
    right: 0;
    left: 280px;
    background: rgba(255,255,255,0.95);
    padding: 12px 30px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 99;
    backdrop-filter: blur(10px);
  }
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  
  #logoutBtn {
    background: #f44336;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }
  
  /* Responsive */
  @media (max-width: 768px) {
    #sidebar {
      width: 100%;
      position: relative;
      height: auto;
    }
    #variantContent { margin-left: 0; }
    .top-bar { left: 0; position: relative; }
    .answers-grid { grid-template-columns: 1fr; }
    .variant-header { flex-direction: column; align-items: flex-start; }
  }
`;
document.head.appendChild(styles);
