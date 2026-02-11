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

socket.on('users_update', (users) => {
  const usersList = document.getElementById('users-list');
  usersList.innerHTML = '';
  
  users.forEach(user => {
    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';
    if (user.nickname === myNickname) {
      userDiv.classList.add('active');
    }
    
    // Первая буква ника как аватарка
    const firstLetter = user.nickname.charAt(0).toUpperCase();
    
    userDiv.innerHTML = `
      <div class="user-avatar">${firstLetter}</div>
      <div class="user-info">
        <div class="user-nickname">${escapeHtml(user.nickname)}</div>
        <div class="user-status ${user.online ? 'online' : ''}">
          ${user.online ? 'в сети' : 'оффлайн'}
        </div>
      </div>
    `;
    
    usersList.appendChild(userDiv);
  });
});

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
    socket.emit('message', text);
    input.value = '';
  }
}

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
