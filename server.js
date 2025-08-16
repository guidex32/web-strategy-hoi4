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
(async () => { pool = await mysql.createPool(dbConfig); })();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const SECRET = 'supersecretkey123';

// --- verify token ---
async function verifyToken(req,res,next){
  const header = req.headers['authorization'];
  if(!header) return res.status(401).json({ok:false,message:'No token'});
  const token = header.split(' ')[1];
  try{
    const decoded = jwt.verify(token,SECRET);
    req.user = decoded;
    next();
  }catch(e){ res.status(401).json({ok:false,message:'Invalid token'}); }
}

// --- Auth ---
app.post('/api/auth', async (req,res)=>{
  const {op,login,password} = req.body;
  if(op==='register'){
    try{
      const [rows] = await pool.query('SELECT * FROM users WHERE login=?',[login]);
      if(rows.length) return res.json({ok:false,message:'Логин занят'});
      await pool.query('INSERT INTO users(login,password,role) VALUES(?,?,?)',[login,password,'player']);
      return res.json({ok:true,message:'Регистрация успешна'});
    }catch(e){return res.json({ok:false,message:e.message});}
  }
  if(op==='login'){
    try{
      const [rows] = await pool.query('SELECT * FROM users WHERE login=? AND password=?',[login,password]);
      if(rows.length===0) return res.json({ok:false,message:'Неверный логин/пароль'});
      const user = rows[0];
      const token = jwt.sign({id:user.id,login:user.login,role:user.role},SECRET);
      return res.json({ok:true,token,user});
    }catch(e){return res.json({ok:false,message:e.message});}
  }
  if(op==='session'){
    try{
      const user = req.user;
      return res.json({ok:true,user});
    }catch(e){return res.json({ok:false});}
  }
});

// --- Countries ---
app.get('/api/countries', verifyToken, async (req,res)=>{
  try{
    const [rows] = await pool.query('SELECT * FROM countries');
    res.json(rows.reduce((acc,c)=>{ acc[c.id]=c; return acc; },{}));
  }catch(e){res.json({ok:false,message:e.message});}
});

// --- Actions ---
app.post('/api', verifyToken, async (req,res)=>{
  const {op,countryId,unit,cost,attackerId,defenderId,name,x,y} = req.body;
  const user = req.user;
  try{
    if(op==='buy_unit'){
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?',[countryId]);
      if(rows.length===0) return res.json({ok:false,message:'Страна не найдена'});
      let army = JSON.parse(rows[0].army||'{}');
      army[unit] = (army[unit]||0)+1;
      await pool.query('UPDATE countries SET army=? WHERE id=?',[JSON.stringify(army),countryId]);
      return res.json({ok:true});
    }
    if(op==='declare_war'){
      await pool.query('UPDATE countries SET status=? WHERE id=?',['war',defenderId]);
      return res.json({ok:true});
    }
    if(op==='attack'){
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?',[defenderId]);
      if(rows.length===0) return res.json({ok:false,message:'Страна не найдена'});
      let points = rows[0].points || 0;
      points = Math.max(points-10,0);
      await pool.query('UPDATE countries SET points=? WHERE id=?',[points,defenderId]);
      return res.json({ok:true,lost:10});
    }
    if(op==='create_country'){
      if(user.role!=='owner') return res.json({ok:false,message:'Только овнер'});
      const id = Date.now().toString();
      await pool.query('INSERT INTO countries(id,name,x,y,owner,army,economy,points,status,economy_on) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [id,name,x,y,user.login,'{}',0,0,'peace',1]);
      return res.json({ok:true});
    }
    if(op==='assign_owner'){
      if(user.role!=='owner') return res.json({ok:false,message:'Только овнер'});
      await pool.query('UPDATE countries SET owner=? WHERE id=?',[req.body.login,req.body.countryId]);
      return res.json({ok:true});
    }
    if(op==='give_points'){
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?',[countryId]);
      if(rows.length===0) return res.json({ok:false,message:'Страна не найдена'});
      let points = parseInt(req.body.amount);
      if(isNaN(points)) return res.json({ok:false,message:'Только цифры'});
      await pool.query('UPDATE countries SET points=points+? WHERE id=?',[points,countryId]);
      return res.json({ok:true});
    }
    if(op==='toggle_economy'){
      const [rows] = await pool.query('SELECT * FROM countries WHERE id=?',[countryId]);
      if(rows.length===0) return res.json({ok:false,message:'Страна не найдена'});
      const newVal = rows[0].economy_on?0:1;
      await pool.query('UPDATE countries SET economy_on=? WHERE id=?',[newVal,countryId]);
      return res.json({ok:true,newVal});
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

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

app.listen(PORT,()=>console.log('Server running on port '+PORT));
