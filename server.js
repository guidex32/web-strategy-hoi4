const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const jwt = require('jsonwebtoken');
const fs = require('fs');

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

// --- AUTH ---
// оставлено без изменений

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
        flag: c.flag || '',
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

// --- Flags ---
app.get('/api/flags', verifyToken, async (req, res) => {
  try {
    const dir = path.join(__dirname, 'public', 'flags');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|svg|webp)$/i.test(f));
    res.json(files);
  } catch (e) {
    console.error('[FLAGS] error:', e);
    res.status(500).json([]);
  }
});

// --- Actions ---
app.post('/api', verifyToken, async (req, res) => {
  const { op } = req.body || {};
  try {
    // --- Build buildings ---
    if (op === 'build') {
      const { countryId, buildingType } = req.body;
      const buildingCosts = {
        office: { cost: 10, income: 5 },
        military: { cost: 30, income: 15 },
        airport: { cost: 100, income: 50 },
        oil: { cost: 500, income: 200 }
      };
      if (!buildingCosts[buildingType]) return res.json({ ok: false, message: 'Неверный тип здания' });

      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?', [countryId]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Страна не найдена' });

      const country = rows[0];
      if (country.owner !== req.user.login) return res.json({ ok: false, message: 'Вы не владелец страны' });

      if (country.points < buildingCosts[buildingType].cost) return res.json({ ok: false, message: 'Недостаточно очков' });

      // обновляем очки и добавляем доход здания
      const armyData = JSON.parse(country.army || '{}');
      const buildings = armyData.buildings || [];
      buildings.push({ type: buildingType, income: buildingCosts[buildingType].income });

      await pool.query('UPDATE countries SET points=?, army=? WHERE id=?',
        [country.points - buildingCosts[buildingType].cost, JSON.stringify({ ...armyData, buildings }), countryId]);

      await pool.query('INSERT INTO logs(user,action,timestamp) VALUES(?,?,NOW())', [req.user.login, `Построил здание ${buildingType} в стране ${country.name}`]);

      return res.json({ ok: true, message: 'Здание построено' });
    }

    // --- Create country ---
    if (op === 'create_country') {
      if (!['owner','admin'].includes(req.user.role)) return res.json({ ok: false, message: 'Нет прав' });
      const { name, flag, x, y, owner } = req.body;

      if (!name || /[0-9]/.test(name) || name.length > 256)
        return res.json({ ok: false, message: 'Некорректное название' });

      const [exists] = await pool.query('SELECT * FROM countries WHERE name=?', [name]);
      if (exists.length > 0) return res.json({ ok: false, message: 'Такая страна уже есть' });

      const [urow] = await pool.query('SELECT * FROM users WHERE login=?', [owner]);
      if (urow.length === 0) return res.json({ ok: false, message: 'Пользователь не найден' });

      const [hasCountry] = await pool.query('SELECT * FROM countries WHERE owner=?', [owner]);
      if (hasCountry.length > 0) return res.json({ ok: false, message: 'У пользователя уже есть страна' });

      const flagPath = path.join(__dirname, 'public', 'flags', flag);
      if (!fs.existsSync(flagPath)) return res.json({ ok: false, message: 'Флаг не найден' });

      await pool.query(
        'INSERT INTO countries(name, flag, owner, economy, army, status, points, x, y) VALUES(?,?,?,?,?,?,?,?,?)',
        [name, flag, owner, 0, '{}', 'peace', 0, x || 0, y || 0]
      );
      await pool.query('INSERT INTO logs(user,action,timestamp) VALUES(?,?,NOW())',[req.user.login,`Создана страна ${name} с флагом ${flag}`]);
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
  if (!['admin','owner'].includes(req.user.role)) return res.json([]);
  try {
    const [rows] = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC');
    await pool.query('INSERT INTO logs(user,action,timestamp) VALUES(?,?,NOW())',[req.user.login,'Просмотрел логи']);
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
