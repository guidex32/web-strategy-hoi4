// server.js
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- MySQL connection ---
const db = await mysql.createPool({
  host: '51.38.13.75',
  user: 'gs10071',
  password: 'fCEJNemIUB',
  database: 'gs10071',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// --- Create tables if not exists ---
await db.query(`
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  login VARCHAR(50) UNIQUE,
  password VARCHAR(255),
  role ENUM('admin','owner','player') DEFAULT 'player',
  token VARCHAR(255)
);
`);

await db.query(`
CREATE TABLE IF NOT EXISTS countries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50),
  owner VARCHAR(50),
  economy INT DEFAULT 0,
  army TEXT DEFAULT '{}',
  status ENUM('мир','война') DEFAULT 'мир',
  points INT DEFAULT 0
);
`);

await db.query(`
CREATE TABLE IF NOT EXISTS logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  text TEXT
);
`);

// --- Routes ---
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

// --- Auth ---
app.post('/auth', async (req,res)=>{
  const { op, login, password } = req.body;
  if(op==='register'){
    try {
      await db.query(`INSERT INTO users (login, password) VALUES (?,?)`, [login, password]);
      res.json({ ok:true, message:'Зарегистрирован' });
    } catch(e){
      res.json({ ok:false, message:'Ошибка регистрации или логин занят' });
    }
  } else if(op==='login'){
    const [rows] = await db.query(`SELECT * FROM users WHERE login=? AND password=?`, [login,password]);
    if(rows.length){
      const token = Math.random().toString(36).substr(2,12);
      await db.query(`UPDATE users SET token=? WHERE id=?`, [token, rows[0].id]);
      res.json({ ok:true, token, user: rows[0] });
    } else res.json({ ok:false, message:'Неверный логин/пароль' });
  } else if(op==='session'){
    const token = req.headers['authorization']?.replace('Bearer ','');
    if(!token) return res.json({ user:null });
    const [rows] = await db.query(`SELECT * FROM users WHERE token=?`, [token]);
    res.json({ user: rows[0]||null });
  } else res.json({ ok:false, message:'Unknown op' });
});

// --- Countries ---
app.get('/countries', async (req,res)=>{
  const [rows] = await db.query(`SELECT * FROM countries`);
  res.json(rows);
});

// --- API actions ---
app.post('/api', async (req,res)=>{
  const token = req.headers['authorization']?.replace('Bearer ','');
  const [users] = await db.query(`SELECT * FROM users WHERE token=?`, [token]);
  if(!users.length) return res.json({ ok:false, message:'Нет доступа' });

  const user = users[0];
  const { op, countryId, unit, cost, name, attackerId, defenderId } = req.body;

  if(op==='buy_unit'){
    const [countries] = await db.query(`SELECT * FROM countries WHERE id=?`, [countryId]);
    if(!countries.length) return res.json({ ok:false, message:'Нет такой страны' });
    const c = countries[0];
    let army = JSON.parse(c.army||'{}');
    army[unit] = (army[unit]||0)+1;
    const economy = (c.economy || 0) - (cost || 0);
    await db.query(`UPDATE countries SET army=?, economy=? WHERE id=?`, [JSON.stringify(army), economy, countryId]);
    res.json({ ok:true });
  } else if(op==='create_country'){
    await db.query(`INSERT INTO countries (name) VALUES (?)`, [name]);
    res.json({ ok:true });
  } else if(op==='declare_war'){
    await db.query(`UPDATE countries SET status='война' WHERE id=? OR id=?`, [attackerId, defenderId]);
    res.json({ ok:true });
  } else if(op==='attack'){
    const [countries] = await db.query(`SELECT * FROM countries WHERE id=?`, [defenderId]);
    if(!countries.length) return res.json({ ok:false, message:'Нет страны'});
    const c = countries[0];
    let army = JSON.parse(c.army||'{}');
    let lost = 0;
    for(let k in army){ lost += army[k]; army[k]=Math.max(0, army[k]-1); break; }
    await db.query(`UPDATE countries SET army=? WHERE id=?`, [JSON.stringify(army), defenderId]);
    res.json({ ok:true, lost });
  } else res.json({ ok:false, message:'Unknown op' });
});

// --- Logs ---
app.get('/logs', async (req,res)=>{
  const [rows] = await db.query(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100`);
  res.json(rows);
});

// --- Start server ---
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
