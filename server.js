const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const SECRET = 'supersecret'; // поменяй для безопасности

// подключение к MySQL
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'strategy',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// middleware для проверки токена
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ ok: false, message: 'Нет токена' });
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: 'Неверный токен' });
  }
}

// регистрация
app.post('/register', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.json({ ok: false, message: 'Заполните все поля' });
  const hash = await bcrypt.hash(password, 10);

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE login=?', [login]);
    if (rows.length > 0) return res.json({ ok: false, message: 'Логин занят' });

    await pool.query('INSERT INTO users(login, password, role) VALUES(?,?,?)', [login, hash, 'user']);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, message: e.message });
  }
});

// вход
app.post('/login', async (req, res) => {
  const { login, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE login=?', [login]);
    if (rows.length === 0) return res.json({ ok: false, message: 'Пользователь не найден' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ ok: false, message: 'Неверный пароль' });

    const token = jwt.sign({ id: user.id, login: user.login, role: user.role }, SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token });
  } catch (e) {
    res.json({ ok: false, message: e.message });
  }
});

// API для карты и админки
app.post('/api', verifyToken, async (req, res) => {
  const { op } = req.body;

  try {
    // переключение экономики
    if (op === 'toggle_economy') {
      const [rows] = await pool.query('SELECT * FROM countries WHERE owner=?', [req.user.id]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });

      const country = rows[0];
      const newVal = country.economy ? 0 : 1;
      await pool.query('UPDATE countries SET economy=? WHERE id=?', [newVal, country.id]);
      return res.json({ ok: true, value: newVal });
    }

    // создать страну
    if (op === 'create_country') {
      const { name, flag, x, y } = req.body;
      const [result] = await pool.query(
        'INSERT INTO countries(name,flag,owner,x,y,economy,points) VALUES(?,?,?,?,?,?,?)',
        [name, flag, req.user.id, x, y, 1, 0]
      );
      return res.json({ ok: true, id: result.insertId });
    }

    // назначить владельца
    if (op === 'assign_owner') {
      if (req.user.role !== 'admin') return res.json({ ok: false, message: 'Нет прав' });

      const { countryId, login } = req.body;
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?', [countryId]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });

      const [users] = await pool.query('SELECT * FROM users WHERE login=?', [login]);
      if (users.length === 0) return res.json({ ok: false, message: 'Пользователь не найден' });

      await pool.query('UPDATE countries SET owner=? WHERE id=?', [users[0].id, countryId]);
      return res.json({ ok: true });
    }

    // выдать очки
    if (op === 'give_points') {
      if (req.user.role !== 'admin') return res.json({ ok: false, message: 'Нет прав' });

      const { countryId, amount } = req.body;
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?', [countryId]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });

      const newPoints = rows[0].points + Number(amount);
      await pool.query('UPDATE countries SET points=? WHERE id=?', [newPoints, countryId]);
      return res.json({ ok: true });
    }

    return res.json({ ok: false, message: 'Неизвестная операция' });
  } catch (e) {
    res.json({ ok: false, message: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
