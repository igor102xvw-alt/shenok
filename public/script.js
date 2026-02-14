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
  console.log('=== Загружена история ===');
  console.log('Количество сообщений:', messages.length);
  console.log('Сообщения:', messages);
  
  messages.forEach(msg => {
    console.log('Добавляем сообщение:', msg);
    addMessage(msg);
  });
});

socket.on('message', (msg) => {
  console.log('=== Получено сообщение ===');
  console.log('Текущий чат:', currentChat);
  console.log('Сообщение:', msg);
  
  if (msg.to && msg.to !== 'general') {
    // Приватное сообщение
    console.log('Это приватное сообщение');
    console.log('msg.to:', msg.to);
    console.log('msg.from:', msg.from);
    console.log('currentChat:', currentChat);
    console.log('Условие 1 (msg.to === currentChat):', msg.to === currentChat);
    console.log('Условие 2 (msg.from === currentChat):', msg.from === currentChat);
    
    if (msg.to === currentChat || msg.from === currentChat) {
      console.log('Добавляем сообщение в чат');
      addMessage(msg);
    } else {
      console.log('Сообщение не для текущего чата, пропускаем');
    }
  } else {
    // Общее сообщение
    console.log('Это общее сообщение');
    if (currentChat === 'general') {
      console.log('Добавляем сообщение в общий чат');
      addMessage(msg);
    } else {
      console.log('Не в общем чате, пропускаем');
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
        ${msg.edited ? '<span class="message-edited">(изменено)</span>' : ''}
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
  
  // Добавляем обработчик правого клика для контекстного меню
  msgDiv.addEventListener('contextmenu', (e) => {
    openContextMenu(e, msgDiv);
  });
  
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

// ==================== РЕДАКТИРОВАНИЕ/УДАЛЕНИЕ СООБЩЕНИЙ ====================

// Редактирование сообщения
function editMessage(btn) {
  const messageDiv = btn.closest('.message');
  const messageTextDiv = messageDiv.querySelector('.message-text');
  const currentText = messageTextDiv.textContent;
  
  const newText = prompt('Редактировать сообщение:', currentText);
  if (newText && newText.trim() !== '' && newText !== currentText) {
    const messageId = messageDiv.dataset.messageId;
    
    // Отправляем запрос на редактирование
    socket.emit('edit_message', {
      id: messageId,
      text: newText.trim(),
      chat: currentChat
    });
  }
}

// Удаление сообщения
function deleteMessage(btn) {
  if (!confirm('Удалить это сообщение?')) {
    return;
  }
  
  const messageDiv = btn.closest('.message');
  const messageId = messageDiv.dataset.messageId;
  
  // Отправляем запрос на удаление
  socket.emit('delete_message', {
    id: messageId,
    chat: currentChat
  });
  
  // Удаляем сообщение визуально
  messageDiv.remove();
}

// Обработка отредактированного сообщения
socket.on('message_edited', (data) => {
  const messageDiv = document.querySelector(`.message[data-message-id="${data.id}"]`);
  if (messageDiv) {
    const messageTextDiv = messageDiv.querySelector('.message-text');
    if (messageTextDiv) {
      messageTextDiv.textContent = data.text;
    }
    
    // Добавляем метку "изменено"
    const editedLabel = messageDiv.querySelector('.message-edited');
    if (!editedLabel) {
      const label = document.createElement('span');
      label.className = 'message-edited';
      label.textContent = '(изменено)';
      messageDiv.querySelector('.message-time').after(label);
    }
  }
});

// Обработка удалённого сообщения
socket.on('message_deleted', (data) => {
  const messageDiv = document.querySelector(`.message[data-message-id="${data.id}"]`);
  if (messageDiv) {
    messageDiv.remove();
  }
});

// ==================== КОНТЕКСТНОЕ МЕНЮ ====================

let contextMenu = null;
let contextMenuOverlay = null;
let currentMessageElement = null;

// Создаём контекстное меню при загрузке
function initContextMenu() {
  contextMenu = document.createElement('div');
  contextMenu.className = 'context-menu';
  contextMenu.innerHTML = `
    <div class="context-menu-item" onclick="contextMenuReply()">
      <span>💬</span> Ответить
    </div>
    <div class="context-menu-item" onclick="contextMenuEdit()">
      <span>✏️</span> Редактировать
    </div>
    <div class="context-menu-item" onclick="contextMenuDelete()">
      <span>🗑️</span> Удалить
    </div>
  `;
  document.body.appendChild(contextMenu);
  
  contextMenuOverlay = document.createElement('div');
  contextMenuOverlay.className = 'context-menu-overlay';
  document.body.appendChild(contextMenuOverlay);
  
  // Закрываем меню при клике вне его
  contextMenuOverlay.addEventListener('click', () => {
    contextMenu.classList.remove('active');
    contextMenuOverlay.classList.remove('active');
  });
}

// Открываем контекстное меню
function openContextMenu(event, messageElement) {
  event.preventDefault();
  
  currentMessageElement = messageElement;
  
  const rect = messageElement.getBoundingClientRect();
  
  contextMenu.style.left = `${rect.left}px`;
  contextMenu.style.top = `${rect.bottom + 5}px`;
  
  contextMenu.classList.add('active');
  contextMenuOverlay.classList.add('active');
}

// Закрываем контекстное меню
function closeContextMenu() {
  contextMenu.classList.remove('active');
  contextMenuOverlay.classList.remove('active');
  currentMessageElement = null;
}

// Действия контекстного меню
function contextMenuReply() {
  if (!currentMessageElement) return;
  
  const nickname = currentMessageElement.querySelector('.message-nickname').textContent;
  const messageText = currentMessageElement.querySelector('.message-text').textContent;
  
  // Сохраняем информацию о цитате
  const quoteData = {
    nickname: nickname,
    text: messageText
  };
  
  // Сохраняем в локальном хранилище
  localStorage.setItem('quoteData', JSON.stringify(quoteData));
  
  // Добавляем @username в поле ввода
  const input = document.getElementById('message');
  input.value = `@${nickname} `;
  input.focus();
  
  // Показываем превью цитаты над полем ввода
  showQuotePreview(quoteData);
  
  closeContextMenu();
}

// Показываем превью цитаты
function showQuotePreview(quoteData) {
  const inputArea = document.querySelector('.input-area');
  if (!inputArea) return;
  
  // Удаляем старую цитату если есть
  const existingQuote = document.querySelector('.quote-preview');
  if (existingQuote) existingQuote.remove();
  
  const quotePreview = document.createElement('div');
  quotePreview.className = 'quote-preview';
  quotePreview.innerHTML = `
    <div class="quote-preview-header">
      <span class="quote-icon">💬</span>
      <span class="quote-nickname">${escapeHtml(quoteData.nickname)}</span>
      <button class="quote-remove" onclick="removeQuotePreview()">✕</button>
    </div>
    <div class="quote-preview-text">${escapeHtml(quoteData.text)}</div>
  `;
  
  inputArea.parentNode.insertBefore(quotePreview, inputArea);
}

// Удаляем превью цитаты
function removeQuotePreview() {
  const quotePreview = document.querySelector('.quote-preview');
  if (quotePreview) quotePreview.remove();
  localStorage.removeItem('quoteData');
}

function contextMenuEdit() {
  if (!currentMessageElement) return;
  
  const messageTextDiv = currentMessageElement.querySelector('.message-text');
  const currentText = messageTextDiv.textContent;
  
  const newText = prompt('Редактировать сообщение:', currentText);
  if (newText && newText.trim() !== '' && newText !== currentText) {
    const messageId = currentMessageElement.dataset.messageId;
    
    socket.emit('edit_message', {
      id: messageId,
      text: newText.trim(),
      chat: currentChat
    });
  }
  
  closeContextMenu();
}

function contextMenuDelete() {
  if (!currentMessageElement) return;
  
  if (!confirm('Удалить это сообщение?')) {
    closeContextMenu();
    return;
  }
  
  const messageId = currentMessageElement.dataset.messageId;
  
  socket.emit('delete_message', {
    id: messageId,
    chat: currentChat
  });
  
  currentMessageElement.remove();
  closeContextMenu();
}

// Инициализируем контекстное меню при загрузке
document.addEventListener('DOMContentLoaded', initContextMenu);









