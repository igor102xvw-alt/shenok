const fs = require('fs');
const path = require('path');

console.log("Проверка папки public:");
console.log("Путь:", path.join(__dirname, 'public'));
console.log("Существует?", fs.existsSync(path.join(__dirname, 'public')));
console.log("Содержит index.html?", fs.existsSync(path.join(__dirname, 'public', 'index.html')));const express = require('express');

const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Настройки
const PORT = 3001;
const SECRET_PASSWORD = process.env.CHAT_PASSWORD || "secretparol322";

// Храним сообщения в памяти
const messages = [];

// Раздаём статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Обработка подключений
io.on('connection', (socket) => {
  console.log('Новый пользователь подключился');

  // Проверка пароля и ника
  socket.on('login', (data) => {
    if (data.password === SECRET_PASSWORD) {
      socket.nickname = data.nickname || 'Аноним';
      socket.emit('login_success');
      
      // Отправляем историю сообщений
      socket.emit('history', messages);
      
      // Сообщаем всем о новом пользователе
      io.emit('system_message', `${socket.nickname} присоединился к чату`);
      console.log(`${socket.nickname} вошёл в чат`);
    } else {
      socket.emit('login_error', 'Неверный пароль!');
    }
  });

  // Получение сообщения
  socket.on('message', (text) => {
    if (!socket.nickname) return;
    
    const message = {
      nickname: socket.nickname,
      text: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    messages.push(message);
    
    io.emit('message', message);
  });

  // Отключение
  socket.on('disconnect', () => {
    if (socket.nickname) {
      console.log(`${socket.nickname} отключился`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});