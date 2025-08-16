const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

// --- MySQL connection ---
const dbConfig = {
  host: '51.38.13.75',
  user: 'gs10071',
  password: 'fCEJNemIUB',
  database: 'gs10071',
  port: 3306,
  multipleStatements: true
};

let pool;
async function initDB() {
  pool = await mysql.createPool(dbConfig);
  // создаем таблицы если их нет
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      login VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('player','owner','admin') DEFAULT 'player'
    );
    CREATE TABLE IF NOT EXISTS countries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      owner VARCHAR(50),
      economy INT DEFAULT 0,
      points INT DEFAULT 0,
      status ENUM('мир','война') DEFAULT 'мир',
      army JSON DEFAULT '{}',
      atwarWith JSON DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      text TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
initDB().then(()=>console.log('MySQL connected')).catch(console.error);

// --- JWT ---
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

function authOptional(req,res,next){
  const h = req.headers.authorization||'';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if(!token) return next();
  try{
    req.user = jwt.verify(token, JWT_SECRET);
  }catch(e){}
  next();
}

function authRequired(req,res,next){
  if(!req.user) return res.status(401).json({ok:false,message:'auth required'});
  next();
}

// --- AUTH ---
app.post('/auth', authOptional, async (req,res)=>{
  const { op, login, password } = req.body;
  if(op==='register'){
    if(!login || !password) return res.status(400).json({ok:false,message:'нужны логин и пароль'});
    const [rows] = await pool.query('SELECT * FROM users WHERE login=?',[login]);
    if(rows.length) return res.status(400).json({ok:false,message:'Логин уже существует'});
    const hash = bcrypt.hashSync(password,10);
    await pool.query('INSERT INTO users (login,password) VALUES (?,?)',[login,hash]);
    return res.json({ok:true,message:'Регистрация успешна'});
  }
  if(op==='login'){
    const [rows] = await pool.query('SELECT * FROM users WHERE login=?',[login]);
    if(!rows.length) return res.status(400).json({ok:false,message:'Неверные данные'});
    const user = rows[0];
    if(!bcrypt.compareSync(password,user.password)) return res.status(400).json({ok:false,message:'Неверные данные'});
    const token = jwt.sign({login:user.login,role:user.role},JWT_SECRET,{expiresIn:'12h'});
    return res.json({ok:true,token,user:{login:user.login,role:user.role}});
  }
  if(op==='session'){
    if(!req.user) return res.json({ok:true,user:null});
    return res.json({ok:true,user:{login:req.user.login,role:req.user.role}});
  }
  res.status(400).json({ok:false,message:'unknown op'});
});

// --- LOGS ---
app.get('/logs', async (req,res)=>{
  const [rows] = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 500');
  res.json(rows);
});

app.post('/logs', async (req,res)=>{
  const { text } = req.body;
  const [r] = await pool.query('INSERT INTO logs (text) VALUES (?)',[text]);
  res.json({id:r.insertId,text});
});

// --- COUNTRIES ---
app.get('/countries', async (req,res)=>{
  const [rows] = await pool.query('SELECT * FROM countries');
  res.json(rows);
});

app.post('/api', authOptional, async (req,res)=>{
  const { op } = req.body;

  if(op==='list'){
    const [rows] = await pool.query('SELECT * FROM countries');
    return res.json({ok:true,countries:rows});
  }

  if(!req.user) return res.status(403).json({ok:false,message:'auth required'});
  const userLogin = req.user.login;
  const role = req.user.role;

  // --- admin / owner actions ---
  if(op==='buy_unit'){
    const { countryId, unit, cost } = req.body;
    const [rows] = await pool.query('SELECT * FROM countries WHERE id=?',[countryId]);
    if(!rows.length) return res.status(400).json({ok:false,message:'Нет страны'});
    const c = rows[0];
    if(role!=='admin' && c.owner!==userLogin) return res.status(403).json({ok:false,message:'Не твоя страна'});
    const army = JSON.parse(c.army||'{}');
    army[unit||'tank'] = (army[unit||'tank']||0)+1;
    const points = (c.points||0)-(cost||0);
    await pool.query('UPDATE countries SET army=?, points=? WHERE id=?',[JSON.stringify(army),points,countryId]);
    return res.json({ok:true});
  }

  if(op==='declare_war'){
    const { attackerId, defenderId } = req.body;
    const [aRows] = await pool.query('SELECT * FROM countries WHERE id=?',[attackerId]);
    const [dRows] = await pool.query('SELECT * FROM countries WHERE id=?',[defenderId]);
    if(!aRows.length || !dRows.length) return res.status(400).json({ok:false,message:'Неверные ID'});
    const A = aRows[0], D=dRows[0];
    if(role!=='admin' && A.owner!==userLogin) return res.status(403).json({ok:false,message:'Не твоя страна'});
    await pool.query('UPDATE countries SET status="война", atwarWith=? WHERE id=?',
      [JSON.stringify({...JSON.parse(A.atwarWith||'{}'),[defenderId]:true}),attackerId]);
    await pool.query('UPDATE countries SET status="война", atwarWith=? WHERE id=?',
      [JSON.stringify({...JSON.parse(D.atwarWith||'{}'),[attackerId]:true}),defenderId]);
    return res.json({ok:true});
  }

  if(op==='attack'){
    const { attackerId, defenderId } = req.body;
    const [aRows] = await pool.query('SELECT * FROM countries WHERE id=?',[attackerId]);
    const [dRows] = await pool.query('SELECT * FROM countries WHERE id=?',[defenderId]);
    if(!aRows.length || !dRows.length) return res.status(400).json({ok:false,message:'Неверные ID'});
    const A = aRows[0], D=dRows[0];
    if(role!=='admin' && A.owner!==userLogin) return res.status(403).json({ok:false,message:'Не твоя страна'});
    const atkArmy = JSON.parse(A.army||'{}');
    const defArmy = JSON.parse(D.army||'{}');
    const atkPower = (atkArmy.tank||0) + (atkArmy.btr||0)*0.5;
    const defPower = (defArmy.pvo||0)*0.8;
    const dmg = Math.max(1,Math.round(atkPower-defPower));
    defArmy.tank = Math.max(0,(defArmy.tank||0)-dmg);
    await pool.query('UPDATE countries SET army=? WHERE id=?',[JSON.stringify(defArmy),defenderId]);
    return res.json({ok:true,lost:dmg});
  }

  res.status(400).json({ok:false,message:'unknown op'});
});

// --- ECONOMY TICK ---
setInterval(async ()=>{
  const [rows] = await pool.query('SELECT * FROM countries');
  for(const c of rows){
    const economy = c.economy||0;
    const points = (c.points||0)+economy;
    await pool.query('UPDATE countries SET points=? WHERE id=?',[points,c.id]);
  }
},60*60*1000);

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log('Server running on port',PORT));
