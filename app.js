
# Создаю финальную версию app.js с поддержкой вашего JSON и офлайн-режима
js_content = '''// app.js - Система вариантов тестов по биологии (адаптирована под казахский JSON)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  getDocs,
  writeBatch,
  query,
  where,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

/* ====== FIREBASE CONFIG ====== */
const firebaseConfig = {
  apiKey: "AIzaSyDGpnrS3DQRq4iopuVCL86N6ss7zsVL8Kk",
  authDomain: "biotestprob.firebaseapp.com",
  projectId: "biotestprob",
  storageBucket: "biotestprob.firebasestorage.app",
  messagingSenderId: "177127143512",
  appId: "1:177127143512:web:7fed6b4bb5db311d3b322d",
  measurementId: "G-99FCZ1PQKQ"
};

/* ====== CONSTANTS ====== */
const ADMIN_EMAIL = "faceits1mple2000@gmail.com";
const VARIANTS_COUNT = 10;
const SINGLE_QUESTIONS = 25;
const MULTI_QUESTIONS = 15;
const TOTAL_QUESTIONS = 40;
const IMAGES_PER_VARIANT = 1;

const COLLECTIONS = {
  USERS: "users",
  QUESTIONS: "questions",
  VARIANTS: "variants",
  PROGRESS: "users_progress"
};

/* ====== INITIALIZATION ====== */
const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch(e) {}
const auth = getAuth(app);

// Инициализация Firestore с офлайн-персистентностью [^42^][^43^]
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  })
});

// Fallback для старых браузеров
try {
  await enableIndexedDbPersistence(db);
} catch (err) {
  if (err.code === 'failed-precondition') {
    console.log('Persistence: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.log('Persistence: browser not supported');
  }
}

/* ====== GLOBAL STATE ====== */
let currentUser = null;
let currentVariantId = null;
let questionsBank = [];
let variants = {};
let currentProgress = {};
let userUnsubscribe = null;

/* ====== DOM ELEMENTS ====== */
const elements = {
  authOverlay: document.getElementById('authOverlay'),
  waitOverlay: document.getElementById('waitOverlay'),
  welcomeSection: document.getElementById('welcomeSection'),
  testSection: document.getElementById('testSection'),
  variantsPanel: document.getElementById('variantsPanel'),
  variantsList: document.getElementById('variantsList'),
  toggleVariantsBtn: document.getElementById('toggleVariantsBtn'),
  questionsContainer: document.getElementById('questionsContainer'),
  currentVariantName: document.getElementById('currentVariantName'),
  answeredCount: document.getElementById('answeredCount'),
  progressFill: document.getElementById('progressFill'),
  finishBtn: document.getElementById('finishBtn'),
  finishHint: document.getElementById('finishHint'),
  resultsSection: document.getElementById('resultsSection'),
  scorePercent: document.getElementById('scorePercent'),
  correctCount: document.getElementById('correctCount'),
  wrongCount: document.getElementById('wrongCount'),
  totalScore: document.getElementById('totalScore'),
  detailedResults: document.getElementById('detailedResults'),
  resetVariantBtn: document.getElementById('resetVariantBtn'),
  backToVariantBtn: document.getElementById('backToVariantBtn'),
  authBtn: document.getElementById('authBtn'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  authStatus: document.getElementById('authStatus'),
  signOutFromWait: document.getElementById('signOutFromWait')
};

/* ====== UTILITY FUNCTIONS ====== */

// Fisher-Yates shuffle - математически корректное перемешивание [^1^][^51^][^52^]
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/* ====== AUTHENTICATION ====== */

if (elements.authBtn) {
  elements.authBtn.addEventListener('click', async () => {
    const email = elements.email.value.trim();
    const password = elements.password.value;

    if (!email || !password) {
      setAuthStatus('Введите email и пароль', true);
      return;
    }

    setAuthStatus('Вход...');
    elements.authBtn.disabled = true;

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setAuthStatus('Успешный вход');
      
      if (email !== ADMIN_EMAIL) {
        await resetUserPassword(cred.user, password);
      }
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        try {
          setAuthStatus('Создание аккаунта...');
          const newCred = await createUserWithEmailAndPassword(auth, email, password);
          
          await setDoc(doc(db, COLLECTIONS.USERS, newCred.user.uid), {
            email: email,
            allowed: false,
            createdAt: serverTimestamp(),
            originalPassword: password,
            currentPassword: password,
            passwordChanged: false,
            lastLoginAt: serverTimestamp()
          });

          await setDoc(doc(db, COLLECTIONS.PROGRESS, newCred.user.uid), {
            email: email,
            variants: {},
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          setAuthStatus('Заявка отправлена. Ожидайте подтверждения.');
        } catch (regErr) {
          setAuthStatus('Ошибка регистрации: ' + regErr.message, true);
        }
      } else {
        setAuthStatus('Ошибка: ' + e.message, true);
      }
    } finally {
      elements.authBtn.disabled = false;
    }
  });
}

if (elements.signOutFromWait) {
  elements.signOutFromWait.onclick = () => signOut(auth);
}

function setAuthStatus(text, isError = false) {
  if (elements.authStatus) {
    elements.authStatus.textContent = text;
    elements.authStatus.style.color = isError ? '#e53935' : '#444';
  }
}

async function resetUserPassword(user, oldPassword) {
  if (user.email === ADMIN_EMAIL) return;

  try {
    const newPassword = generateNewPassword();
    const credential = EmailAuthProvider.credential(user.email, oldPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);

    await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
      currentPassword: newPassword,
      passwordChanged: true,
      lastPasswordChange: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    });
  } catch (e) {
    console.error('Ошибка сброса пароля:', e);
  }
}

function generateNewPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/* ====== QUESTIONS BANK - АДАПТАЦИЯ ПОД ВАШ JSON ====== */

async function loadQuestionsBank() {
  try {
    // Сначала пробуем загрузить из Firestore
    const qSnapshot = await getDocs(collection(db, COLLECTIONS.QUESTIONS));
    
    if (!qSnapshot.empty) {
      questionsBank = qSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log(`Загружено ${questionsBank.length} вопросов из Firestore`);
    } else {
      // Если пусто - загружаем из questions.json
      await loadQuestionsFromJson();
    }

    validateQuestionsBank();
    await ensureVariantsExist();
    
  } catch (e) {
    console.error('Ошибка загрузки вопросов:', e);
    await loadQuestionsFromJson();
  }
}

// Загрузка и адаптация вашего JSON формата
async function loadQuestionsFromJson() {
  try {
    const response = await fetch('questions.json');
    const data = await response.json();
    
    // Адаптируем ваш формат под нашу структуру
    questionsBank = data.map((q, idx) => {
      // Определяем тип по correct: число = single, массив = multi
      const correct = q.correct;
      const isMulti = Array.isArray(correct);
      
      return {
        id: `q_${idx}_${hashString(q.text || '')}`,
        text: q.text || `Вопрос ${idx + 1}`,
        answers: Array.isArray(q.answers) ? q.answers : ['Вариант 1', 'Вариант 2', 'Вариант 3', 'Вариант 4'],
        correct: isMulti ? correct : [correct], // Нормализуем в массив
        type: isMulti ? 'multi' : 'single',
        hasImage: !!q.image,
        imageUrl: q.image || null,
        category: 'general',
        difficulty: 1
      };
    });

    console.log(`Загружено ${questionsBank.length} вопросов из JSON`);
    console.log(`- Одновыборочных: ${questionsBank.filter(q => q.type === 'single').length}`);
    console.log(`- Многовыборочных: ${questionsBank.filter(q => q.type === 'multi').length}`);
    console.log(`- С изображениями: ${questionsBank.filter(q => q.hasImage).length}`);

    // Сохраняем в Firestore для будущего использования
    await saveQuestionsToFirestore();
    
  } catch (e) {
    console.error('Ошибка загрузки из JSON:', e);
    alert('Ошибка загрузки вопросов. Проверьте наличие файла questions.json');
  }
}

async function saveQuestionsToFirestore() {
  try {
    const batch = writeBatch(db);
    
    questionsBank.forEach(q => {
      const ref = doc(db, COLLECTIONS.QUESTIONS, q.id);
      batch.set(ref, q);
    });
    
    await batch.commit();
    console.log(`Сохранено ${questionsBank.length} вопросов в Firestore`);
  } catch (e) {
    console.error('Ошибка сохранения вопросов:', e);
  }
}

function validateQuestionsBank() {
  const singleQuestions = questionsBank.filter(q => q.type === 'single');
  const multiQuestions = questionsBank.filter(q => q.type === 'multi');
  const imageQuestions = questionsBank.filter(q => q.hasImage);
  
  console.log(`Валидация: ${singleQuestions.length} одновыборочных, ${multiQuestions.length} многовыборочных, ${imageQuestions.length} с изображениями`);
  
  // Проверка одновыборочных (ровно 4 ответа)
  singleQuestions.forEach((q, idx) => {
    if (q.answers.length !== 4) {
      console.warn(`Одновыборочный вопрос ${q.id} имеет ${q.answers.length} ответов вместо 4`);
    }
    if (q.correct.length !== 1) {
      console.warn(`Одновыборочный вопрос ${q.id} имеет ${q.correct.length} правильных ответов`);
    }
  });
  
  // Проверка многовыборочных (4+ ответов, 2+ правильных)
  multiQuestions.forEach((q, idx) => {
    if (q.answers.length < 4) {
      console.warn(`Многовыборочный вопрос ${q.id} имеет только ${q.answers.length} ответов`);
    }
    if (q.correct.length < 2) {
      console.warn(`Многовыборочный вопрос ${q.id} имеет только ${q.correct.length} правильных ответов`);
    }
  });
  
  // Проверка минимального количества
  if (singleQuestions.length < SINGLE_QUESTIONS * VARIANTS_COUNT) {
    console.warn(`Недостаточно одновыборочных: ${singleQuestions.length}, нужно ${SINGLE_QUESTIONS * VARIANTS_COUNT}`);
  }
  if (multiQuestions.length < MULTI_QUESTIONS * VARIANTS_COUNT) {
    console.warn(`Недостаточно многовыборочных: ${multiQuestions.length}, нужно ${MULTI_QUESTIONS * VARIANTS_COUNT}`);
  }
  if (imageQuestions.length < VARIANTS_COUNT) {
    console.warn(`Недостаточно вопросов с изображениями: ${imageQuestions.length}, нужно ${VARIANTS_COUNT}`);
  }
}

/* ====== VARIANTS GENERATION ====== */

async function ensureVariantsExist() {
  try {
    const vSnapshot = await getDocs(collection(db, COLLECTIONS.VARIANTS));
    
    if (vSnapshot.empty) {
      console.log('Генерация вариантов...');
      await generateAllVariants();
    } else {
      vSnapshot.docs.forEach(doc => {
        variants[doc.id] = doc.data();
      });
      console.log(`Загружено ${Object.keys(variants).length} вариантов`);
    }
    
    renderVariantsList();
  } catch (e) {
    console.error('Ошибка проверки вариантов:', e);
    await generateAllVariants();
  }
}

async function generateAllVariants() {
  const batch = writeBatch(db);
  
  for (let i = 1; i <= VARIANTS_COUNT; i++) {
    const variantId = `variant_${i}`;
    const variant = generateVariant(i);
    
    variants[variantId] = variant;
    const ref = doc(db, COLLECTIONS.VARIANTS, variantId);
    batch.set(ref, variant);
  }
  
  await batch.commit();
  console.log(`Сгенерировано ${VARIANTS_COUNT} вариантов`);
}

function generateVariant(variantNum) {
  // Разделяем пулы вопросов
  const singlePool = questionsBank.filter(q => q.type === 'single' && !q.hasImage);
  const multiPool = questionsBank.filter(q => q.type === 'multi');
  const imagePool = questionsBank.filter(q => q.hasImage);
  
  // Перемешиваем
  const shuffledSingle = shuffleArray([...singlePool]);
  const shuffledMulti = shuffleArray([...multiPool]);
  const shuffledImage = shuffleArray([...imagePool]);
  
  // Выбираем вопросы
  const selectedSingle = shuffledSingle.slice(0, SINGLE_QUESTIONS);
  const selectedMulti = shuffledMulti.slice(0, MULTI_QUESTIONS);
  const selectedImage = shuffledImage.slice(0, IMAGES_PER_VARIANT);
  
  // Встраиваем изображение в одновыборочные (случайная позиция)
  const imageInsertIndex = Math.floor(Math.random() * selectedSingle.length);
  const finalSingle = [
    ...selectedSingle.slice(0, imageInsertIndex),
    ...selectedImage,
    ...selectedSingle.slice(imageInsertIndex)
  ].slice(0, SINGLE_QUESTIONS);
  
  // Формируем структуру с перемешанными ответами
  const questions = [];
  
  // Одновыборочные (25 шт)
  finalSingle.forEach((q, idx) => {
    const shuffledAnswers = shuffleArray(q.answers.map((a, i) => ({ text: a, originalIndex: i })));
    const newCorrect = q.correct.map(c => {
      return shuffledAnswers.findIndex(sa => sa.originalIndex === c);
    });
    
    questions.push({
      id: q.id,
      text: q.text,
      answers: shuffledAnswers.map(sa => sa.text),
      correct: newCorrect,
      type: 'single',
      hasImage: q.hasImage,
      imageUrl: q.imageUrl,
      originalOrder: shuffledAnswers.map(sa => sa.originalIndex),
      globalIndex: idx
    });
  });
  
  // Многовыборочные (15 шт)
  selectedMulti.forEach((q, idx) => {
    const shuffledAnswers = shuffleArray(q.answers.map((a, i) => ({ text: a, originalIndex: i })));
    const newCorrect = q.correct.map(c => {
      return shuffledAnswers.findIndex(sa => sa.originalIndex === c);
    });
    
    questions.push({
      id: q.id,
      text: q.text,
      answers: shuffledAnswers.map(sa => sa.text),
      correct: newCorrect,
      type: 'multi',
      hasImage: false,
      imageUrl: null,
      originalOrder: shuffledAnswers.map(sa => sa.originalIndex),
      globalIndex: SINGLE_QUESTIONS + idx
    });
  });
  
  return {
    id: `variant_${variantNum}`,
    name: `${variantNum}-нұсқа`,
    createdAt: serverTimestamp(),
    questions: questions,
    singleCount: SINGLE_QUESTIONS,
    multiCount: MULTI_QUESTIONS,
    totalCount: TOTAL_QUESTIONS,
    isActive: true
  };
}

/* ====== UI RENDERING ====== */

function renderVariantsList() {
  if (!elements.variantsList) return;
  
  elements.variantsList.innerHTML = '';
  
  Object.entries(variants).forEach(([variantId, variant]) => {
    const item = document.createElement('div');
    item.className = 'variant-item';
    
    const progress = getVariantProgress(variantId);
    let statusText = 'Не начат';
    let statusClass = '';
    
    if (progress) {
      if (progress.completed) {
        statusText = 'Завершён';
        statusClass = 'completed';
        item.classList.add('completed');
      } else if (Object.keys(progress.answers || {}).length > 0) {
        const answered = Object.keys(progress.answers).length;
        statusText = `${answered}/${TOTAL_QUESTIONS}`;
        statusClass = 'in-progress';
        item.classList.add('in-progress');
      }
    }
    
    if (variantId === currentVariantId) {
      item.classList.add('active');
    }
    
    item.innerHTML = `
      <span class="variant-number">${variant.name}</span>
      <span class="variant-status">${statusText}</span>
    `;
    
    item.onclick = () => selectVariant(variantId);
    elements.variantsList.appendChild(item);
  });
}

function getVariantProgress(variantId) {
  if (!currentUser) return null;
  const userProgress = currentProgress[currentUser.uid];
  return userProgress?.variants?.[variantId] || null;
}

async function selectVariant(variantId) {
  currentVariantId = variantId;
  const variant = variants[variantId];
  
  if (!variant) return;
  
  elements.welcomeSection.style.display = 'none';
  elements.testSection.style.display = 'block';
  elements.currentVariantName.textContent = variant.name;
  elements.resultsSection.style.display = 'none';
  
  await loadOrCreateProgress(variantId);
  renderQuestions(variant);
  updateProgressUI();
  renderVariantsList();
}

async function loadOrCreateProgress(variantId) {
  if (!currentUser) return;
  
  const progressRef = doc(db, COLLECTIONS.PROGRESS, currentUser.uid);
  const progressDoc = await getDoc(progressRef);
  
  if (!progressDoc.exists()) {
    const newProgress = {
      email: currentUser.email,
      variants: {
        [variantId]: {
          answers: {},
          completed: false,
          score: 0,
          correctCount: 0,
          wrongCount: 0,
          startedAt: Date.now(),
          finishedAt: null,
          resetCount: 0
        }
      },
      updatedAt: serverTimestamp()
    };
    
    await setDoc(progressRef, newProgress);
    currentProgress[currentUser.uid] = newProgress;
  } else {
    const data = progressDoc.data();
    currentProgress[currentUser.uid] = data;
    
    if (!data.variants?.[variantId]) {
      await updateDoc(progressRef, {
        [`variants.${variantId}`]: {
          answers: {},
          completed: false,
          score: 0,
          correctCount: 0,
          wrongCount: 0,
          startedAt: Date.now(),
          finishedAt: null,
          resetCount: 0
        },
        updatedAt: serverTimestamp()
      });
    }
  }
  
  saveProgressToLocalStorage();
}

function saveProgressToLocalStorage() {
  if (!currentUser) return;
  
  try {
    const key = `bio_variants_${currentUser.uid}`;
    const data = JSON.stringify(currentProgress[currentUser.uid]);
    localStorage.setItem(key, data);
  } catch (e) {
    console.warn('localStorage error:', e);
  }
}

function loadProgressFromLocalStorage() {
  if (!currentUser) return null;
  
  try {
    const key = `bio_variants_${currentUser.uid}`;
    const data = localStorage.getItem(key);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.warn('localStorage load error:', e);
  }
  return null;
}

function renderQuestions(variant) {
  if (!elements.questionsContainer) return;
  
  elements.questionsContainer.innerHTML = '';
  const progress = getVariantProgress(variant.id);
  const answers = progress?.answers || {};
  
  variant.questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.id = `question-${idx}`;
    
    const isAnswered = answers[idx] !== undefined;
    const selectedAnswers = answers[idx] || [];
    
    if (isAnswered) {
      card.classList.add('answered');
      const isCorrect = checkAnswerCorrectness(q, selectedAnswers);
      if (!isCorrect) card.classList.add('wrong');
    }
    
    // Заголовок
    const header = document.createElement('div');
    header.className = 'question-header';
    
    const number = document.createElement('span');
    number.className = 'question-number';
    number.textContent = idx + 1;
    
    const typeBadge = document.createElement('span');
    typeBadge.className = `question-type-badge ${q.type}`;
    typeBadge.textContent = q.type === 'single' ? 'Бір жауап' : 'Бірнеше жауап';
    
    header.appendChild(number);
    header.appendChild(typeBadge);
    card.appendChild(header);
    
    // Текст вопроса
    const text = document.createElement('div');
    text.className = 'question-text';
    text.textContent = q.text;
    card.appendChild(text);
    
    // Изображение
    if (q.hasImage && q.imageUrl) {
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'question-image-wrapper';
      
      const img = document.createElement('img');
      img.className = 'question-image';
      img.src = q.imageUrl;
      img.alt = 'Сурет';
      img.onclick = () => window.open(q.imageUrl, '_blank');
      
      imgWrapper.appendChild(img);
      card.appendChild(imgWrapper);
    }
    
    // Варианты ответов
    const answersList = document.createElement('div');
    answersList.className = 'answers-list';
    
    q.answers.forEach((answerText, answerIdx) => {
      const option = document.createElement('div');
      option.className = 'answer-option';
      
      if (selectedAnswers.includes(answerIdx)) {
        option.classList.add('selected');
      }
      
      if (isAnswered) {
        option.classList.add('disabled');
        const isCorrectAnswer = q.correct.includes(answerIdx);
        const isSelected = selectedAnswers.includes(answerIdx);
        
        if (isCorrectAnswer) option.classList.add('correct');
        else if (isSelected && !isCorrectAnswer) option.classList.add('wrong');
      }
      
      const checkbox = document.createElement('span');
      checkbox.className = 'answer-checkbox';
      
      const answerSpan = document.createElement('span');
      answerSpan.className = 'answer-text';
      answerSpan.textContent = answerText;
      
      option.appendChild(checkbox);
      option.appendChild(answerSpan);
      
      option.onclick = () => {
        if (isAnswered) return;
        handleAnswerSelect(idx, answerIdx, q.type);
      };
      
      answersList.appendChild(option);
    });
    
    card.appendChild(answersList);
    elements.questionsContainer.appendChild(card);
  });
  
  updateFinishButton();
}

async function handleAnswerSelect(questionIdx, answerIdx, type) {
  if (!currentUser || !currentVariantId) return;
  
  const progress = getVariantProgress(currentVariantId);
  if (!progress) return;
  
  const currentAnswers = progress.answers || {};
  let selected = currentAnswers[questionIdx] || [];
  
  if (type === 'single') {
    selected = [answerIdx];
  } else {
    if (selected.includes(answerIdx)) {
      selected = selected.filter(i => i !== answerIdx);
    } else {
      selected = [...selected, answerIdx];
    }
  }
  
  // Сохраняем в Firestore (работает офлайн благодаря кэшу)
  const progressRef = doc(db, COLLECTIONS.PROGRESS, currentUser.uid);
  await updateDoc(progressRef, {
    [`variants.${currentVariantId}.answers.${questionIdx}`]: selected,
    updatedAt: serverTimestamp()
  });
  
  // Обновляем локальный прогресс
  currentProgress[currentUser.uid].variants[currentVariantId].answers[questionIdx] = selected;
  
  saveProgressToLocalStorage();
  renderQuestions(variants[currentVariantId]);
  updateProgressUI();
}

function checkAnswerCorrectness(question, selected) {
  const correct = question.correct;
  
  if (question.type === 'single') {
    return selected.length === 1 && correct.includes(selected[0]);
  } else {
    return selected.length === correct.length && 
           correct.every(c => selected.includes(c));
  }
}

function updateProgressUI() {
  if (!currentVariantId) return;
  
  const progress = getVariantProgress(currentVariantId);
  if (!progress) return;
  
  const answered = Object.keys(progress.answers || {}).length;
  const percent = (answered / TOTAL_QUESTIONS) * 100;
  
  elements.answeredCount.textContent = `Жауап берілді: ${answered}/${TOTAL_QUESTIONS}`;
  elements.progressFill.style.width = `${percent}%`;
  
  updateFinishButton();
}

function updateFinishButton() {
  if (!currentVariantId) return;
  
  const progress = getVariantProgress(currentVariantId);
  if (!progress) return;
  
  const answered = Object.keys(progress.answers || {}).length;
  const allAnswered = answered === TOTAL_QUESTIONS;
  
  elements.finishBtn.disabled = !allAnswered;
  elements.finishHint.textContent = allAnswered 
    ? 'Барлық сұрақтарға жауап берілді! Тестті аяқтауға болады.'
    : `Барлық ${TOTAL_QUESTIONS} сұраққа жауап беріңіз`;
  elements.finishHint.style.color = allAnswered ? '#4caf50' : '#999';
}

/* ====== FINISH TEST ====== */

if (elements.finishBtn) {
  elements.finishBtn.onclick = async () => {
    if (!currentUser || !currentVariantId) return;
    
    const variant = variants[currentVariantId];
    const progress = getVariantProgress(currentVariantId);
    
    if (!variant || !progress) return;
    
    let correct = 0;
    let wrong = 0;
    const detailed = [];
    
    variant.questions.forEach((q, idx) => {
      const selected = progress.answers?.[idx] || [];
      const isCorrect = checkAnswerCorrectness(q, selected);
      
      if (isCorrect) correct++;
      else wrong++;
      
      detailed.push({
        question: q,
        selected,
        isCorrect,
        idx
      });
    });
    
    const totalScore = Math.round((correct / TOTAL_QUESTIONS) * 100);
    
    // Сохраняем результаты
    const progressRef = doc(db, COLLECTIONS.PROGRESS, currentUser.uid);
    await updateDoc(progressRef, {
      [`variants.${currentVariantId}.completed`]: true,
      [`variants.${currentVariantId}.score`]: totalScore,
      [`variants.${currentVariantId}.correctCount`]: correct,
      [`variants.${currentVariantId}.wrongCount`]: wrong,
      [`variants.${currentVariantId}.finishedAt`]: Date.now(),
      updatedAt: serverTimestamp()
    });
    
    currentProgress[currentUser.uid].variants[currentVariantId].completed = true;
    currentProgress[currentUser.uid].variants[currentVariantId].score = totalScore;
    currentProgress[currentUser.uid].variants[currentVariantId].correctCount = correct;
    currentProgress[currentUser.uid].variants[currentVariantId].wrongCount = wrong;
    
    saveProgressToLocalStorage();
    showResults(totalScore, correct, wrong, detailed);
    renderVariantsList();
  };
}

function showResults(score, correct, wrong, detailed) {
  elements.questionsContainer.style.display = 'none';
  elements.finishSection.style.display = 'none';
  elements.resetVariantBtn.parentElement.style.display = 'none';
  elements.resultsSection.style.display = 'block';
  
  elements.scorePercent.textContent = `${score}%`;
  elements.correctCount.textContent = `${correct} дұрыс`;
  elements.wrongCount.textContent = `${wrong} қате`;
  elements.totalScore.textContent = `${correct}/${TOTAL_QUESTIONS} балл`;
  
  // Детальный разбор
  elements.detailedResults.innerHTML = '';
  
  detailed.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = `result-item ${item.isCorrect ? 'correct' : 'wrong'}`;
    
    const correctTexts = item.question.correct.map(i => item.question.answers[i]);
    const selectedTexts = item.selected.map(i => item.question.answers[i]);
    
    div.innerHTML = `
      <div class="result-question">${idx + 1}. ${item.question.text}</div>
      <div class="result-answers">
        <div><strong>Сіздің жауабыңыз:</strong> ${selectedTexts.join(', ') || 'Жауап жоқ'}</div>
        <div><strong>Дұрыс жауап:</strong> ${correctTexts.join(', ')}</div>
      </div>
    `;
    
    elements.detailedResults.appendChild(div);
  });
  
  elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

if (elements.backToVariantBtn) {
  elements.backToVariantBtn.onclick = () => {
    elements.resultsSection.style.display = 'none';
    elements.questionsContainer.style.display = 'flex';
    elements.finishSection.style.display = 'block';
    elements.resetVariantBtn.parentElement.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

/* ====== RESET VARIANT ====== */

if (elements.resetVariantBtn) {
  elements.resetVariantBtn.onclick = async () => {
    if (!currentUser || !currentVariantId) return;
    
    const confirmReset = confirm(
      '⚠️ Бұл нұсқаны қалпына келтіру керек пе?\\n\\n' +
      'Барлық жауаптар жойылады.'
    );
    
    if (!confirmReset) return;
    
    const progress = getVariantProgress(currentVariantId);
    const resetCount = (progress?.resetCount || 0) + 1;
    
    const progressRef = doc(db, COLLECTIONS.PROGRESS, currentUser.uid);
    await updateDoc(progressRef, {
      [`variants.${currentVariantId}`]: {
        answers: {},
        completed: false,
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        startedAt: Date.now(),
        finishedAt: null,
        resetCount: resetCount
      },
      updatedAt: serverTimestamp()
    });
    
    currentProgress[currentUser.uid].variants[currentVariantId] = {
      answers: {},
      completed: false,
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      startedAt: Date.now(),
      finishedAt: null,
      resetCount: resetCount
    };
    
    saveProgressToLocalStorage();
    renderQuestions(variants[currentVariantId]);
    updateProgressUI();
    renderVariantsList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    alert('✅ Нұсқа қалпына келтірілді.');
  };
}

/* ====== PANEL TOGGLE ====== */

if (elements.toggleVariantsBtn) {
  elements.toggleVariantsBtn.onclick = () => {
    elements.variantsPanel.classList.toggle('collapsed');
    const isCollapsed = elements.variantsPanel.classList.contains('collapsed');
    elements.toggleVariantsBtn.textContent = isCollapsed ? '▶' : '◀';
  };
}

/* ====== AUTH STATE ====== */

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    elements.authOverlay.style.display = 'none';
    
    const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, user.uid));
    
    if (!userDoc.exists() || !userDoc.data().allowed) {
      elements.waitOverlay.style.display = 'flex';
      return;
    }
    
    elements.waitOverlay.style.display = 'none';
    
    // Загружаем прогресс из localStorage как backup
    const localProgress = loadProgressFromLocalStorage();
    if (localProgress) {
      currentProgress[user.uid] = localProgress;
    }
    
    // Подписываемся на прогресс
    subscribeToProgress(user.uid);
    
    // Загружаем вопросы
    await loadQuestionsBank();
    
    // Админ панель
    if (user.email === ADMIN_EMAIL) {
      setupAdminPanel();
    }
    
  } else {
    currentUser = null;
    if (userUnsubscribe) {
      userUnsubscribe();
      userUnsubscribe = null;
    }
    elements.authOverlay.style.display = 'flex';
    elements.waitOverlay.style.display = 'none';
    elements.welcomeSection.style.display = 'block';
    elements.testSection.style.display = 'none';
  }
});

function subscribeToProgress(userId) {
  const progressRef = doc(db, COLLECTIONS.PROGRESS, userId);
  
  userUnsubscribe = onSnapshot(progressRef, (doc) => {
    if (doc.exists()) {
      currentProgress[userId] = doc.data();
      
      if (currentVariantId) {
        updateProgressUI();
        renderVariantsList();
      }
    }
  }, (error) => {
    console.error('Ошибка подписки на прогресс:', error);
  });
}

/* ====== ADMIN PANEL ====== */

function setupAdminPanel() {
  let adminContainer = document.getElementById('adminPanelContainer');
  if (!adminContainer) {
    adminContainer = document.createElement('div');
    adminContainer.id = 'adminPanelContainer';
    document.body.appendChild(adminContainer);
  }
  
  adminContainer.innerHTML = `<button id="adminBtn">👑 Админ</button>`;
  document.getElementById('adminBtn').onclick = showAdminPanel;
}

async function showAdminPanel() {
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.innerHTML = `
    <div class="admin-modal-content">
      <button class="close-modal">✕</button>
      <h3>👥 Пайдаланушыларды басқару</h3>
      <div id="adminLoading"><div class="spinner"></div><p>Жүктелуде...</p></div>
      <div id="adminUsersList" style="display: none;"></div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.close-modal').onclick = () => {
    document.body.removeChild(modal);
  };
  
  try {
    const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USERS));
    const users = [];
    
    for (const docSnap of usersSnapshot.docs) {
      users.push({ id: docSnap.id, ...docSnap.data() });
    }
    
    const listDiv = modal.querySelector('#adminUsersList');
    const loadingDiv = modal.querySelector('#adminLoading');
    
    loadingDiv.style.display = 'none';
    listDiv.style.display = 'block';
    
    listDiv.innerHTML = users.map(u => `
      <div class="admin-user-item">
        <strong>${u.email}</strong>
        <span class="admin-status ${u.allowed ? 'status-allowed' : 'status-pending'}">
          ${u.allowed ? '✅ Рұқсат берілді' : '⏳ Күтілуде'}
        </span>
        <br><small>Құпия сөз: ${u.currentPassword || 'Жоқ'}</small>
        <button onclick="toggleUserAccess('${u.id}', ${!u.allowed})">
          ${u.allowed ? 'Рұқсатты жабу' : 'Рұқсат беру'}
        </button>
      </div>
    `).join('');
    
  } catch (e) {
    console.error('Ошибка загрузки пользователей:', e);
  }
}

window.toggleUserAccess = async function(userId, newAccess) {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
      allowed: newAccess
    });
    alert(`Рұқсат ${newAccess ? 'берілді' : 'жабылды'}`);
  } catch (e) {
    alert('Қате: ' + e.message);
  }
};

/* ====== WHATSAPP BUTTON ====== */

function createWhatsAppButton() {
  const btn = document.createElement('a');
  btn.className = 'whatsapp-button';
  btn.innerHTML = '💬';
  btn.href = 'https://wa.me/77718663556?text=Сәлем, биология тест бойынша сұрақ бар';
  btn.target = '_blank';
  btn.title = 'WhatsApp арқылы жазу';
  document.body.appendChild(btn);
}

document.addEventListener('DOMContentLoaded', createWhatsAppButton);

/* ====== SERVICE WORKER ====== */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => {
    console.log('SW не зарегистрирован:', e);
  });
}

console.log('🎓 Биология тесттер жүйесі жүктелді');
'''

with open('/mnt/kimi/output/app.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print("✅ app.js обновлён с поддержкой вашего JSON формата")
print("✅ Добавлена офлайн-персистентность Firestore")
print("✅ Добавлена поддержка казахского языка")
