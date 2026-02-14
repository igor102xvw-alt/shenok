const fs = require('fs');
const path = require('path');

console.log("Проверка папки public:");
console.log("Путь:", path.join(__dirname, 'public'));
console.log("Существует?", fs.existsSync(path.join(__dirname, 'public')));
console.log("Содержит index.html?", fs.existsSync(path.join(__dirname, 'public', 'index.html')));

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

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

app.use(express.static(path.join(__dirname, 'public')));

// Хранение пользователей
const users = new Map();

async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        login VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Таблицы созданы');
  } catch (err) {
    console.error('❌ Ошибка создания таблиц:', err);
  }
}

createTables();

async function broadcastUsersList() {
  try {
    const allUsersResult = await pool.query(`
      SELECT id, login, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    
    const onlineUsers = Array.from(users.values()).map(user => user.nickname);
    
    const usersList = allUsersResult.rows.map(row => ({
      nickname: row.login,
      online: onlineUsers.includes(row.login)
    }));
    
    io.emit('users_update', usersList);
  } catch (err) {
    console.error('❌ Ошибка загрузки списка пользователей:', err);
  }
}

io.on('connection', (socket) => {
  console.log('Новый пользователь подключился:', socket.id);

  socket.on('typing', (data) => {
    if (!socket.nickname) return;
    
    socket.broadcast.emit('user_typing', {
      nickname: socket.nickname,
      isTyping: data.isTyping
    });
  });

  socket.on('register', async (data) => {
    const { login, password, passwordConfirm } = data;

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
      const existingUser = await pool.query(
        'SELECT * FROM users WHERE login = $1',
        [login]
      );
      
      if (existingUser.rows.length > 0) {
        socket.emit('register_error', 'Такой логин уже существует');
        return;
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const result = await pool.query(
        'INSERT INTO users (login, password_hash) VALUES ($1, $2) RETURNING id, login',
        [login, hashedPassword]
      );
      
      const user = result.rows[0];
      
      socket.userId = user.id;
      socket.nickname = user.login;
      
      users.set(socket.id, {
        nickname: user.login,
        online: true
      });
      
      socket.emit('register_success');
      io.emit('system_message', `${user.login} присоединился к чату`);
      broadcastUsersList();
    } catch (err) {
      console.error('❌ Ошибка регистрации:', err);
      socket.emit('register_error', 'Ошибка сервера. Попробуйте позже.');
    }
  });

  socket.on('login', async (data) => {
    const { login, password } = data;

    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE login = $1',
        [login]
      );
      
      if (result.rows.length === 0) {
        socket.emit('login_error', 'Неверный логин или пароль');
        return;
      }
      
      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password_hash);
      
      if (!isMatch) {
        socket.emit('login_error', 'Неверный логин или пароль');
        return;
      }
      
      socket.userId = user.id;
      socket.nickname = user.login;
      
      users.set(socket.id, {
        nickname: user.login,
        online: true
      });
      
      socket.emit('login_success');
      io.emit('system_message', `${user.login} вошёл в чат`);
      broadcastUsersList();
    } catch (err) {
      console.error('❌ Ошибка входа:', err);
      socket.emit('login_error', 'Ошибка сервера. Попробуйте позже.');
    }
  });

  socket.on('message', async (data) => {
    if (!socket.nickname || !socket.userId) return;

    const text = data.text.trim();
    if (!text) return;

    const to = data.to || 'general';

    const now = new Date();
    const message = {
      nickname: socket.nickname,
      text: text,
      time: now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Moscow'
      })
    };

    if (to === 'general') {
      try {
        await pool.query(
          'INSERT INTO messages (user_id, text) VALUES ($1, $2)',
          [socket.userId, text]
        );
      } catch (err) {
        console.error('❌ Ошибка сохранения общего сообщения:', err);
      }

      io.emit('message', { ...message, to: 'general' });
    } else {
      try {
        const recipientResult = await pool.query(
          'SELECT id FROM users WHERE login = $1',
          [to]
        );

        if (recipientResult.rows.length === 0) {
          console.error('❌ Получатель не найден:', to);
          socket.emit('private_message_error', 'Получатель не найден');
          return;
        }

        const recipientId = recipientResult.rows[0].id;

        await pool.query(
          'INSERT INTO private_messages (sender_id, recipient_id, text) VALUES ($1, $2, $3)',
          [socket.userId, recipientId, text]
        );

        // Отправляем только получателю
        const recipientSocket = Array.from(users.entries()).find(([id, user]) =>
          user.nickname === to
        );

        if (recipientSocket) {
          const [recipientSocketId] = recipientSocket;
          io.to(recipientSocketId).emit('message', { ...message, to, from: socket.nickname });
          socket.emit('message_sent', { ...message, to, from: socket.nickname });
        } else {
          socket.emit('private_message_status', 'offline');
        }
      } catch (err) {
        console.error('❌ Ошибка сохранения приватного сообщения:', err);
      }
    }
  });

  socket.on('get_history', async (chatName) => {
    if (!socket.userId) return;

    if (chatName === 'general') {
      try {
        const result = await pool.query(`
          SELECT u.login as nickname, m.text, m.created_at
          FROM messages m
          JOIN users u ON u.id = m.user_id
          ORDER BY m.created_at DESC
          LIMIT 100
        `);

        const dbMessages = result.rows.map(row => ({
          nickname: row.nickname,
          text: row.text,
          time: new Date(row.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Moscow'
          })
        })).reverse();

        socket.emit('history', dbMessages);
      } catch (err) {
        console.error('❌ Ошибка загрузки истории общего чата:', err);
        socket.emit('history', []);
      }
    } else {
      try {
        const recipientResult = await pool.query(
          'SELECT id FROM users WHERE login = $1',
          [chatName]
        );

        if (recipientResult.rows.length === 0) {
          socket.emit('history', []);
          return;
        }

        const recipientId = recipientResult.rows[0].id;

        const result = await pool.query(`
          SELECT 
            u.login as sender_login,
            pm.text,
            pm.created_at
          FROM private_messages pm
          JOIN users u ON u.id = pm.sender_id
          WHERE (pm.sender_id = $1 AND pm.recipient_id = $2)
             OR (pm.sender_id = $2 AND pm.recipient_id = $1)
          ORDER BY pm.created_at ASC
          LIMIT 100
        `, [socket.userId, recipientId]);

        const dbMessages = result.rows.map(row => ({
          nickname: row.sender_login,
          text: row.text,
          time: new Date(row.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Moscow'
          })
        }));

        socket.emit('history', dbMessages);
      } catch (err) {
        console.error('❌ Ошибка загрузки истории приватного чата:', err);
        socket.emit('history', []);
      }
    }
  });

  socket.on('disconnect', () => {
    if (socket.nickname) {
      console.log(`${socket.nickname} отключился`);
      users.delete(socket.id);
      io.emit('system_message', `${socket.nickname} покинул чат`);
      broadcastUsersList();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
