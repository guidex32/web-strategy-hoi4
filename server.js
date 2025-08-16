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
(async () => { pool = await mysql.createPool(dbConfig); })();

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const SECRET = 'supersecretkey123';

// --- Helper: verify token ---
async function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if(!header) return res.status(401).json({ok:false, message:'No token'});
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch(e) {
    res.status(401).json({ok:false, message:'Invalid token'});
  }
}

// --- Auth routes ---
app.post('/api/auth', async (req,res)=>{
  const {op, login, password} = req.body;
  if(op==='register'){
    try{
      const [rows] = await pool.query('SELECT * FROM users WHERE login=?',[login]);
      if(rows.length) return res.json({ok:false, message:'Логин занят'});
      await pool.query('INSERT INTO users(login,password,role) VALUES(?,?,?)',[login,password,'user']);
      return res.json({ok:true, message:'Регистрация прошла успешно'});
    }catch(e){return res.json({ok:false, message:e.message});}
  }
  if(op==='login'){
    try{
      const [rows] = await pool.query('SELECT * FROM users WHERE login=? AND password=?',[login,password]);
      if(rows.length===0) return res.json({ok:false, message:'Неверный логин или пароль'});
      const user = rows[0];
      const token = jwt.sign({id:user.id, login:user.login, role:user.role}, SECRET);
      return res.json({ok:true, token, user});
    }catch(e){return res.json({ok:false, message:e.message});}
  }
  if(op==='session'){
    try{
      const header = req.headers['authorization'];
      if(!header) return res.json({ok:true, user:null});
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, SECRET);
      return res.json({ok:true, user:decoded, token});
    }catch(e){return res.json({ok:true, user:null});}
  }
});

// --- Countries ---
app.get('/api/countries', verifyToken, async (req,res)=>{
  try{
    const [rows] = await pool.query('SELECT * FROM countries');
    const countries = {};
    rows.forEach(r=>{ countries[r.id]=r; });
    res.json(countries);
  }catch(e){res.json({ok:false,message:e.message});}
});

// --- Actions ---
app.post('/api', verifyToken, async (req,res)=>{
  const {op, countryId, unit, cost, attackerId, defenderId, name, login} = req.body;
  try{
    // fetch country
    const [rows] = await pool.query('SELECT * FROM countries WHERE id=?',[countryId||attackerId||defenderId]);
    if(rows.length===0 && op!=='create_country') return res.json({ok:false,message:'Страна не найдена'});
    const country = rows[0];

    if(op==='buy_unit'){
      if(req.user.role!=='admin' && req.user.login!==country.owner) return res.status(403).json({ok:false,message:'Не твоя страна'});
      let army = JSON.parse(country.army||'{}');
      army[unit] = (army[unit]||0)+1;
      await pool.query('UPDATE countries SET army=? WHERE id=?',[JSON.stringify(army),country.id]);
      return res.json({ok:true});
    }

    if(op==='declare_war'){
      if(req.user.role!=='admin' && req.user.login!==country.owner) return res.status(403).json({ok:false,message:'Не твоя страна'});
      await pool.query('UPDATE countries SET status=? WHERE id=?',['war',defenderId]);
      return res.json({ok:true});
    }

    if(op==='attack'){
      if(req.user.role!=='admin' && req.user.login!==country.owner) return res.status(403).json({ok:false,message:'Не твоя страна'});
      const [defRows] = await pool.query('SELECT * FROM countries WHERE id=?',[defenderId]);
      if(defRows.length===0) return res.json({ok:false,message:'Цель не найдена'});
      let points = defRows[0].points || 0;
      points = Math.max(points-10,0);
      await pool.query('UPDATE countries SET points=? WHERE id=?',[points,defenderId]);
      return res.json({ok:true,lost:10});
    }

    if(op==='create_country'){
      if(req.user.role!=='admin') return res.status(403).json({ok:false,message:'Только админ'});
      await pool.query('INSERT INTO countries(name,economy,army,status,points,owner) VALUES(?,?,?,?,?,?)',[name,0,'{}','peace',0,null]);
      return res.json({ok:true});
    }

    res.json({ok:false,message:'Неизвестная операция'});
  }catch(e){res.json({ok:false,message:e.message});}
});

// --- Logs ---
app.get('/logs', verifyToken, async (req,res)=>{
  if(req.user.role!=='admin') return res.json([]);
  try{
    const [rows] = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC');
    res.json(rows);
  }catch(e){res.json([]);}
});

// --- Front ---
app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

// --- Start ---
app.listen(PORT, ()=>console.log('Server running on port '+PORT));
