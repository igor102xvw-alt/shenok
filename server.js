const fs = require('fs');
const path = require('path');

console.log("Проверка папки public:");
console.log("Путь:", path.join(__dirname, 'public'));
console.log("Существует?", fs.existsSync(path.join(__dirname, 'public')));
console.log("Содержит index.html?", fs.existsSync(path.join(__dirname, 'public', 'index.html')));

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(50) NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблица messages создана');
  } catch (err) {
    console.error('❌ Ошибка создания таблицы:', err);
  }
}

createTables();

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

  // Проверка пароля и ника
  socket.on('login', (data) => {
    if (data.password === SECRET_PASSWORD) {
      socket.nickname = data.nickname || 'Аноним';
      
      // Добавляем пользователя
      users.set(socket.id, {
        nickname: socket.nickname,
        online: true
      });
      
      // Отправляем успех
      socket.emit('login_success');
      
      // Отправляем историю сообщений
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
};
      
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});




