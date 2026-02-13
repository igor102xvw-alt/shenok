const socket = io();
let myLogin = ''; // Теперь храним логин вместо ника

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
  
  // Удаляем экран входа
  document.getElementById('login-screen').remove();
  
  // Показываем чат
  document.getElementById('chat-screen').classList.remove('hidden');
  
  // Фокус на поле ввода
  document.getElementById('message').focus();
  
  // Очищаем ошибки
  document.getElementById('register-error').textContent = '';
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
  
  // Удаляем экран входа
  document.getElementById('login-screen').remove();
  
  // Показываем чат
  document.getElementById('chat-screen').classList.remove('hidden');
  
  // Фокус на поле ввода
  document.getElementById('message').focus();
  
  // Очищаем ошибки
  document.getElementById('error').textContent = '';
});

socket.on('login_error', (msg) => {
  showError(msg);
});

// ==================== СПИСОК ПОЛЬЗОВАТЕЛЕЙ ====================

socket.on('users_update', (users) => {
  const chatsList = document.getElementById('chats-list');
  chatsList.innerHTML = '';
  
  // Добавляем "Общий чат" в начало
  const generalChat = document.createElement('div');
  generalChat.className = `chat-item general ${currentChat === 'general' ? 'active' : ''}`;
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
  
  // Добавляем пользователей как приватные чаты
  users.forEach(user => {
    if (user.nickname === myLogin) return; // Не показываем себя
    
    const chatDiv = document.createElement('div');
    chatDiv.className = `chat-item ${currentChat === user.nickname ? 'active' : ''}`;
    chatDiv.dataset.chat = user.nickname;
    
    // Первая буква логина как аватарка
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
  console.log('switchChat вызван:', chatName);
  
  currentChat = chatName;
  
  // Убираем подсветку со всех чатов
  const allChats = document.querySelectorAll('.chat-item');
  console.log('Всего чатов:', allChats.length);
  
  allChats.forEach(item => {
    item.classList.remove('active');
    console.log('Убран класс active с:', item.dataset.chat);
  });
  
  // Добавляем подсветку только текущему чату
  const activeChat = document.querySelector(`.chat-item[data-chat="${chatName}"]`);
  if (activeChat) {
    activeChat.classList.add('active');
    console.log('Добавлен класс active к:', chatName);
  } else {
    console.log('Чат не найден:', chatName);
  }
  
  // Меняем заголовок чата
  const chatHeader = document.querySelector('.chat-header h2');
  if (chatHeader) {
    if (chatName === 'general') {
      chatHeader.textContent = '💬 Общий чат';
    } else {
      chatHeader.textContent = `💬 ${chatName}`;
    }
  }
  
  // Обновляем аватарку в заголовке
  const headerAvatar = document.querySelector('.chat-header-avatar');
  if (headerAvatar) {
    if (chatName === 'general') {
      headerAvatar.textContent = '👥';
      headerAvatar.style.background = '#66ff00';
    } else {
      // Первая буква логина
      const firstLetter = chatName.charAt(0).toUpperCase();
      headerAvatar.textContent = firstLetter;
      headerAvatar.style.background = '#66ff00';
    }
  }
  
  // Очищаем сообщения и загружаем нужные
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = '';
  
  // Очищаем статус печати
  typingUsers.clear();
  updateTypingDisplay();
  
  // Запрашиваем историю для текущего чата
  socket.emit('get_history', chatName);
}

// ==================== СООБЩЕНИЯ ====================

socket.on('history', (messages) => {
  messages.forEach(msg => addMessage(msg));
});

socket.on('message', (msg) => {
  // Фильтруем сообщения только для текущего чата
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
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message system';
  msgDiv.textContent = text;
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function addMessage(msg) {
  const messagesDiv = document.getElementById('messages');
  const msgDiv = document.createElement('div');
  
  // Определяем, чьё сообщение
  const isOwn = msg.nickname === myLogin;
  msgDiv.className = `message ${isOwn ? 'own' : 'other'}`;
  
  // Форматируем время в 24-часовом формате
  const now = new Date();
  const time = msg.time || now.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Moscow'
  });
  
  msgDiv.innerHTML = `
    <div class="message-content">
      <div class="message-header">
        <div class="message-nickname">${escapeHtml(msg.nickname)}</div>
        <div class="message-time">${time}</div>
      </div>
      <div class="message-text">${escapeHtml(msg.text)}</div>
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
    // Отправляем сообщение в текущий чат
    if (currentChat === 'general') {
      socket.emit('message', { text, to: 'general' });
    } else {
      socket.emit('message', { text, to: currentChat });
    }
    input.value = '';
  }
}

// ==================== СТАТУС ПЕЧАТИ ====================

let typingTimeout = null;
const TYPING_DELAY = 3000; // 3 секунды неактивности = перестал печатать

document.getElementById('message')?.addEventListener('input', () => {
  // Пользователь начал печатать
  socket.emit('typing', { isTyping: true });
  
  // Сбросить таймер
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
  
  // Если 3 секунды не печатает — отправить "перестал печатать"
  typingTimeout = setTimeout(() => {
    socket.emit('typing', { isTyping: false });
  }, TYPING_DELAY);
});

// Получение статуса от других пользователей
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
  
  // Показываем только в текущем активном чате
  if (typingUsers.size > 0) {
    const users = Array.from(typingUsers.keys()).join(', ');
    typingIndicator.textContent = `${users} печатает...`;
    typingIndicator.classList.remove('hidden');
  } else {
    typingIndicator.classList.add('hidden');
  }
}

// Enter для отправки
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

