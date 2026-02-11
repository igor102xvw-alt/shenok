const socket = io();
let myNickname = '';

// Login
function login() {
  const password = document.getElementById('password').value;
  const nickname = document.getElementById('nickname').value || 'Я';
  
  if (!password) {
    showError('Введите пароль!');
    return;
  }
  
  socket.emit('login', { password, nickname });
}

// Login events
socket.on('login_success', () => {
  myNickname = document.getElementById('nickname').value || 'Я';
  
  // Удаляем экран входа
  document.getElementById('login-screen').remove();
  
  // Показываем чат
  document.getElementById('chat-screen').classList.remove('hidden');
  document.getElementById('message').focus();
});

socket.on('login_error', (msg) => {
  showError(msg);
});

// Messages
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
  msgDiv.className = 'message' + (msg.nickname === myNickname ? ' own' : '');
  
  msgDiv.innerHTML = `
    <div class="message-content">
      <div class="nickname">${msg.nickname}</div>
      <div class="text">${escapeHtml(msg.text)}</div>
      <div class="time">${msg.time}</div>
    </div>
  `;
  
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

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

// Вспомогательные функции
function showError(msg) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = msg;
  setTimeout(() => { errorEl.textContent = ''; }, 3000);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}