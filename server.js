const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const fs = require('fs');

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

// --- Логи ---
function writeLog(msg){
  const logLine = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync('logs.txt', logLine);
}

// --- Middleware для проверки токена ---
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
      writeLog(`User registered: ${login}`);
      return res.json({ ok: true, token, user: newUser[0] });
    }

    if (op === 'login') {
      const [rows] = await pool.query('SELECT * FROM users WHERE login=? AND password=?', [login, password]);
      if (rows.length === 0) return res.json({ ok: false, message: 'Неверный логин или пароль' });
      const user = rows[0];
      const token = jwt.sign({ id: user.id, login: user.login, role: user.role }, SECRET);
      writeLog(`User logged in: ${login}`);
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
        y: c.y || 0,
        flag: c.flag || ''
      };
    });
    res.json(countries);
  } catch (e) {
    console.error('COUNTRIES ERROR:', e);
    res.json({ ok: false, message: e.message });
  }
});

// --- Admin Actions ---
app.post('/api', verifyToken, async (req, res) => {
  const { op, name, flag, x, y, countryId, login, amount } = req.body;
  try{
    // только админ или owner
    if(USER_ROLE(req.user)!=='admin' && USER_ROLE(req.user)!=='owner') return res.json({ok:false,message:'Нет доступа'});

    if(op==='create_country'){
      const [result] = await pool.query('INSERT INTO countries(name,flag,x,y,economy,points,army,status) VALUES(?,?,?,?,?,?,?,?)',
        [name,flag,x||0,y||0,1,0,'{}','peace']);
      writeLog(`Country created: ${name} by ${req.user.login}`);
      return res.json({ok:true,id:result.insertId});
    }

    if(op==='assign_owner'){
      const [rows] = await pool.query('SELECT * FROM users WHERE login=?',[login]);
      if(rows.length===0) return res.json({ok:false,message:'Пользователь не найден'});
      await pool.query('UPDATE countries SET owner=? WHERE id=?',[login,countryId]);
      writeLog(`Owner assigned: ${login} for country ${countryId} by ${req.user.login}`);
      return res.json({ok:true});
    }

    if(op==='give_points'){
      await pool.query('UPDATE countries SET points=points+? WHERE id=?',[parseInt(amount),countryId]);
      writeLog(`Points given: ${amount} to country ${countryId} by ${req.user.login}`);
      return res.json({ok:true});
    }

    if(op==='toggle_economy'){
      const [rows] = await pool.query('SELECT economy FROM countries');
      const newState = rows[0].economy?0:1;
      await pool.query('UPDATE countries SET economy=?',[newState]);
      writeLog(`Economy toggled to ${newState} by ${req.user.login}`);
      return res.json({ok:true,value:newState});
    }

    res.json({ok:false,message:'Неизвестная операция'});
  }catch(e){
    console.error('ADMIN ERROR:',e);
    res.json({ok:false,message:e.message});
  }
});

// --- Logs ---
app.get('/api/logs', verifyToken, async (req,res)=>{
  try{
    const data = fs.existsSync('logs.txt') ? fs.readFileSync('logs.txt','utf-8') : '';
    res.json(data.split('\n').filter(l=>l));
  }catch(e){ res.json([]); }
});

// --- Front ---
app.use((err, req, res, next)=>{
  console.error('SERVER ERROR:',err);
  res.status(500).json({ok:false,message:err.message});
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

app.listen(PORT,()=>console.log('Server running on port '+PORT));

// --- Helper ---
function USER_ROLE(user){ return user.role || 'player'; }
