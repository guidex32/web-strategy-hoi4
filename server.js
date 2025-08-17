// server.js (ПФ)
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
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
  try {
    pool = await mysql.createPool(dbConfig);
    console.log('[DB] pool ready');
  } catch (e) {
    console.error('[DB] connection error:', e.message);
    process.exit(1);
  }
})();

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// healthcheck
app.get('/test', (_req, res) => res.json({ ok: true, msg: 'Server is alive' }));

const SECRET = 'supersecretkey123';

// helper: read bearer
function readBearer(req) {
  const h = req.headers['authorization'];
  if (!h) return null;
  const parts = h.split(' ');
  return parts.length === 2 ? parts[1] : null;
}

// verify token middleware
async function verifyToken(req, res, next) {
  const token = readBearer(req);
  if (!token) return res.status(401).json({ ok: false, message: 'No token' });
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded; // {id, login, role}
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, message: 'Invalid token' });
  }
}

// --- Logging helper ---
async function addLog(user, action, role) {
  try {
    await pool.query(
      'INSERT INTO logs(user, action, role, timestamp) VALUES(?,?,?,NOW())',
      [user, action, role]
    );
  } catch (e) {
    console.error('[LOG] error:', e.message);
  }
}

// --- AUTH ---
app.post('/api/auth', async (req, res) => {
  const { op, login, password } = req.body || {};
  try {
    if (op === 'register') {
      const [rows] = await pool.query('SELECT * FROM users WHERE login=?', [login]);
      if (rows.length) return res.json({ ok: false, message: 'Логин занят' });
      await pool.query('INSERT INTO users(login,password,role) VALUES(?,?,?)', [login, password, 'player']);
      const [newUserRows] = await pool.query('SELECT * FROM users WHERE login=?', [login]);
      const u = newUserRows[0];
      const token = jwt.sign({ id: u.id, login: u.login, role: u.role }, SECRET, { expiresIn: '7d' });
      await addLog(u.login, 'зарегистрировался', u.role);
      return res.json({ ok: true, token, user: { id: u.id, login: u.login, role: u.role } });
    }

    if (op === 'login') {
      const [rows] = await pool.query('SELECT * FROM users WHERE login=? AND password=?', [login, password]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Неверный логин или пароль' });
      const u = rows[0];
      const token = jwt.sign({ id: u.id, login: u.login, role: u.role }, SECRET, { expiresIn: '7d' });
      await addLog(u.login, 'вошёл в систему', u.role);
      return res.json({ ok: true, token, user: { id: u.id, login: u.login, role: u.role } });
    }

    if (op === 'session') {
      const token = readBearer(req);
      if (!token) return res.json({ ok: false, message: 'No token' });
      try {
        const decoded = jwt.verify(token, SECRET);
        return res.json({ ok: true, user: decoded });
      } catch {
        return res.json({ ok: false, message: 'Invalid token' });
      }
    }

    return res.json({ ok: false, message: 'Неизвестная операция' });
  } catch (e) {
    console.error('[AUTH] error:', e);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// --- Countries ---
app.get('/api/countries', verifyToken, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM countries');
    const countries = {};
    rows.forEach(c => {
      countries[c.id] = {
        id: c.id,
        name: c.name,
        owner: c.owner,
        economy: c.economy || 0,
        army: JSON.parse(c.army || '{}'),
        status: c.status || 'peace',
        points: c.points || 0,
        x: c.x || 0,
        y: c.y || 0
      };
    });
    res.json(countries);
  } catch (e) {
    console.error('[COUNTRIES] error:', e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

// --- Actions ---
let ECONOMY_ON = true;

app.post('/api', verifyToken, async (req, res) => {
  const { op } = req.body || {};
  try {
    if (op === 'toggle_economy') {
      if (!['admin', 'owner'].includes(req.user.role)) return res.json({ ok: false, message: 'Нет прав' });
      ECONOMY_ON = !ECONOMY_ON;
      await addLog(req.user.login, `переключил экономику на ${ECONOMY_ON}`, req.user.role);
      return res.json({ ok: true, value: ECONOMY_ON });
    }

    if (op === 'buy_unit') {
      const { countryId, unit } = req.body;
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?', [countryId]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });
      const country = rows[0];
      const army = Object.assign({}, JSON.parse(country.army || '{}'));
      army[unit] = (army[unit] || 0) + 1;
      await pool.query('UPDATE countries SET army=? WHERE id=?', [JSON.stringify(army), countryId]);
      await addLog(req.user.login, `купил юнит ${unit} для страны ${countryId}`, req.user.role);
      return res.json({ ok: true });
    }

    if (op === 'declare_war') {
      const { defenderId } = req.body;
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?', [defenderId]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });
      await pool.query('UPDATE countries SET status=? WHERE id=?', ['war', defenderId]);
      await addLog(req.user.login, `объявил войну стране ${defenderId}`, req.user.role);
      return res.json({ ok: true });
    }

    if (op === 'attack') {
      const { defenderId } = req.body;
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?', [defenderId]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });
      const points = Math.max((rows[0].points || 0) - 10, 0);
      await pool.query('UPDATE countries SET points=? WHERE id=?', [points, defenderId]);
      await addLog(req.user.login, `атаковал страну ${defenderId} (-10 очков)`, req.user.role);
      return res.json({ ok: true, lost: 10 });
    }

    if (op === 'create_country') {
      if (!['owner', 'admin'].includes(req.user.role)) return res.json({ ok: false, message: 'Нет прав' });
      const { name, flag, x, y } = req.body;
      if (!name || /[0-9]/.test(name) || name.length > 256) return res.json({ ok: false, message: 'Некорректное название' });
      await pool.query(
        'INSERT INTO countries(name, flag, owner, economy, army, status, points, x, y) VALUES(?,?,?,?,?,?,?,?,?)',
        [name, flag || '', req.user.login, 0, '{}', 'peace', 0, x || 0, y || 0]
      );
      await addLog(req.user.login, `создал страну ${name} с флагом ${flag}`, req.user.role);
      return res.json({ ok: true });
    }

    if (op === 'assign_owner') {
      if (!['owner', 'admin'].includes(req.user.role)) return res.json({ ok: false, message: 'Нет прав' });
      const { countryId, login } = req.body;
      const [crow] = await pool.query('SELECT * FROM countries WHERE id=?', [countryId]);
      if (crow.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });
      const [urow] = await pool.query('SELECT * FROM users WHERE login=?', [login]);
      if (urow.length === 0) return res.json({ ok: false, message: 'Пользователь не найден' });
      await pool.query('UPDATE countries SET owner=? WHERE id=?', [login, countryId]);
      await addLog(req.user.login, `назначил владельца ${login} для страны ${countryId}`, req.user.role);
      return res.json({ ok: true });
    }

    if (op === 'give_points') {
      if (!['owner', 'admin'].includes(req.user.role)) return res.json({ ok: false, message: 'Нет прав' });
      const { countryId, amount } = req.body;
      if (!countryId || isNaN(amount)) return res.json({ ok: false, message: 'Нужны countryId и число' });
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?', [countryId]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });
      const newPoints = (rows[0].points || 0) + parseInt(amount, 10);
      await pool.query('UPDATE countries SET points=? WHERE id=?', [newPoints, countryId]);
      await addLog(req.user.login, `выдал ${amount} очков стране ${countryId}`, req.user.role);
      return res.json({ ok: true });
    }

    return res.json({ ok: false, message: 'Неизвестная операция' });
  } catch (e) {
    console.error('[API] error:', e);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// --- Logs ---
app.get('/logs', verifyToken, async (req, res) => {
  if (!['admin'].includes(req.user.role)) return res.json([]);
  try {
    const [rows] = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC');
    await addLog(req.user.login, 'посмотрел логи', req.user.role);
    res.json(rows);
  } catch (e) {
    console.error('[LOGS] error:', e);
    res.json([]);
  }
});

// --- SPA fallback ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start ---
app.listen(PORT, () => console.log('Server running on port ' + PORT));
