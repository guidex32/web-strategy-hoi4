const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

const dbConfig = {
  host: '51.38.13.75',
  user: 'gs10071',
  password: 'fCEJNemIUB',
  database: 'gs10071',
  port: 3306,
};

let pool;
async function initDB() {
  try {
    pool = await mysql.createPool(dbConfig);
    console.log('DB pool created');
  } catch (e) {
    console.error('DB connection error:', e);
    process.exit(1);
  }
}

initDB();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const SECRET = 'supersecretkey123';

// Middleware для проверки токена
async function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ ok: false, message: 'No token' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, message: 'Invalid token' });
  }
}

// --- Auth ---
app.post('/api/auth', async (req, res) => {
  const { op, login, password } = req.body;
  try {
    if (op === 'register') {
      const [rows] = await pool.query('SELECT * FROM users WHERE login=?', [login]);
      if (rows.length) return res.json({ ok: false, message: 'Логин занят' });
      await pool.query('INSERT INTO users(login,password,role) VALUES(?,?,?)', [login, password, 'player']);
      const [newUser] = await pool.query('SELECT * FROM users WHERE login=?', [login]);
      const token = jwt.sign({ id: newUser[0].id, login: newUser[0].login, role: newUser[0].role }, SECRET);
      return res.json({ ok: true, token, user: newUser[0] });
    }

    if (op === 'login') {
      const [rows] = await pool.query('SELECT * FROM users WHERE login=? AND password=?', [login, password]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Неверный логин или пароль' });
      const user = rows[0];
      const token = jwt.sign({ id: user.id, login: user.login, role: user.role }, SECRET);
      return res.json({ ok: true, token, user });
    }

    if (op === 'session') {
      if (!req.headers['authorization']) return res.json({ ok: false, message: 'No token' });
      const token = req.headers['authorization'].split(' ')[1];
      try {
        const decoded = jwt.verify(token, SECRET);
        return res.json({ ok: true, user: decoded });
      } catch (e) {
        return res.json({ ok: false, message: 'Invalid token' });
      }
    }

    res.json({ ok: false, message: 'Неизвестная операция' });
  } catch (e) {
    console.error('AUTH ERROR:', e);
    res.json({ ok: false, message: e.message });
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
    console.error('COUNTRIES ERROR:', e);
    res.json({ ok: false, message: e.message });
  }
});

// --- Логирование ошибок сервера
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(500).json({ ok: false, message: err.message });
});

// --- Front ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log('Server running on port ' + PORT));
