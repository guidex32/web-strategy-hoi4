const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MySQL connection ---
const dbConfig = {
  host: '51.38.13.75',
  user: 'gs10071',
  password: 'fCEJNemIUB',
  database: 'gs10071', // укажи своё название базы
  port: 3306
};

let connection;
async function initDB() {
  connection = await mysql.createConnection(dbConfig);
  console.log('✅ MySQL connected');
}
initDB().catch(err => console.error(err));

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Serve index.html ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Auth ---
app.post('/auth', async (req, res) => {
  const { op, login, password } = req.body;

  try {
    if(op==='register'){
      const [rows] = await connection.execute('SELECT * FROM users WHERE login=?', [login]);
      if(rows.length>0) return res.json({ok:false,message:'Логин уже занят'});
      await connection.execute('INSERT INTO users (login,password,role) VALUES (?,?,?)', [login,password,'player']);
      return res.json({ok:true,message:'Регистрация успешна'});
    }

    if(op==='login'){
      const [rows] = await connection.execute('SELECT * FROM users WHERE login=? AND password=?', [login,password]);
      if(rows.length===0) return res.json({ok:false,message:'Неверные данные'});
      const user = rows[0];
      return res.json({ok:true, user, token: 'fake-token-'+user.id}); // токен упрощённо
    }

    if(op==='session'){
      return res.json({user:null}); // пока без реальной сессии
    }

    res.json({ok:false,message:'Неизвестная операция'});
  } catch(e){
    console.error(e);
    res.status(500).json({ok:false,message:'Ошибка сервера'});
  }
});

// --- Countries ---
app.get('/countries', async (req,res)=>{
  try{
    const [rows] = await connection.execute('SELECT * FROM countries');
    res.json(rows);
  }catch(e){console.error(e); res.status(500).json({ok:false,message:'Ошибка'});}
});

// --- Actions / Admin ---
app.post('/api', async (req,res)=>{
  const { op, countryId, unit, cost, name } = req.body;
  try{
    if(op==='buy_unit'){
      const [rows] = await connection.execute('SELECT army FROM countries WHERE id=?',[countryId]);
      const army = JSON.parse(rows[0].army||'{}');
      army[unit]=(army[unit]||0)+1;
      await connection.execute('UPDATE countries SET army=? WHERE id=?',[JSON.stringify(army),countryId]);
      return res.json({ok:true});
    }

    if(op==='create_country'){
      await connection.execute('INSERT INTO countries (name, economy, army, points, status) VALUES (?,?,?,?,?)',[name,0,'{}',0,'мир']);
      return res.json({ok:true});
    }

    res.json({ok:false,message:'Неизвестная операция'});
  }catch(e){console.error(e); res.status(500).json({ok:false,message:'Ошибка'});}
});

// --- Logs ---
app.get('/logs', (req,res)=>{
  res.json([{timestamp:new Date().toISOString(),text:'Логи пока пустые'}]);
});

// --- Start server ---
app.listen(PORT, ()=>console.log(`🚀 Server started on port ${PORT}`));
