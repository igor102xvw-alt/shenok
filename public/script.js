const socket = io();
let myNickname = '';

// ==================== ЭКРАН ВХОДА ====================

function login() {
  const password = document.getElementById('password').value;
  const nickname = document.getElementById('nickname').value || 'Я';
  
  if (!password) {
    showError('Введите пароль!');
    return;
  }
  
  socket.emit('login', { password, nickname });
}

socket.on('login_success', () => {
  myNickname = document.getElementById('nickname').value || 'Я';
  
  // Удаляем экран входа
  document.getElementById('login-screen').remove();
  
  // Показываем чат
  document.getElementById('chat-screen').classList.remove('hidden');
  
  // Фокус на поле ввода
  document.getElementById('message').focus();
});

socket.on('login_error', (msg) => {
  showError(msg);
});

// ==================== СПИСОК ПОЛЬЗОВАТЕЛЕЙ ====================

// Текущий активный чат
let currentChat = 'general'; // 'general' или ник пользователя

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
    if (user.nickname === myNickname) return; // Не показываем себя
    
    const chatDiv = document.createElement('div');
    chatDiv.className = `chat-item ${currentChat === user.nickname ? 'active' : ''}`;
    chatDiv.dataset.chat = user.nickname;
    
    // Первая буква ника как аватарка
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
  currentChat = chatName;
  
  // Обновляем выделение
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.chat === chatName) {
      item.classList.add('active');
    }
  });
  
  // Меняем заголовок чата
  const chatHeader = document.querySelector('.chat-header h2');
  if (chatName === 'general') {
    chatHeader.textContent = '💬 Общий чат';
  } else {
    chatHeader.textContent = `💬 ${chatName}`;
  }
  
  // Очищаем сообщения и загружаем нужные
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = '';
  
  // Если общий чат — загружаем историю
  if (chatName === 'general') {
    socket.emit('get_history', 'general');
  } else {
    socket.emit('get_history', chatName);
  }
}

// ==================== СООБЩЕНИЯ ====================

socket.on('history', (messages) => {
  messages.forEach(msg => addMessage(msg));
});

socket.on('message', (msg) => {
  addMessage(msg);
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
  const isOwn = msg.nickname === myNickname;
  msgDiv.className = `message ${isOwn ? 'own' : 'other'}`;
  
  const now = new Date();
  const time = msg.time || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
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
  const typingIndicator = document.getElementById('typing-indicator');
  
  if (data.isTyping) {
    typingIndicator.textContent = `${data.nickname} печатает...`;
    typingIndicator.classList.remove('hidden');
  } else {
    typingIndicator.classList.add('hidden');
  }
});

// Enter для отправки
document.getElementById('message')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

document.getElementById('password')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') login();
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function showError(msg) {
  const errorEl = document.getElementById('error');
  if (errorEl) {
    errorEl.textContent = msg;
    setTimeout(() => {
      if (errorEl) errorEl.textContent = '';
    }, 3000);
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


