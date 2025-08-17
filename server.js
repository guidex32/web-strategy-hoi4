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
(async () => { pool = await mysql.createPool(dbConfig); console.log('DB pool ready'); })();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname,'public')));

const SECRET = 'supersecretkey123';

// Middleware для защищённых эндпоинтов
async function verifyToken(req,res,next){
  const header = req.headers['authorization'];
  if(!header) return res.status(401).json({ok:false,message:'No token'});
  const token = header.split(' ')[1];
  try{
    req.user = jwt.verify(token,SECRET);
    next();
  }catch(e){ res.status(401).json({ok:false,message:'Invalid token'}); }
}

// --- Auth ---
app.post('/api/auth', async (req,res)=>{
  const {op, login, password} = req.body;
  try{
    if(op==='register'){
      const [rows] = await pool.query('SELECT * FROM users WHERE login=?',[login]);
      if(rows.length) return res.json({ok:false,message:'Логин занят'});
      await pool.query('INSERT INTO users(login,password,role) VALUES(?,?,?)',[login,password,'player']);
      const [newUser] = await pool.query('SELECT * FROM users WHERE login=?',[login]);
      const token = jwt.sign({id:newUser[0].id,login:newUser[0].login,role:newUser[0].role},SECRET);
      return res.json({ok:true,token,user:newUser[0]});
    }

    if(op==='login'){
      const [rows] = await pool.query('SELECT * FROM users WHERE login=? AND password=?',[login,password]);
      if(rows.length===0) return res.json({ok:false,message:'Неверный логин или пароль'});
      const user = rows[0];
      const token = jwt.sign({id:user.id,login:user.login,role:user.role},SECRET);
      return res.json({ok:true,token,user});
    }

    if(op==='session'){
      const header = req.headers['authorization'];
      if(!header) return res.json({ok:false,message:'No token'});
      try{
        const decoded = jwt.verify(header.split(' ')[1],SECRET);
        return res.json({ok:true,user:decoded});
      }catch(e){ return res.json({ok:false,message:'Invalid token'}); }
    }

    res.json({ok:false,message:'Неизвестная операция'});
  }catch(e){ console.error('AUTH ERROR',e); res.json({ok:false,message:e.message}); }
});

// --- Countries ---
app.get('/api/countries', verifyToken, async (req,res)=>{
  try{
    const [rows] = await pool.query('SELECT * FROM countries');
    const countries = {};
    rows.forEach(c=>{
      countries[c.id] = {
        id:c.id,
        name:c.name,
        owner:c.owner,
        economy:c.economy,
        army:JSON.parse(c.army||'{}'),
        status:c.status,
        points:c.points,
        x:c.x||0,
        y:c.y||0,
        flag:c.flag||'default.png'
      }
    });
    res.json(countries);
  }catch(e){ res.json({ok:false,message:e.message}); }
});

// --- Admin Actions ---
app.post('/api', verifyToken, async (req,res)=>{
  const {op,countryId,login,name,x,y,flag} = req.body;
  try{
    if(op==='create_country' && req.user.role==='owner'){
      if(!name||name.length>256||/[0-9]/.test(name)) return res.json({ok:false,message:'Неправильное название'});
      await pool.query('INSERT INTO countries(name,economy,army,status,points,x,y,owner,flag) VALUES(?,?,?,?,?,?,?,?,?)',[name,0,'{}','peace',0,x,y,req.user.login,flag]);
      return res.json({ok:true});
    }

    if(op==='assign_owner' && req.user.role==='owner'){
      const [crows] = await pool.query('SELECT * FROM countries WHERE id=?',[countryId]);
      if(crows.length===0) return res.json({ok:false,message:'Страна не найдена'});
      const [urows] = await pool.query('SELECT * FROM users WHERE login=?',[login]);
      if(urows.length===0) return res.json({ok:false,message:'Пользователь не найден'});
      await pool.query('UPDATE countries SET owner=? WHERE id=?',[login,countryId]);
      return res.json({ok:true});
    }

    if(op==='toggle_economy' && (req.user.role==='owner'||req.user.role==='admin')){
      const [rows] = await pool.query('SELECT value FROM settings WHERE name="economy"');
      let val = rows.length?rows[0].value==='1':true;
      val = !val;
      await pool.query('INSERT INTO settings(name,value) VALUES("economy",?) ON DUPLICATE KEY UPDATE value=?',[val?1:0,val?1:0]);
      return res.json({ok:true,value:val});
    }

    if(op==='view_logs' && req.user.role==='admin'){
      const [logs] = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC');
      return res.json({ok:true,logs});
    }

    res.json({ok:false,message:'Неизвестная операция или нет прав'});
  }catch(e){ res.json({ok:false,message:e.message}); }
});

// --- Front ---
app.get('*',(req,res)=>{ res.sendFile(path.join(__dirname,'public','index.html')); });

app.listen(PORT,()=>console.log('Server running on port '+PORT));
