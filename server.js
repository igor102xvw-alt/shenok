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
const users = new Map(); // socket.id -> { nickname, online }
const messages = [];

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
      socket.emit('history', messages);
      
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
  socket.on('message', (text) => {
    if (!socket.nickname) return;
    
    const now = new Date();
    const message = {
      nickname: socket.nickname,
      text: text,
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    messages.push(message);
    
    io.emit('message', message);
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


