const socket = io();
let myLogin = '';
let currentChat = 'general';
const typingUsers = new Map();

// ==================== ПЕРЕКЛЮЧЕНИЕ ФОРМ ====================

function showLoginForm() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('login').focus();
}

function showRegisterForm() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
  document.getElementById('register-login').focus();
}

// ==================== РЕГИСТРАЦИЯ ====================

function register() {
  const login = document.getElementById('register-login').value.trim();
  const password = document.getElementById('register-password').value;
  const passwordConfirm = document.getElementById('register-password-confirm').value;
  
  if (!login || !password || !passwordConfirm) {
    showRegisterError('Заполните все поля!');
    return;
  }
  
  socket.emit('register', { login, password, passwordConfirm });
}

socket.on('register_success', () => {
  myLogin = document.getElementById('register-login').value.trim();
  document.getElementById('login-screen').remove();
  document.getElementById('chat-screen').classList.remove('hidden');
  document.getElementById('message').focus();
  
  const registerErrorEl = document.getElementById('register-error');
  if (registerErrorEl) registerErrorEl.textContent = '';
});

socket.on('register_error', (msg) => {
  showRegisterError(msg);
});

function showRegisterError(msg) {
  const errorEl = document.getElementById('register-error');
  if (errorEl) {
    errorEl.textContent = msg;
    setTimeout(() => {
      if (errorEl) errorEl.textContent = '';
    }, 5000);
  }
}

// ==================== ВХОД ====================

function login() {
  const login = document.getElementById('login').value.trim();
  const password = document.getElementById('password').value;
  
  if (!login || !password) {
    showError('Заполните все поля!');
    return;
  }
  
  socket.emit('login', { login, password });
}

socket.on('login_success', () => {
  myLogin = document.getElementById('login').value.trim();
  document.getElementById('login-screen').remove();
  document.getElementById('chat-screen').classList.remove('hidden');
  document.getElementById('message').focus();
  
  const errorEl = document.getElementById('error');
  if (errorEl) errorEl.textContent = '';
});

socket.on('login_error', (msg) => {
  showError(msg);
});

// ==================== СПИСОК ПОЛЬЗОВАТЕЛЕЙ ====================

socket.on('users_update', (users) => {
  const chatsList = document.getElementById('chats-list');
  if (!chatsList) return;
  
  // Сохраняем текущий активный чат
  const savedChat = currentChat;
  
  chatsList.innerHTML = '';
  
  // Общий чат
  const generalChat = document.createElement('div');
  generalChat.className = 'chat-item general';
  if (savedChat === 'general') {
    generalChat.classList.add('active');
  }
  generalChat.dataset.chat = 'general';
  generalChat.innerHTML = `
    <div class="chat-avatar">👥</div>
    <div class="chat-info">
      <div class="chat-name">Общий чат</div>
      <div class="chat-last-message">Все сообщения</div>
    </div>
  `;
  generalChat.addEventListener('click', () => switchChat('general'));
  chatsList.appendChild(generalChat);
  
  // Пользователи
  users.forEach(user => {
    if (user.nickname === myLogin) return;
    
    const chatDiv = document.createElement('div');
    chatDiv.className = 'chat-item';
    if (savedChat === user.nickname) {
      chatDiv.classList.add('active');
    }
    chatDiv.dataset.chat = user.nickname;
    
    const firstLetter = user.nickname.charAt(0).toUpperCase();
    
    chatDiv.innerHTML = `
      <div class="chat-avatar">${firstLetter}</div>
      <div class="chat-info">
        <div class="chat-name">${escapeHtml(user.nickname)}</div>
        <div class="chat-last-message">${user.online ? 'в сети' : 'оффлайн'}</div>
      </div>
    `;
    
    chatDiv.addEventListener('click', () => switchChat(user.nickname));
    chatsList.appendChild(chatDiv);
  });
});

// Переключение между чатами
function switchChat(chatName) {
  console.log('=== switchChat вызван ===');
  console.log('Текущий чат ДО:', currentChat);
  console.log('Переключаемся на:', chatName);
  
  currentChat = chatName;
  
  console.log('Текущий чат ПОСЛЕ:', currentChat);
  
  // Убираем подсветку со ВСЕХ чатов
  const allChats = document.querySelectorAll('.chat-item');
  console.log('Всего чатов:', allChats.length);
  
  allChats.forEach(item => {
    item.classList.remove('active');
    console.log('Убран класс active с:', item.dataset.chat);
  });
  
  // Добавляем подсветку ТОЛЬКО текущему чату
  const activeChat = document.querySelector(`.chat-item[data-chat="${chatName}"]`);
  if (activeChat) {
    activeChat.classList.add('active');
    console.log('Добавлен класс active к:', chatName);
  } else {
    console.log('Чат не найден:', chatName);
  }
  
  // Меняем заголовок
  const chatHeader = document.querySelector('.chat-header h2');
  if (chatHeader) {
    chatHeader.textContent = chatName === 'general' ? '💬 Общий чат' : `💬 ${chatName}`;
  }
  
  // Меняем аватарку
  const headerAvatar = document.querySelector('.chat-header-avatar');
  if (headerAvatar) {
    if (chatName === 'general') {
      headerAvatar.textContent = '👥';
      headerAvatar.style.background = '#66ff00';
    } else {
      headerAvatar.textContent = chatName.charAt(0).toUpperCase();
      headerAvatar.style.background = '#66ff00';
    }
  }
  
  // Очищаем сообщения и загружаем историю
  const messagesDiv = document.getElementById('messages');
  if (messagesDiv) messagesDiv.innerHTML = '';
  
  // Очищаем статус печати
  typingUsers.clear();
  updateTypingDisplay();
  
  // Загружаем историю
  socket.emit('get_history', chatName);
  
  console.log('=== switchChat завершён ===');
}

// ==================== СООБЩЕНИЯ ====================

socket.on('history', (messages) => {
  messages.forEach(msg => addMessage(msg));
});

socket.on('message', (msg) => {
  if (msg.to && msg.to !== 'general') {
    // Приватное сообщение
    if (msg.to === currentChat || msg.from === currentChat) {
      addMessage(msg);
    }
  } else {
    // Общее сообщение
    if (currentChat === 'general') {
      addMessage(msg);
    }
  }
});

socket.on('system_message', (text) => {
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message system';
  msgDiv.textContent = text;
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function addMessage(msg) {
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;
  
  const msgDiv = document.createElement('div');
  const isOwn = msg.nickname === myLogin;
  msgDiv.className = `message ${isOwn ? 'own' : 'other'}`;
  
  // Сохраняем ID сообщения (если есть)
  if (msg.id) {
    msgDiv.dataset.messageId = msg.id;
  }
  
  // Время в 24-часовом формате, Москва
  const time = msg.time || new Date().toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Moscow'
  });
  
  // Метка "изменено" если сообщение редактировалось
  const editedLabel = msg.edited ? '<span class="message-edited">(изменено)</span>' : '';
  
  msgDiv.innerHTML = `
    <div class="message-content">
      <div class="message-header">
        <div class="message-nickname">${escapeHtml(msg.nickname)}</div>
        <div class="message-time">${time}</div>
      </div>
      <div class="message-text">${escapeHtml(msg.text)}</div>
      ${isOwn ? `
        <div class="message-actions">
          <button class="btn-edit" onclick="editMessage(this)">✏️</button>
          <button class="btn-delete" onclick="deleteMessage(this)">🗑️</button>
        </div>
      ` : ''}
    </div>
  `;
  
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
// ==================== ОТПРАВКА СООБЩЕНИЙ ====================

function sendMessage() {
  const input = document.getElementById('message');
  const text = input.value.trim();
  
  if (text) {
    socket.emit('message', { 
      text, 
      to: currentChat === 'general' ? 'general' : currentChat 
    });
    input.value = '';
  }
}

// ==================== СТАТУС ПЕЧАТИ ====================

let typingTimeout = null;
const TYPING_DELAY = 3000;

document.getElementById('message')?.addEventListener('input', () => {
  socket.emit('typing', { isTyping: true });
  
  if (typingTimeout) clearTimeout(typingTimeout);
  
  typingTimeout = setTimeout(() => {
    socket.emit('typing', { isTyping: false });
  }, TYPING_DELAY);
});

socket.on('user_typing', (data) => {
  if (!data.nickname || data.nickname === myLogin) return;
  
  if (data.isTyping) {
    typingUsers.set(data.nickname, true);
  } else {
    typingUsers.delete(data.nickname);
  }
  
  updateTypingDisplay();
});

function updateTypingDisplay() {
  const typingIndicator = document.getElementById('typing-indicator');
  if (!typingIndicator) return;
  
  if (typingUsers.size > 0 && currentChat === 'general') {
    const users = Array.from(typingUsers.keys()).join(', ');
    typingIndicator.textContent = `${users} печатает...`;
    typingIndicator.classList.remove('hidden');
  } else {
    typingIndicator.classList.add('hidden');
  }
}

// ==================== ОБРАБОТЧИКИ КЛАВИАТУРЫ ====================

document.getElementById('message')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

document.getElementById('password')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') login();
});

document.getElementById('register-password-confirm')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') register();
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function showError(msg) {
  const errorEl = document.getElementById('error');
  if (errorEl) {
    errorEl.textContent = msg;
    setTimeout(() => {
      if (errorEl) errorEl.textContent = '';
    }, 5000);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

