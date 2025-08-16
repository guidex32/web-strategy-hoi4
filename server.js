const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = 'secret_123'; // поменяй на свой ключ

// --- MySQL подключение ---
const dbConfig = {
  host: '51.38.13.75',
  user: 'gs10071',
  password: 'fCEJNemIUB',
  database: 'gs10071',  // убедись, что БД создана
  port: 3306
};

// --- Middleware auth ---
async function authMiddleware(req, res, next){
  const header = req.headers.authorization;
  if(!header) return res.json({ok:false, message:'Нет токена'});
  const token = header.split(' ')[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch(e){
    res.json({ok:false, message:'Неверный токен'});
  }
}

// --- Auth routes ---
app.post('/api/auth', async (req,res)=>{
  const {op, login, password} = req.body;
  const conn = await mysql.createConnection(dbConfig);

  if(op === 'register'){
    const [exists] = await conn.execute('SELECT * FROM users WHERE login=?',[login]);
    if(exists.length) return res.json({ok:false, message:'Пользователь уже есть'});
    const hash = await bcrypt.hash(password, 10);
    await conn.execute('INSERT INTO users(login,password,role) VALUES(?,?,?)',[login,hash,'player']);
    return res.json({ok:true, message:'Зарегистрирован'});
  }

  if(op === 'login'){
    const [rows] = await conn.execute('SELECT * FROM users WHERE login=?',[login]);
    if(!rows.length) return res.json({ok:false, message:'Нет такого пользователя'});
    const user = rows[0];
    const match = await bcrypt.compare(password,user.password);
    if(!match) return res.json({ok:false, message:'Неверный пароль'});
    const token = jwt.sign({id:user.id, login:user.login, role:user.role}, JWT_SECRET);
    return res.json({ok:true, token, user:{id:user.id,login:user.login,role:user.role}});
  }

  if(op === 'session'){
    const token = req.headers.authorization?.split(' ')[1];
    if(!token) return res.json({user:null});
    try{
      const data = jwt.verify(token, JWT_SECRET);
      res.json({user:data});
    }catch(e){
      res.json({user:null});
    }
  }
});

// --- Countries ---
app.get('/api/countries', authMiddleware, async (req,res)=>{
  const conn = await mysql.createConnection(dbConfig);
  const [countries] = await conn.execute('SELECT * FROM countries');
  res.json(countries);
});

// --- Actions ---
app.post('/api', authMiddleware, async (req,res)=>{
  const {op, countryId, unit, cost, attackerId, defenderId, name} = req.body;
  const conn = await mysql.createConnection(dbConfig);

  if(op==='buy_unit'){
    const [rows] = await conn.execute('SELECT army FROM countries WHERE id=?',[countryId]);
    let army = JSON.parse(rows[0].army||'{}');
    army[unit] = (army[unit]||0) + 1;
    await conn.execute('UPDATE countries SET army=? WHERE id=?',[JSON.stringify(army), countryId]);
    res.json({ok:true});
  }

  if(op==='declare_war'){
    await conn.execute('UPDATE countries SET status="war" WHERE id=? OR id=?',[attackerId,defenderId]);
    res.json({ok:true});
  }

  if(op==='attack'){
    // просто пример логики
    const [rows] = await conn.execute('SELECT army FROM countries WHERE id=?',[defenderId]);
    let army = JSON.parse(rows[0].army||'{}');
    const lost = Object.keys(army).length ? 1 : 0;
    await conn.execute('UPDATE countries SET army=? WHERE id=?',[JSON.stringify({}), defenderId]);
    res.json({ok:true,lost});
  }

  if(op==='create_country'){
    await conn.execute('INSERT INTO countries(name,owner,economy,army,status,points) VALUES(?,?,?,?,?,?)',[name,null,0,'{}','peace',0]);
    res.json({ok:true});
  }
});

// --- Logs ---
app.get('/logs', authMiddleware, async (req,res)=>{
  const conn = await mysql.createConnection(dbConfig);
  const [logs] = await conn.execute('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100');
  res.json(logs);
});

// --- Index ---
app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

// --- Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Server running on port',PORT));
