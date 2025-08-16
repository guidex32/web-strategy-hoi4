// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MySQL подключение ---
const pool = mysql.createPool({
  host: '51.38.13.75',
  user: 'gs10071',
  password: 'fCEJNemIUB',
  database: 'gs10071', // проверь имя базы
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// --- Middleware ---
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Отдаём фронт ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API: регистрация и вход ---
app.post('/auth', async (req, res) => {
  const { op, login, password } = req.body;
  if (!login || !password) return res.json({ ok: false, msg: 'Введите логин и пароль' });

  try {
    if (op === 'register') {
      const hash = await bcrypt.hash(password, 10);
      await pool.query('INSERT INTO users (login, password) VALUES (?, ?)', [login, hash]);
      return res.json({ ok: true, msg: 'Регистрация успешна' });
    } else if (op === 'login') {
      const [rows] = await pool.query('SELECT * FROM users WHERE login = ?', [login]);
      if (rows.length === 0) return res.json({ ok: false, msg: 'Пользователь не найден' });

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.json({ ok: false, msg: 'Неверный пароль' });

      return res.json({ ok: true, login: user.login, role: user.role });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, msg: 'Ошибка сервера' });
  }
});

// --- API: страны ---
app.get('/countries', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM countries');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Ошибка сервера' });
  }
});

// --- API: админ логи ---
app.get('/logs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 100');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Ошибка сервера' });
  }
});

// --- Запуск ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
