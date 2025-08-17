const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = 3000;
const SECRET = 'supersecretkey';

// JSON базы
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const COUNTRIES_FILE = path.join(__dirname, 'data', 'countries.json');
const LOGS_FILE = path.join(__dirname, 'data', 'logs.json');

function readJSON(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// токен проверка
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ ok: false, message: 'Нет токена' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ ok: false, message: 'Неверный токен' });
    req.user = decoded;
    next();
  });
}

// регистрация
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ ok: false, message: 'Заполните все поля' });

  const users = readJSON(USERS_FILE);
  if (users.find(u => u.username === username)) {
    return res.json({ ok: false, message: 'Пользователь уже существует' });
  }

  const hashed = await bcrypt.hash(password, 10);
  users.push({ username, password: hashed, role: 'user' });
  writeJSON(USERS_FILE, users);

  res.json({ ok: true });
});

// вход
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.username === username);
  if (!user) return res.json({ ok: false, message: 'Пользователь не найден' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ ok: false, message: 'Неверный пароль' });

  const token = jwt.sign({ username: user.username, role: user.role }, SECRET, { expiresIn: '24h' });
  res.json({ ok: true, token, role: user.role });
});

// список стран
app.get('/api/countries', verifyToken, (req, res) => {
  const countries = readJSON(COUNTRIES_FILE);
  res.json(countries);
});

// действия с картой
app.post('/api', verifyToken, (req, res) => {
  const { op, name, flag, x, y } = req.body;
  const countries = readJSON(COUNTRIES_FILE);
  const logs = readJSON(LOGS_FILE);

  if (op === 'create_country') {
    if (countries.find(c => c.name === name)) {
      return res.json({ ok: false, message: 'Страна уже существует' });
    }
    countries.push({ name, flag, x, y, owner: req.user.username, points: 100 });
    writeJSON(COUNTRIES_FILE, countries);
    logs.push({ time: Date.now(), user: req.user.username, action: `Создана страна ${name}` });
    writeJSON(LOGS_FILE, logs);
    return res.json({ ok: true });
  }

  res.json({ ok: false, message: 'Неизвестная операция' });
});

// список флагов
app.get('/api/flags', verifyToken, async (_req, res) => {
  try {
    const dir = path.join(__dirname, 'public', 'flags');
    const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|svg|gif)$/i.test(f));
    res.json(files);
  } catch (e) {
    console.error('[FLAGS] error:', e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

// fallback для SPA
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
