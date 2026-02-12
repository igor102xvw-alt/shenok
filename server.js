const fs = require('fs');
const path = require('path');

console.log("Проверка папки public:");
console.log("Путь:", path.join(__dirname, 'public'));
console.log("Существует?", fs.existsSync(path.join(__dirname, 'public')));
console.log("Содержит index.html?", fs.existsSync(path.join(__dirname, 'public', 'index.html')));

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

// Хэширование паролей
const bcrypt = require('bcrypt');

// Подключение к базе данных
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Проверка подключения к БД
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Ошибка подключения к базе данных:', err);
  } else {
    console.log('✅ Подключено к базе данных PostgreSQL');
    release();
  }
});

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Пароль для входа
const SECRET_PASSWORD = process.env.CHAT_PASSWORD || "supersecret123";

// Подключаем статику
app.use(express.static(path.join(__dirname, 'public')));

// Храним пользователей и сообщения
const users = new Map();
const messages = [];

// Храним приватные сообщения
const privateMessages = new Map(); // ключ: "от_кому", значение: массив сообщений

// Создание таблиц при запуске
async function createTables() {
  try {
    // Таблица пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        login VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Таблица сообщений (обновлённая)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Таблицы users и messages созданы');
  } catch (err) {
    console.error('❌ Ошибка создания таблиц:', err);
  }
}

// Отправка списка пользователей всем клиентам
function broadcastUsersList() {
  const usersList = Array.from(users.values()).map(user => ({
    nickname: user.nickname,
    online: user.online
  }));
  
  io.emit('users_update', usersList);
}

// Обработка подключений
io.on('connection', (socket) => {
  console.log('Новый пользователь подключился:', socket.id);

  // Статус печати
socket.on('typing', (data) => {
  if (!socket.nickname) return;
  
  // Отправляем статус всем, кроме отправителя
  socket.broadcast.emit('user_typing', {
    nickname: socket.nickname,
    isTyping: data.isTyping
  });
});

 // Регистрация нового пользователя
socket.on('register', async (data) => {
  const { login, password, passwordConfirm } = data;
  
  // Валидация
  if (login.length < 3 || login.length > 20) {
    socket.emit('register_error', 'Логин должен быть от 3 до 20 символов');
    return;
  }
  
  if (!/^[a-zA-Z0-9]+$/.test(login)) {
    socket.emit('register_error', 'Логин может содержать только буквы и цифры');
    return;
  }
  
  if (password.length < 6) {
    socket.emit('register_error', 'Пароль должен быть минимум 6 символов');
    return;
  }
  
  if (password !== passwordConfirm) {
    socket.emit('register_error', 'Пароли не совпадают');
    return;
  }
  
  try {
    // Проверяем, существует ли пользователь
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE login = $1',
      [login]
    );
    
    if (existingUser.rows.length > 0) {
      socket.emit('register_error', 'Такой логин уже существует');
      return;
    }
    
    // Хэшируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Создаём пользователя
    const result = await pool.query(
      'INSERT INTO users (login, password_hash) VALUES ($1, $2) RETURNING id, login',
      [login, hashedPassword]
    );
    
    const user = result.rows[0];
    
    // Сохраняем данные пользователя в сокете
    socket.userId = user.id;
    socket.nickname = user.login;
    
    // Добавляем пользователя в список онлайн
    users.set(socket.id, {
      nickname: user.login,
      online: true
    });
    
    // Отправляем успех
    socket.emit('register_success');
    
    // Сообщаем всем о новом пользователе
    io.emit('system_message', `${user.login} присоединился к чату`);
    
    // Обновляем список пользователей
    broadcastUsersList();
    
    console.log(`✅ Пользователь ${user.login} зарегистрировался`);
  } catch (err) {
    console.error('❌ Ошибка регистрации:', err);
    socket.emit('register_error', 'Ошибка сервера. Попробуйте позже.');
  }
});

// Вход существующего пользователя
socket.on('login', async (data) => {
  const { login, password } = data;
  
  try {
    // Ищем пользователя
    const result = await pool.query(
      'SELECT * FROM users WHERE login = $1',
      [login]
    );
    
    if (result.rows.length === 0) {
      socket.emit('login_error', 'Неверный логин или пароль');
      return;
    }
    
    const user = result.rows[0];
    
    // Проверяем пароль
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      socket.emit('login_error', 'Неверный логин или пароль');
      return;
    }
    
    // Сохраняем данные пользователя в сокете
    socket.userId = user.id;
    socket.nickname = user.login;
    
    // Добавляем пользователя в список онлайн
    users.set(socket.id, {
      nickname: user.login,
      online: true
    });
    
    // Отправляем успех
    socket.emit('login_success');
    
    // Сообщаем всем о входе пользователя
    io.emit('system_message', `${user.login} вошёл в чат`);
    
    // Обновляем список пользователей
    broadcastUsersList();
    
    console.log(`✅ Пользователь ${user.login} вошёл в систему`);
  } catch (err) {
    console.error('❌ Ошибка входа:', err);
    socket.emit('login_error', 'Ошибка сервера. Попробуйте позже.');
  }
});
    
    // Сообщаем всем о новом пользователе
    io.emit('system_message', `${socket.nickname} присоединился к чату`);
    
    // Обновляем список пользователей для всех
    broadcastUsersList();
    
    console.log(`${socket.nickname} вошёл в чат`);
  } else {
    socket.emit('login_error', 'Неверный пароль!');
  }
});

// Получение сообщения
socket.on('message', async (data) => {
  if (!socket.nickname) return;
  
  const text = data.text;
  const to = data.to || 'general'; // 'general' или ник получателя
  
  const now = new Date();
  const message = {
    nickname: socket.nickname,
    text: text,
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  
  if (to === 'general') {
    // Общее сообщение
    try {
      await pool.query(
        'INSERT INTO messages (nickname, text) VALUES ($1, $2)',
        [socket.nickname, text]
      );
      console.log('✅ Сообщение сохранено в БД');
    } catch (err) {
      console.error('❌ Ошибка сохранения сообщения:', err);
    }
    
    messages.push(message);
    if (messages.length > 100) {
      messages.shift();
    }
    
    io.emit('message', { ...message, to: 'general' });
  } else {
    // Приватное сообщение
    const key = `${socket.nickname}_${to}`;
    const reverseKey = `${to}_${socket.nickname}`;
    
    if (!privateMessages.has(key)) {
      privateMessages.set(key, []);
    }
    
    privateMessages.get(key).push(message);
    
    // Отправляем сообщение обоим участникам
    io.to(socket.id).emit('message', { ...message, to, from: socket.nickname });
    
    // Находим сокет получателя
    const recipientSocket = Array.from(users.entries()).find(([id, user]) => 
      user.nickname === to
    );
    
    if (recipientSocket) {
      const [recipientId] = recipientSocket;
      io.to(recipientId).emit('message', { ...message, to, from: socket.nickname });
    }
  }
});

// Загрузка истории чата
socket.on('get_history', async (chatName) => {
  if (chatName === 'general') {
    // Загружаем историю из БД
    try {
      const result = await pool.query(
        'SELECT nickname, text, created_at FROM messages ORDER BY created_at DESC LIMIT 100'
      );
      
      const dbMessages = result.rows.map(row => ({
        nickname: row.nickname,
        text: row.text,
        time: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })).reverse();
      
      socket.emit('history', dbMessages);
    } catch (err) {
      console.error('❌ Ошибка загрузки истории:', err);
      socket.emit('history', messages);
    }
  } else {
    // Загружаем приватные сообщения
    const key1 = `${socket.nickname}_${chatName}`;
    const key2 = `${chatName}_${socket.nickname}`;
    
    let chatMessages = [];
    
    if (privateMessages.has(key1)) {
      chatMessages = [...privateMessages.get(key1)];
    }
    if (privateMessages.has(key2)) {
      chatMessages = [...chatMessages, ...privateMessages.get(key2)];
    }
    
    chatMessages.sort((a, b) => 
      new Date('1970-01-01 ' + a.time) - new Date('1970-01-01 ' + b.time)
    );
    
    socket.emit('history', chatMessages.slice(-100));
  }
});

// Отключение пользователя
socket.on('disconnect', () => {
  if (socket.nickname) {
    console.log(`${socket.nickname} отключился`);
    
    // Удаляем пользователя
    users.delete(socket.id);
    
    // Сообщаем всем об отключении
    io.emit('system_message', `${socket.nickname} покинул чат`);
    
    // Обновляем список пользователей
    broadcastUsersList();
  }
});

  });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});











