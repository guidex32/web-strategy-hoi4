const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MySQL ---
const dbConfig = {
  host: '51.38.13.75',
  user: 'gs10071',
  password: 'fCEJNemIUB',
  database: 'gs10071',
  port: 3306,
};

let pool;
(async () => {
  pool = await mysql.createPool(dbConfig);
  pool.on('error', err => console.error('MySQL pool error:', err));
})();

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const SECRET = 'supersecretkey123';

// --- Helper: verify token ---
async function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ ok: false, message: 'No token' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ ok: false, message: 'Invalid token' });
  }
}

// --- Auth routes ---
app.post('/api/auth', async (req, res) => {
  try {
    const { op, login, password } = req.body;

    if (!login || !password) return res.json({ ok: false, message: 'Введите логин и пароль' });

    if (op === 'register') {
      const [rows] = await pool.query('SELECT * FROM user WHERE login=?', [login]);
      if (rows.length) return res.json({ ok: false, message: 'Логин занят' });

      await pool.query('INSERT INTO user(login, password, role) VALUES(?,?,?)', [login, password, 'player']);
      const [newUser] = await pool.query('SELECT * FROM user WHERE login=?', [login]);
      const token = jwt.sign({ id: newUser[0].id, login: newUser[0].login, role: newUser[0].role }, SECRET);
      return res.json({ ok: true, token, user: newUser[0] });
    }

    if (op === 'login') {
      const [rows] = await pool.query('SELECT * FROM user WHERE login=? AND password=?', [login, password]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Неверный логин или пароль' });

      const user = rows[0];
      const token = jwt.sign({ id: user.id, login: user.login, role: user.role }, SECRET);
      return res.json({ ok: true, token, user });
    }

    if (op === 'session') {
      if (!req.user) return res.json({ ok: false });
      return res.json({ ok: true, user: req.user });
    }

    res.json({ ok: false, message: 'Неизвестная операция' });
  } catch (e) {
    console.error('Ошибка в /api/auth:', e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

// --- Countries ---
app.get('/api/countries', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM countries');
    const countries = {};
    rows.forEach(c => {
      countries[c.id] = {
        id: c.id,
        name: c.name,
        owner: c.owner,
        economy: c.economy,
        army: JSON.parse(c.army || '{}'),
        status: c.status,
        points: c.points,
        x: c.x || 0,
        y: c.y || 0
      };
    });
    res.json(countries);
  } catch (e) {
    console.error(e);
    res.json({ ok: false, message: e.message });
  }
});

// --- Actions ---
app.post('/api', verifyToken, async (req, res) => {
  try {
    const { op, countryId, unit, cost, attackerId, defenderId, name, x, y, amount, login } = req.body;

    // --- Toggle economy ---
    if (op === 'toggle_economy') {
      const [rows] = await pool.query('SELECT value FROM settings WHERE name="economy"');
      let val = rows.length ? rows[0].value === '1' : true;
      val = !val;
      await pool.query('INSERT INTO settings(name,value) VALUES("economy",?) ON DUPLICATE KEY UPDATE value=?', [val ? 1 : 0, val ? 1 : 0]);
      return res.json({ ok: true, value: val });
    }

    // --- Buy unit ---
    if (op === 'buy_unit') {
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?', [countryId]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });
      let army = JSON.parse(rows[0].army || '{}');
      army[unit] = (army[unit] || 0) + 1;
      await pool.query('UPDATE countries SET army=? WHERE id=?', [JSON.stringify(army), countryId]);
      return res.json({ ok: true });
    }

    // --- Declare war ---
    if (op === 'declare_war') {
      await pool.query('UPDATE countries SET status=? WHERE id=?', ['war', defenderId]);
      return res.json({ ok: true });
    }

    // --- Attack ---
    if (op === 'attack') {
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?', [defenderId]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });
      let points = rows[0].points || 0;
      points = Math.max(points - 10, 0);
      await pool.query('UPDATE countries SET points=? WHERE id=?', [points, defenderId]);
      return res.json({ ok: true, lost: 10 });
    }

    // --- Create country ---
    if (op === 'create_country' && req.user.role === 'owner') {
      if (!name || /[0-9]/.test(name)) return res.json({ ok: false, message: 'Неправильное название' });
      await pool.query('INSERT INTO countries(name,economy,army,status,points,x,y,owner) VALUES(?,?,?,?,?,?,?,?)',
        [name, 0, '{}', 'peace', 0, x, y, req.user.login]);
      return res.json({ ok: true });
    }

    // --- Assign owner ---
    if (op === 'assign_owner' && req.user.role === 'owner') {
      const [crows] = await pool.query('SELECT * FROM countries WHERE id=?', [countryId]);
      if (crows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });
      const [urows] = await pool.query('SELECT * FROM user WHERE login=?', [login]);
      if (urows.length === 0) return res.json({ ok: false, message: 'Пользователь не найден' });
      await pool.query('UPDATE countries SET owner=? WHERE id=?', [login, countryId]);
      return res.json({ ok: true });
    }

    // --- Give points ---
    if (op === 'give_points') {
      if (req.user.role === 'admin') {
        const last = global.lastGive || 0;
        if (Date.now() - last < 60000) return res.json({ ok: false, message: 'Подождите 1 мин перед повторной выдачей' });
        global.lastGive = Date.now();
      }
      const [crow] = await pool.query('SELECT * FROM countries WHERE id=?', [countryId]);
      if (crow.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });
      if (isNaN(amount)) return res.json({ ok: false, message: 'Только число' });
      let points = (crow[0].points || 0) + parseInt(amount);
      await pool.query('UPDATE countries SET points=? WHERE id=?', [points, countryId]);
      return res.json({ ok: true });
    }

    res.json({ ok: false, message: 'Неизвестная операция' });
  } catch (e) {
    console.error('Ошибка в /api:', e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

// --- Logs ---
app.get('/logs', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.json([]);
  try {
    const [rows] = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.json([]);
  }
});

// --- Front ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start ---
app.listen(PORT, () => console.log('Server running on port ' + PORT));
