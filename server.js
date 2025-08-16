const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});

const CFG_PATH = path.join(DATA_DIR, 'config.json');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const COUNTRIES_PATH = path.join(DATA_DIR, 'countries.json');
const LOGS_PATH = path.join(DATA_DIR, 'logs.json');

// Default data
function readJson(p, def){ try{ return JSON.parse(fs.readFileSync(p, 'utf8')); } catch{ return def; } }
function writeJson(p, v){ fs.writeFileSync(p, JSON.stringify(v, null, 2), 'utf8'); }

const cfg = Object.assign({
  ALLOW_REG: true,
  ECONOMY_ENABLED: true,
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: ''
}, readJson(CFG_PATH, {}));

let users = readJson(USERS_PATH, {});
let countries = readJson(COUNTRIES_PATH, {
  "1": {"name":"Страна 1","owner":null,"economy":1,"points":5,"status":"мир","atwarWith":{},"army":{"tank":1,"pvo":0,"btr":0}},
  "2": {"name":"Страна 2","owner":null,"economy":0,"points":3,"status":"мир","atwarWith":{},"army":{"tank":0,"pvo":1,"btr":1}}
});
let logs = readJson(LOGS_PATH, []);

// Save on start to ensure files exist
writeJson(CFG_PATH, cfg);
writeJson(USERS_PATH, users);
writeJson(COUNTRIES_PATH, countries);
writeJson(LOGS_PATH, logs);

// Helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';
function logEvent(text){
  const t = new Date().toISOString().replace('T',' ').slice(0,19);
  const line = `[${t}] ${text}`;
  logs.push(line);
  if(logs.length > 2000) logs = logs.slice(-2000);
  writeJson(LOGS_PATH, logs);
  // Telegram notify (optional)
  const bot = process.env.TELEGRAM_BOT_TOKEN || cfg.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID || cfg.TELEGRAM_CHAT_ID;
  if(bot && chat && typeof fetch === 'function'){
    fetch(`https://api.telegram.org/bot${bot}/sendMessage?chat_id=${encodeURIComponent(chat)}&text=${encodeURIComponent(line)}`).catch(()=>{});
  }
}

// Auth middleware
function authOptional(req, res, next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if(!token) return next();
  jwt.verify(token, JWT_SECRET, (err, payload)=>{
    if(!err) req.user = payload;
    next();
  });
}
function authRequired(req, res, next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if(!token) return res.status(401).json({ok:false, message:'auth required'});
  jwt.verify(token, JWT_SECRET, (err, payload)=>{
    if(err) return res.status(401).json({ok:false, message:'invalid token'});
    req.user = payload; next();
  });
}
function needRole(role){
  return (req, res, next)=>{
    if(!req.user) return res.status(401).json({ok:false, message:'auth required'});
    if(role === 'owner_or_admin'){
      if(req.user.role === 'admin' || req.user.role === 'owner') return next();
      return res.status(403).json({ok:false, message:'owner/admin only'});
    }
    if(req.user.role !== role) return res.status(403).json({ok:false, message:`${role} only`});
    next();
  };
}

// Static
app.use(express.static(path.join(__dirname, 'public')));

// AUTH
app.post('/auth', authOptional, (req, res)=>{
  const { op } = req.body || {};
  if(op === 'register'){
    if(!(cfg.ALLOW_REG)) return res.status(403).json({ok:false, message:'Регистрация отключена'});
    const login = (req.body.login||'').trim();
    const pass = (req.body.password||'').trim();
    if(!login || !pass) return res.status(400).json({ok:false, message:'Нужны логин и пароль'});
    if(users[login]) return res.status(400).json({ok:false, message:'Пользователь уже есть'});
    users[login] = { login, pass: bcrypt.hashSync(pass, 10), role:'player' };
    writeJson(USERS_PATH, users);
    logEvent(`Новая регистрация: ${login}`);
    return res.json({ok:true, message:'Ок'});
  }
  if(op === 'login'){
    const login = (req.body.login||'').trim();
    const pass = (req.body.password||'').trim();
    const u = users[login];
    if(!u || !bcrypt.compareSync(pass, u.pass||'')) return res.status(400).json({ok:false, message:'Неверные данные'});
    const token = jwt.sign({ login: u.login, role: u.role }, JWT_SECRET, { expiresIn: '12h' });
    logEvent(`${u.login} вошёл в систему`);
    return res.json({ok:true, token, user:{login:u.login, role:u.role}});
  }
  if(op === 'session'){
    if(!req.user) return res.json({ok:true, user:null});
    return res.json({ok:true, user:{login:req.user.login, role:req.user.role}});
  }
  return res.status(400).json({ok:false, message:'unknown op'});
});

// API
app.post('/api', authOptional, (req, res)=>{
  const { op } = req.body || {};
  function save(){ writeJson(COUNTRIES_PATH, countries); }
  function ensureCountry(id, name){
    if(!countries[id]) countries[id] = {name: name || ('Страна ' + id), owner:null, economy:0, points:0, status:'мир', atwarWith:{}, army:{tank:0,pvo:0,btr:0}};
  }

  if(op === 'list'){
    return res.json({ok:true, countries});
  }

  // owner/admin
  if(op === 'buy_unit'){
    if(!req.user || (req.user.role!=='admin' && req.user.role!=='owner')) return res.status(403).json({ok:false, message:'owner/admin only'});
    const { countryId, unit, cost } = req.body;
    if(!countries[countryId]) return res.status(400).json({ok:false, message:'Нет страны'});
    if(req.user.role!=='admin' && countries[countryId].owner !== req.user.login) return res.status(403).json({ok:false, message:'Не твоя страна'});
    const c = countries[countryId];
    if((c.points||0) < (cost||0)) return res.status(400).json({ok:false, message:'Не хватает очков'});
    c.points -= (cost||0);
    c.army[unit||'tank'] = (c.army[unit||'tank']||0) + 1;
    save();
    logEvent(`${req.user.login} купил юнит ${unit} для ${c.name} (-${cost})`);
    return res.json({ok:true});
  }

  if(op === 'build_economy'){
    if(!req.user || (req.user.role!=='admin' && req.user.role!=='owner')) return res.status(403).json({ok:false, message:'owner/admin only'});
    const { countryId, cost } = req.body;
    if(!countries[countryId]) return res.status(400).json({ok:false, message:'Нет страны'});
    if(req.user.role!=='admin' && countries[countryId].owner !== req.user.login) return res.status(403).json({ok:false, message:'Не твоя страна'});
    const c = countries[countryId];
    if((c.points||0) < (cost||0)) return res.status(400).json({ok:false, message:'Не хватает очков'});
    c.points -= (cost||0);
    c.economy += 1;
    save();
    logEvent(`${req.user.login} построил здание экономики для ${c.name} (-${cost})`);
    return res.json({ok:true});
  }

  if(op === 'declare_war'){
    if(!req.user || (req.user.role!=='admin' && req.user.role!=='owner')) return res.status(403).json({ok:false, message:'owner/admin only'});
    const { attackerId, defenderId } = req.body;
    if(!countries[attackerId] || !countries[defenderId]) return res.status(400).json({ok:false, message:'Неверные ID'});
    if(req.user.role!=='admin' && countries[attackerId].owner !== req.user.login) return res.status(403).json({ok:false, message:'Не твоя страна'});
    const A = countries[attackerId], D = countries[defenderId];
    A.status = 'война'; D.status = 'война';
    A.atwarWith[defenderId] = true; D.atwarWith[attackerId] = true;
    save();
    logEvent(`${A.name} объявила войну стране ${D.name}`);
    return res.json({ok:true});
  }

  if(op === 'attack'){
    if(!req.user || (req.user.role!=='admin' && req.user.role!=='owner')) return res.status(403).json({ok:false, message:'owner/admin only'});
    const { attackerId, defenderId } = req.body;
    if(!countries[attackerId] || !countries[defenderId]) return res.status(400).json({ok:false, message:'Неверные ID'});
    if(req.user.role!=='admin' && countries[attackerId].owner !== req.user.login) return res.status(403).json({ok:false, message:'Не твоя страна'});
    const A = countries[attackerId], D = countries[defenderId];
    const atkPower = (A.army.tank||0) + (A.army.btr||0)*0.5;
    const defPower = (D.army.pvo||0)*0.8;
    const dmg = Math.max(1, Math.round(atkPower - defPower));
    const lost = Math.min(D.army.tank||0, dmg);
    D.army.tank = Math.max(0, (D.army.tank||0) - lost);
    writeJson(COUNTRIES_PATH, countries);
    logEvent(`Атака: ${A.name} ударила по ${D.name} (потери у защитника: танков -${lost})`);
    return res.json({ok:true, lost});
  }

  // admin only
  if(op === 'admin_create_country'){
    if(!req.user || req.user.role!=='admin') return res.status(403).json({ok:false, message:'admin only'});
    const name = (req.body.name||'').trim();
    const id = (req.body.id||Math.random().toString(16).slice(2,8));
    if(countries[id]) return res.status(400).json({ok:false, message:'ID занят'});
    countries[id] = {name: name||('Страна '+id), owner:null, economy:0, points:0, status:'мир', atwarWith:{}, army:{tank:0,pvo:0,btr:0}};
    writeJson(COUNTRIES_PATH, countries);
    logEvent(`Админ ${req.user.login} создал страну ${countries[id].name} (ID ${id})`);
    return res.json({ok:true, id});
  }

  if(op === 'admin_assign_owner'){
    if(!req.user || req.user.role!=='admin') return res.status(403).json({ok:false, message:'admin only'});
    const { countryId, login } = req.body;
    if(!countries[countryId]) return res.status(400).json({ok:false, message:'Нет страны'});
    if(!users[login]) return res.status(400).json({ok:false, message:'Нет такого пользователя'});
    users[login].role = 'owner';
    writeJson(USERS_PATH, users);
    countries[countryId].owner = login;
    writeJson(COUNTRIES_PATH, countries);
    logEvent(`Админ ${req.user.login} назначил ${login} владельцем страны ${countries[countryId].name}`);
    return res.json({ok:true});
  }

  if(op === 'admin_give_points'){
    if(!req.user || req.user.role!=='admin') return res.status(403).json({ok:false, message:'admin only'});
    const { countryId, amount } = req.body;
    if(!countries[countryId]) return res.status(400).json({ok:false, message:'Нет страны'});
    countries[countryId].points = (countries[countryId].points||0) + (parseInt(amount)||0);
    writeJson(COUNTRIES_PATH, countries);
    logEvent(`Админ ${req.user.login()} выдал ${amount} очков стране ${countries[countryId].name}`);
    return res.json({ok:true});
  }

  if(op === 'admin_toggle_economy'){
    if(!req.user || req.user.role!=='admin') return res.status(403).json({ok:false, message:'admin only'});
    cfg.ECONOMY_ENABLED = !cfg.ECONOMY_ENABLED;
    writeJson(CFG_PATH, cfg);
    logEvent(`Админ ${req.user.login} переключил экономику: ${cfg.ECONOMY_ENABLED ? 'вкл' : 'выкл'}`);
    return res.json({ok:true, ECONOMY_ENABLED: cfg.ECONOMY_ENABLED});
  }

  if(op === 'admin_logs'){
    if(!req.user || req.user.role!=='admin') return res.status(403).json({ok:false, message:'admin only'});
    return res.json({ok:true, logs});
  }

  return res.status(400).json({ok:false, message:'unknown op'});
});

// Hourly economy tick
function doTick(){
  if(!cfg.ECONOMY_ENABLED) return;
  for(const id of Object.keys(countries)){
    const c = countries[id];
    const income = Math.max(0, parseInt(c.economy)||0);
    c.points = (c.points||0) + income;
  }
  writeJson(COUNTRIES_PATH, countries);
  logEvent('Тик экономики: очки начислены по экономике');
}
setInterval(doTick, 60*60*1000); // hourly
app.get('/cron/tick', (req,res)=>{ doTick(); res.json({ok:true}); });

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', ()=>{
  console.log('Server started on port', PORT);
  logEvent('Сервер запущен');
});
