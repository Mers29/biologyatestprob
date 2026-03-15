
# Создаю полный app.js с учётом всех требований
js_content = '''// app.js - Полностью переработанная система вариантов тестов
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
  getFirestore,
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
  where
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
const VARIANTS_COUNT = 10; // Количество вариантов
const SINGLE_QUESTIONS = 25; // Одновыборочные
const MULTI_QUESTIONS = 15;  // Многовыборочные
const TOTAL_QUESTIONS = 40;
const IMAGES_PER_VARIANT = 1; // Один вопрос с картинкой на вариант

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
const db = getFirestore(app);

/* ====== GLOBAL STATE ====== */
let currentUser = null;
let currentVariantId = null;
let questionsBank = []; // Банк всех вопросов
let variants = {}; // Сгенерированные варианты
let currentProgress = {}; // Прогресс текущего пользователя

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

// Fisher-Yates shuffle алгоритм [^1^][^2^]
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Генерация ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Хеш строки для проверки целостности
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Форматирование времени
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}ч ${minutes % 60}м`;
  if (minutes > 0) return `${minutes}м ${seconds % 60}с`;
  return `${seconds}с`;
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
      
      // Сброс пароля для не-админов
      if (email !== ADMIN_EMAIL) {
        await resetUserPassword(cred.user, password);
      }
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        // Регистрация нового пользователя
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

          // Инициализация прогресса
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

// Сброс пароля после входа
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

    console.log('Пароль обновлён:', newPassword);
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

/* ====== QUESTIONS BANK MANAGEMENT ====== */

// Загрузка банка вопросов
async function loadQuestionsBank() {
  try {
    // Пробуем загрузить из Firestore
    const qSnapshot = await getDocs(collection(db, COLLECTIONS.QUESTIONS));
    
    if (!qSnapshot.empty) {
      questionsBank = qSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log(`Загружено ${questionsBank.length} вопросов из Firestore`);
    } else {
      // Если в Firestore пусто, загружаем из JSON
      await loadQuestionsFromJson();
    }

    // Валидация вопросов
    validateQuestionsBank();
    
    // Генерация вариантов если их нет
    await ensureVariantsExist();
    
  } catch (e) {
    console.error('Ошибка загрузки вопросов:', e);
    await loadQuestionsFromJson();
  }
}

// Загрузка из JSON файла
async function loadQuestionsFromJson() {
  try {
    const response = await fetch('questions.json');
    const data = await response.json();
    
    questionsBank = data.map((q, idx) => ({
      id: q.id || `q_${idx}_${hashString(q.text || '')}`,
      text: q.text || q.question || `Вопрос ${idx + 1}`,
      answers: Array.isArray(q.answers) ? q.answers : ['Вариант 1', 'Вариант 2', 'Вариант 3', 'Вариант 4'],
      correct: Array.isArray(q.correct) ? q.correct : [q.correct || 0],
      type: q.type || (Array.isArray(q.correct) && q.correct.length > 1 ? 'multi' : 'single'),
      hasImage: !!q.image,
      imageUrl: q.image || null,
      category: q.category || 'general',
      difficulty: q.difficulty || 1
    }));

    // Сохраняем в Firestore для будущего использования
    await saveQuestionsToFirestore();
    
  } catch (e) {
    console.error('Ошибка загрузки из JSON:', e);
    // Fallback: создаём тестовые вопросы
    createSampleQuestions();
  }
}

// Сохранение вопросов в Firestore
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

// Создание тестовых вопросов (fallback)
function createSampleQuestions() {
  const sampleTexts = [
    'Какой орган отвечает за фильтрацию крови?',
    'Что такое фотосинтез?',
    'Какая клеточная органелла содержит ДНК?',
    'Какой витамин синтезируется в коже под действием солнечного света?',
    'Что такое митоз?'
  ];
  
  questionsBank = [];
  
  // Создаём одновыборочные (ровно 4 ответа)
  for (let i = 0; i < 100; i++) {
    questionsBank.push({
      id: `single_${i}`,
      text: `${sampleTexts[i % sampleTexts.length]} (одновыборочный ${i + 1})`,
      answers: ['Почки', 'Печень', 'Селезёнка', 'Желудок'],
      correct: [0],
      type: 'single',
      hasImage: false,
      imageUrl: null,
      category: 'anatomy'
    });
  }
  
  // Создаём многовыборочные (5-6 ответов)
  for (let i = 0; i < 60; i++) {
    questionsBank.push({
      id: `multi_${i}`,
      text: `${sampleTexts[i % sampleTexts.length]} (многовыборочный ${i + 1}). Выберите все правильные варианты:`,
      answers: ['Вариант А', 'Вариант Б', 'Вариант В', 'Вариант Г', 'Вариант Д', 'Вариант Е'],
      correct: [0, 2, 4], // 3 правильных
      type: 'multi',
      hasImage: false,
      imageUrl: null,
      category: 'physiology'
    });
  }
  
  // Добавляем вопросы с изображениями
  for (let i = 0; i < VARIANTS_COUNT; i++) {
    questionsBank.push({
      id: `img_${i}`,
      text: 'Изучите изображение и ответьте на вопрос',
      answers: ['Структура 1', 'Структура 2', 'Структура 3', 'Структура 4'],
      correct: [1],
      type: 'single',
      hasImage: true,
      imageUrl: `https://via.placeholder.com/600x400/4CAF50/ffffff?text=Изображение+для+варианта+${i + 1}`,
      category: 'histology'
    });
  }
}

// Валидация банка вопросов
function validateQuestionsBank() {
  const singleQuestions = questionsBank.filter(q => q.type === 'single');
  const multiQuestions = questionsBank.filter(q => q.type === 'multi');
  const imageQuestions = questionsBank.filter(q => q.hasImage);
  
  console.log(`Валидация: ${singleQuestions.length} одновыборочных, ${multiQuestions.length} многовыборочных, ${imageQuestions.length} с изображениями`);
  
  // Проверка одновыборочных
  singleQuestions.forEach((q, idx) => {
    if (q.answers.length !== 4) {
      console.warn(`Одновыборочный вопрос ${q.id} имеет ${q.answers.length} ответов вместо 4`);
    }
    if (q.correct.length !== 1) {
      console.warn(`Одновыборочный вопрос ${q.id} имеет ${q.correct.length} правильных ответов`);
    }
  });
  
  // Проверка многовыборочных
  multiQuestions.forEach((q, idx) => {
    if (q.answers.length < 4) {
      console.warn(`Многовыборочный вопрос ${q.id} имеет только ${q.answers.length} ответов`);
    }
    if (q.correct.length < 2) {
      console.warn(`Многовыборочный вопрос ${q.id} имеет только ${q.correct.length} правильных ответов`);
    }
  });
}

/* ====== VARIANTS GENERATION ====== */

// Проверка и создание вариантов
async function ensureVariantsExist() {
  try {
    const vSnapshot = await getDocs(collection(db, COLLECTIONS.VARIANTS));
    
    if (vSnapshot.empty) {
      console.log('Варианты не найдены, генерируем новые...');
      await generateAllVariants();
    } else {
      // Загружаем существующие
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

// Генерация всех вариантов
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

// Генерация одного варианта
function generateVariant(variantNum) {
  // Разделяем вопросы по типам
  const singlePool = questionsBank.filter(q => q.type === 'single' && !q.hasImage);
  const multiPool = questionsBank.filter(q => q.type === 'multi');
  const imagePool = questionsBank.filter(q => q.hasImage);
  
  // Перемешиваем пулы
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
  ].slice(0, SINGLE_QUESTIONS); // Обрезаем до нужного количества
  
  // Формируем структуру варианта
  const questions = [];
  
  // Сначала все одновыборочные (с перемешанными ответами)
  finalSingle.forEach((q, idx) => {
    const shuffledAnswers = shuffleArray(q.answers.map((a, i) => ({ text: a, originalIndex: i })));
    const newCorrect = q.correct.map(c => {
      const originalIdx = c;
      return shuffledAnswers.findIndex(sa => sa.originalIndex === originalIdx);
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
  
  // Затем все многовыборочные (с перемешанными ответами)
  selectedMulti.forEach((q, idx) => {
    const shuffledAnswers = shuffleArray(q.answers.map((a, i) => ({ text: a, originalIndex: i })));
    const newCorrect = q.correct.map(c => {
      const originalIdx = c;
      return shuffledAnswers.findIndex(sa => sa.originalIndex === originalIdx);
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

// Отрисовка списка вариантов
function renderVariantsList() {
  if (!elements.variantsList) return;
  
  elements.variantsList.innerHTML = '';
  
  Object.entries(variants).forEach(([variantId, variant]) => {
    const item = document.createElement('div');
    item.className = 'variant-item';
    
    // Проверяем статус варианта
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

// Получение прогресса варианта
function getVariantProgress(variantId) {
  if (!currentUser) return null;
  const userProgress = currentProgress[currentUser.uid];
  return userProgress?.variants?.[variantId] || null;
}

// Выбор варианта
async function selectVariant(variantId) {
  currentVariantId = variantId;
  const variant = variants[variantId];
  
  if (!variant) {
    console.error('Вариант не найден:', variantId);
    return;
  }
  
  // Обновляем UI
  elements.welcomeSection.style.display = 'none';
  elements.testSection.style.display = 'block';
  elements.currentVariantName.textContent = variant.name;
  elements.resultsSection.style.display = 'none';
  
  // Загружаем или создаём прогресс
  await loadOrCreateProgress(variantId);
  
  // Рендерим вопросы
  renderQuestions(variant);
  updateProgressUI();
  
  // Обновляем активный элемент в списке
  renderVariantsList();
}

// Загрузка или создание прогресса
async function loadOrCreateProgress(variantId) {
  if (!currentUser) return;
  
  const progressRef = doc(db, COLLECTIONS.PROGRESS, currentUser.uid);
  const progressDoc = await getDoc(progressRef);
  
  if (!progressDoc.exists()) {
    // Создаём новый прогресс
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
    
    // Проверяем, есть ли прогресс для этого варианта
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
  
  // Сохраняем в localStorage как backup [^13^][^15^]
  saveProgressToLocalStorage();
}

// Сохранение в localStorage (backup)
function saveProgressToLocalStorage() {
  if (!currentUser) return;
  
  try {
    const key = `bio_variants_${currentUser.uid}`;
    const data = JSON.stringify(currentProgress[currentUser.uid]);
    localStorage.setItem(key, data);
    console.log('Прогресс сохранён в localStorage');
  } catch (e) {
    console.warn('Не удалось сохранить в localStorage:', e);
  }
}

// Загрузка из localStorage (fallback)
function loadProgressFromLocalStorage() {
  if (!currentUser) return null;
  
  try {
    const key = `bio_variants_${currentUser.uid}`;
    const data = localStorage.getItem(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('Ошибка загрузки из localStorage:', e);
  }
  return null;
}

// Рендеринг вопросов
function renderQuestions(variant) {
  if (!elements.questionsContainer) return;
  
  elements.questionsContainer.innerHTML = '';
  const progress = getVariantProgress(variant.id);
  const answers = progress?.answers || {};
  
  variant.questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.id = `question-${idx}`;
    
    // Проверяем, отвечен ли вопрос
    const isAnswered = answers[idx] !== undefined;
    const selectedAnswers = answers[idx] || [];
    
    if (isAnswered) {
      card.classList.add('answered');
      // Проверяем правильность
      const isCorrect = checkAnswerCorrectness(q, selectedAnswers);
      if (!isCorrect) card.classList.add('wrong');
    }
    
    // Заголовок вопроса
    const header = document.createElement('div');
    header.className = 'question-header';
    
    const number = document.createElement('span');
    number.className = 'question-number';
    number.textContent = idx + 1;
    
    const typeBadge = document.createElement('span');
    typeBadge.className = `question-type-badge ${q.type}`;
    typeBadge.textContent = q.type === 'single' ? 'Один ответ' : 'Несколько ответов';
    
    header.appendChild(number);
    header.appendChild(typeBadge);
    card.appendChild(header);
    
    // Текст вопроса
    const text = document.createElement('div');
    text.className = 'question-text';
    text.textContent = q.text;
    card.appendChild(text);
    
    // Изображение если есть
    if (q.hasImage && q.imageUrl) {
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'question-image-wrapper';
      
      const img = document.createElement('img');
      img.className = 'question-image';
      img.src = q.imageUrl;
      img.alt = 'Изображение к вопросу';
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
      
      // Если уже отвечено, показываем правильность
      if (isAnswered) {
        option.classList.add('disabled');
        const isCorrectAnswer = q.correct.includes(answerIdx);
        const isSelected = selectedAnswers.includes(answerIdx);
        
        if (isCorrectAnswer) {
          option.classList.add('correct');
        } else if (isSelected && !isCorrectAnswer) {
          option.classList.add('wrong');
        }
      }
      
      const checkbox = document.createElement('span');
      checkbox.className = 'answer-checkbox';
      
      const answerSpan = document.createElement('span');
      answerSpan.className = 'answer-text';
      answerSpan.textContent = answerText;
      
      option.appendChild(checkbox);
      option.appendChild(answerSpan);
      
      option.onclick = () => {
        if (isAnswered) return; // Нельзя менять после ответа
        handleAnswerSelect(idx, answerIdx, q.type);
      };
      
      answersList.appendChild(option);
    });
    
    card.appendChild(answersList);
    elements.questionsContainer.appendChild(card);
  });
  
  // Обновляем состояние кнопки завершения
  updateFinishButton();
}

// Обработка выбора ответа
async function handleAnswerSelect(questionIdx, answerIdx, type) {
  if (!currentUser || !currentVariantId) return;
  
  const progress = getVariantProgress(currentVariantId);
  if (!progress) return;
  
  const currentAnswers = progress.answers || {};
  let selected = currentAnswers[questionIdx] || [];
  
  if (type === 'single') {
    // Одновыборочный - заменяем выбор
    selected = [answerIdx];
  } else {
    // Многовыборочный - тоггл
    if (selected.includes(answerIdx)) {
      selected = selected.filter(i => i !== answerIdx);
    } else {
      selected = [...selected, answerIdx];
    }
  }
  
  // Сохраняем
  const progressRef = doc(db, COLLECTIONS.PROGRESS, currentUser.uid);
  await updateDoc(progressRef, {
    [`variants.${currentVariantId}.answers.${questionIdx}`]: selected,
    updatedAt: serverTimestamp()
  });
  
  // Обновляем локальный прогресс
  currentProgress[currentUser.uid].variants[currentVariantId].answers[questionIdx] = selected;
  
  // Сохраняем в localStorage
  saveProgressToLocalStorage();
  
  // Обновляем UI
  renderQuestions(variants[currentVariantId]);
  updateProgressUI();
}

// Проверка правильности ответа
function checkAnswerCorrectness(question, selected) {
  const correct = question.correct;
  
  if (question.type === 'single') {
    return selected.length === 1 && correct.includes(selected[0]);
  } else {
    // Для многовыборочных - все правильные должны быть выбраны и ничего лишнего
    return selected.length === correct.length && 
           correct.every(c => selected.includes(c));
  }
}

// Обновление UI прогресса
function updateProgressUI() {
  if (!currentVariantId) return;
  
  const progress = getVariantProgress(currentVariantId);
  if (!progress) return;
  
  const answered = Object.keys(progress.answers || {}).length;
  const percent = (answered / TOTAL_QUESTIONS) * 100;
  
  elements.answeredCount.textContent = `Отвечено: ${answered}/${TOTAL_QUESTIONS}`;
  elements.progressFill.style.width = `${percent}%`;
  
  updateFinishButton();
}

// Обновление кнопки завершения
function updateFinishButton() {
  if (!currentVariantId) return;
  
  const progress = getVariantProgress(currentVariantId);
  if (!progress) return;
  
  const answered = Object.keys(progress.answers || {}).length;
  const allAnswered = answered === TOTAL_QUESTIONS;
  
  elements.finishBtn.disabled = !allAnswered;
  elements.finishHint.textContent = allAnswered 
    ? 'Все вопросы отвечены! Можете завершить тест.'
    : `Ответьте на все ${TOTAL_QUESTIONS} вопросов, чтобы завершить`;
  elements.finishHint.style.color = allAnswered ? '#4caf50' : '#999';
}

/* ====== FINISH TEST ====== */

if (elements.finishBtn) {
  elements.finishBtn.onclick = async () => {
    if (!currentUser || !currentVariantId) return;
    
    const variant = variants[currentVariantId];
    const progress = getVariantProgress(currentVariantId);
    
    if (!variant || !progress) return;
    
    // Подсчитываем результаты
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
    
    // Обновляем локальный прогресс
    currentProgress[currentUser.uid].variants[currentVariantId].completed = true;
    currentProgress[currentUser.uid].variants[currentVariantId].score = totalScore;
    currentProgress[currentUser.uid].variants[currentVariantId].correctCount = correct;
    currentProgress[currentUser.uid].variants[currentVariantId].wrongCount = wrong;
    
    saveProgressToLocalStorage();
    
    // Показываем результаты
    showResults(totalScore, correct, wrong, detailed);
    renderVariantsList();
  };
}

// Показ результатов
function showResults(score, correct, wrong, detailed) {
  elements.questionsContainer.style.display = 'none';
  elements.finishSection.style.display = 'none';
  elements.resetVariantBtn.parentElement.style.display = 'none';
  elements.resultsSection.style.display = 'block';
  
  elements.scorePercent.textContent = `${score}%`;
  elements.correctCount.textContent = `${correct} правильных`;
  elements.wrongCount.textContent = `${wrong} неправильных`;
  elements.totalScore.textContent = `${correct}/${TOTAL_QUESTIONS} баллов`;
  
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
        <div><strong>Ваш ответ:</strong> ${selectedTexts.join(', ') || 'Нет ответа'}</div>
        <div><strong>Правильный:</strong> ${correctTexts.join(', ')}</div>
      </div>
    `;
    
    elements.detailedResults.appendChild(div);
  });
  
  // Прокрутка к результатам
  elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Возврат к варианту
if (elements.backToVariantBtn) {
  elements.backToVariantBtn.onclick = () => {
    elements.resultsSection.style.display = 'none';
    elements.questionsContainer.style.display = 'flex';
    elements.finishSection.style.display = 'block';
    elements.resetVariantBtn.parentElement.style.display = 'block';
    
    // Прокрутка к началу
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

/* ====== RESET VARIANT ====== */

if (elements.resetVariantBtn) {
  elements.resetVariantBtn.onclick = async () => {
    if (!currentUser || !currentVariantId) return;
    
    const confirmReset = confirm(
      '⚠️ Вы уверены, что хотите сбросить этот вариант?\\n\\n' +
      'Все ответы будут удалены безвозвратно.'
    );
    
    if (!confirmReset) return;
    
    const progress = getVariantProgress(currentVariantId);
    const resetCount = (progress?.resetCount || 0) + 1;
    
    // Сбрасываем прогресс
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
    
    // Обновляем локальный прогресс
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
    
    // Перерисовываем
    renderQuestions(variants[currentVariantId]);
    updateProgressUI();
    renderVariantsList();
    
    // Прокрутка к началу
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    alert('✅ Вариант сброшен. Начните заново.');
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

/* ====== AUTH STATE LISTENER ====== */

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    elements.authOverlay.style.display = 'none';
    
    // Проверяем доступ
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
    
    // Загружаем банк вопросов и варианты
    await loadQuestionsBank();
    
    // Подписываемся на обновления прогресса
    subscribeToProgress(user.uid);
    
    // Админ панель
    if (user.email === ADMIN_EMAIL) {
      setupAdminPanel();
    }
    
  } else {
    currentUser = null;
    elements.authOverlay.style.display = 'flex';
    elements.waitOverlay.style.display = 'none';
    elements.welcomeSection.style.display = 'block';
    elements.testSection.style.display = 'none';
  }
});

// Подписка на прогресс
function subscribeToProgress(userId) {
  const progressRef = doc(db, COLLECTIONS.PROGRESS, userId);
  
  onSnapshot(progressRef, (doc) => {
    if (doc.exists()) {
      currentProgress[userId] = doc.data();
      
      // Если активен вариант, обновляем UI
      if (currentVariantId) {
        updateProgressUI();
        renderVariantsList();
      }
    }
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
  
  adminContainer.innerHTML = `
    <button id="adminBtn">👑 Админ</button>
  `;
  
  document.getElementById('adminBtn').onclick = showAdminPanel;
}

async function showAdminPanel() {
  // Создаём модальное окно
  const modal = document.createElement('div');
  modal.className = 'admin-modal';
  modal.innerHTML = `
    <div class="admin-modal-content">
      <button class="close-modal">✕</button>
      <h3>👥 Управление пользователями</h3>
      <div id="adminLoading">
        <div class="spinner"></div>
        <p>Загрузка...</p>
      </div>
      <div id="adminUsersList" style="display: none;"></div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.close-modal').onclick = () => {
    document.body.removeChild(modal);
  };
  
  // Загружаем пользователей
  try {
    const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USERS));
    const users = [];
    
    for (const docSnap of usersSnapshot.docs) {
      const data = docSnap.data();
      users.push({
        id: docSnap.id,
        ...data
      });
    }
    
    const listDiv = modal.querySelector('#adminUsersList');
    const loadingDiv = modal.querySelector('#adminLoading');
    
    loadingDiv.style.display = 'none';
    listDiv.style.display = 'block';
    
    listDiv.innerHTML = users.map(u => `
      <div class="admin-user-item">
        <strong>${u.email}</strong>
        <span class="admin-status ${u.allowed ? 'status-allowed' : 'status-pending'}">
          ${u.allowed ? '✅ Доступ открыт' : '⏳ Ожидание'}
        </span>
        <br>
        <small>Пароль: ${u.currentPassword || 'Не установлен'}</small>
        <br>
        <button onclick="toggleUserAccess('${u.id}', ${!u.allowed})">
          ${u.allowed ? 'Закрыть доступ' : 'Открыть доступ'}
        </button>
      </div>
    `).join('');
    
  } catch (e) {
    console.error('Ошибка загрузки пользователей:', e);
  }
}

// Глобальная функция для переключения доступа
window.toggleUserAccess = async function(userId, newAccess) {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
      allowed: newAccess
    });
    alert(`Доступ ${newAccess ? 'открыт' : 'закрыт'}`);
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
};

/* ====== WHATSAPP BUTTON ====== */

function createWhatsAppButton() {
  const btn = document.createElement('a');
  btn.className = 'whatsapp-button';
  btn.innerHTML = '💬';
  btn.href = 'https://wa.me/77718663556?text=Сәлем, биология тест бойынша сұрақ бар';
  btn.target = '_blank';
  btn.title = 'Написать в WhatsApp';
  document.body.appendChild(btn);
}

document.addEventListener('DOMContentLoaded', createWhatsAppButton);

/* ====== SERVICE WORKER (для офлайн) ====== */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => {
    console.log('Service Worker не зарегистрирован:', e);
  });
}

console.log('🎓 Система вариантов тестов загружена');
'''

# Сохраняем в файл
with open('/mnt/kimi/output/app.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print("✅ app.js создан")
print(f"Размер файла: {len(js_content)} символов")
