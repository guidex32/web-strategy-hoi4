// server.js
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ======= Настройки MySQL =======
const pool = mysql.createPool({
  host: '51.38.13.75',    
  user: 'gs10071',
  password: 'fCEJNemIUB',
  database: 'gs10071',     
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ======= JWT =======
const JWT_SECRET = 'supersecretkey';

// ======= Хелперы =======
async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ======= Логирование =======
async function logEvent(text) {
  await query('INSERT INTO logs (text) VALUES (?)', [text]);
}

// ======= Аутентификация =======
app.post('/auth', async (req, res) => {
  const { op, login, password } = req.body;

  if(op === 'register') {
    const existing = await query('SELECT * FROM users WHERE login=?', [login]);
    if(existing.length) return res.status(400).json({error:'Логин уже существует'});
    const hash = bcrypt.hashSync(password, 10);
    await query('INSERT INTO users (login,password,role) VALUES (?,?,?)', [login, hash, 'player']);
    await logEvent(`Новая регистрация: ${login}`);
    return res.json({ok:true, message:'Регистрация успешна'});
  }

  if(op === 'login') {
    const users = await query('SELECT * FROM users WHERE login=?', [login]);
    if(!users.length) return res.status(400).json({error:'Неверные данные'});
    const user = users[0];
    if(!bcrypt.compareSync(password, user.password)) return res.status(400).json({error:'Неверные данные'});
    const token = jwt.sign({login:user.login,role:user.role}, JWT_SECRET, {expiresIn:'12h'});
    await logEvent(`${login} вошёл в систему`);
    return res.json({ok:true, token, user:{login:user.login, role:user.role}});
  }

  if(op === 'session') {
    const token = req.headers.authorization?.replace('Bearer ','');
    if(!token) return res.json({ok:true, user:null});
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return res.json({ok:true, user:{login:payload.login, role:payload.role}});
    } catch { return res.json({ok:true, user:null}); }
  }

  res.status(400).json({error:'Неизвестная операция'});
});

// ======= Мидлвар для авторизации =======
function authRequired(req,res,next){
  const token = req.headers.authorization?.replace('Bearer ','');
  if(!token) return res.status(401).json({ok:false,message:'auth required'});
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ok:false,message:'invalid token'}); }
}

// ======= API для фронта =======
app.post('/api', authRequired, async (req,res)=>{
  const { op } = req.body;

  // Получаем все страны
  if(op==='list'){
    const countries = await query('SELECT * FROM countries');
    return res.json({ok:true, countries});
  }

  // Купить юнит
  if(op==='buy-unit'){
    const { countryId, unit, cost } = req.body;
    const [rows] = await query('SELECT * FROM countries WHERE id=?', [countryId]);
    if(!rows.length) return res.status(400).json({ok:false,message:'Нет страны'});
    const country = rows[0];
    if(req.user.role!=='admin' && country.owner!==req.user.login) return res.status(403).json({ok:false,message:'Не твоя страна'});
    if(country.points<cost) return res.status(400).json({ok:false,message:'Не хватает очков'});

    const army = JSON.parse(country.army||'{}');
    army[unit] = (army[unit]||0)+1;

    await query('UPDATE countries SET points=?, army=? WHERE id=?', [country.points-cost, JSON.stringify(army), countryId]);
    await logEvent(`${req.user.login} купил юнит ${unit} для ${country.name} (-${cost})`);
    return res.json({ok:true});
  }

  // Построить экономику
  if(op==='economy-spend'){
    const { countryId, cost } = req.body;
    const [rows] = await query('SELECT * FROM countries WHERE id=?', [countryId]);
    if(!rows.length) return res.status(400).json({ok:false,message:'Нет страны'});
    const country = rows[0];
    if(req.user.role!=='admin' && country.owner!==req.user.login) return res.status(403).json({ok:false,message:'Не твоя страна'});
    if(country.points<cost) return res.status(400).json({ok:false,message:'Не хватает очков'});

    await query('UPDATE countries SET points=?, economy=? WHERE id=?', [country.points-cost, country.economy+1, countryId]);
    await logEvent(`${req.user.login} построил здание экономики для ${country.name} (-${cost})`);
    return res.json({ok:true});
  }

  // Объявить войну
  if(op==='declare-war'){
    const { attackerId, defenderId } = req.body;
    const [attRows] = await query('SELECT * FROM countries WHERE id=?', [attackerId]);
    const [defRows] = await query('SELECT * FROM countries WHERE id=?', [defenderId]);
    if(!attRows.length||!defRows.length) return res.status(400).json({ok:false,message:'Неверные ID'});
    const A = attRows[0], D = defRows[0];
    if(req.user.role!=='admin' && A.owner!==req.user.login) return res.status(403).json({ok:false,message:'Не твоя страна'});

    await query('UPDATE countries SET status=? WHERE id IN (?,?)', ['война', attackerId, defenderId]);
    await logEvent(`${A.name} объявила войну ${D.name}`);
    return res.json({ok:true});
  }

  // Получить логи
  if(op==='view-logs'){
    const logs = await query('SELECT * FROM logs ORDER BY id DESC LIMIT 100');
    return res.json({ok:true, logs});
  }

  res.status(400).json({ok:false,message:'unknown op'});
});

// ======= Тик экономики =======
setInterval(async ()=>{
  const countries = await query('SELECT * FROM countries');
  for(const c of countries){
    await query('UPDATE countries SET points=? WHERE id=?', [c.points+c.economy, c.id]);
  }
  await logEvent('Тик экономики: очки начислены');
}, 60*60*1000); // каждый час

// ======= Старт сервера =======
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server started on port ${PORT}`));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
