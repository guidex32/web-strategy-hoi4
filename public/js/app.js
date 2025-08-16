const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];
let FLAG_ELEMENTS = {};
let LAST_ADMIN_POINTS = 0;

const $ = id => document.getElementById(id);
const dlgAuth = $('dlg-auth');
const dlgPrompt = $('dlg-prompt');
const dlgLogs = $('dlg-logs');

function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

// --- Auth ---
async function apiAuth(op, data){
  const res = await fetch(`${API}/auth`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization': TOKEN ? 'Bearer '+TOKEN : ''
    },
    body: JSON.stringify({op, ...data})
  });
  return res.json();
}

async function checkSession(){
  if(!TOKEN) {
    USER = null;
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
    return false;
  }
  const r = await apiAuth('session',{});
  if(r.user){
    USER = r.user;
    TOKEN = r.token || TOKEN;
    localStorage.setItem('token', TOKEN);
    $('user-info').textContent = USER.login+' ('+USER.role+')';
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role==='admin' || USER.role==='owner') show($('admin-panel'));
    else hide($('admin-panel'));
    return true;
  } else {
    TOKEN=''; localStorage.removeItem('token'); USER=null;
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
    return false;
  }
}

// --- Login/Register ---
$('btn-login').onclick = ()=>dlgAuth.showModal();
$('btn-logout').onclick = async ()=>{
  TOKEN=''; USER=null; localStorage.removeItem('token');
  await checkSession();
};

$('btn-register').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login || !pass) return alert('Введите логин и пароль');
  const r = await apiAuth('register',{login,password:pass});
  if(r.ok){
    const lr = await apiAuth('login',{login,password:pass});
    if(lr.ok){
      TOKEN=lr.token; localStorage.setItem('token', TOKEN); USER=lr.user;
      dlgAuth.close(); await checkSession(); await loadCountries();
    } else alert(lr.message);
  } else alert(r.message);
};

$('btn-signin').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login || !pass) return alert('Введите логин и пароль');
  const r = await apiAuth('login',{login,password:pass});
  if(r.ok){
    TOKEN=r.token; localStorage.setItem('token', TOKEN); USER=r.user;
    dlgAuth.close(); await checkSession(); await loadCountries();
  } else alert(r.message);
};

// --- Countries ---
async function apiCountries(){
  if(!TOKEN) return;
  const res = await fetch(`${API}/countries`,{
    headers:{ 'Authorization':'Bearer '+TOKEN }
  });
  const data = await res.json();
  if(!data || typeof data!=='object'){
    console.error('Invalid countries', data);
    if(data.message==='Invalid token'){ TOKEN=''; localStorage.removeItem('token'); await checkSession(); }
    return;
  }
  COUNTRIES = {};
  data.forEach(c=>COUNTRIES[c.id]=c);
  updateMapFlags();
  updatePoints();
}

async function loadCountries(){ await apiCountries(); }

// --- Update Map ---
function updateMapFlags(){
  const mapObj = $('map');
  if(!mapObj) return;
  mapObj.onload = ()=>{
    const svgDoc = mapObj.contentDocument;
    if(!svgDoc) return;
    // очистка старых флагов
    Object.values(FLAG_ELEMENTS).forEach(el=>el.remove());
    FLAG_ELEMENTS = {};
    Object.values(COUNTRIES).forEach(c=>{
      if(!c.x || !c.y) return; // координаты страны в БД
      const f = document.createElement('div');
      f.className='country-flag';
      f.textContent=c.name[0].toUpperCase();
      f.style.left=c.x+'px';
      f.style.top=c.y+'px';
      f.onclick=()=>selectCountry(c.id);
      $('map').parentElement.appendChild(f);
      FLAG_ELEMENTS[c.id]=f;
    });
  };
}

// --- Country info ---
let SELECTED_COUNTRY = null;
function selectCountry(id){
  const c = COUNTRIES[id];
  if(!c) return;
  SELECTED_COUNTRY=id;
  $('info-country').textContent=c.name;
  $('info-owner').textContent=c.owner||'—';
  $('info-econ').textContent=c.economy||0;
  const armyArr=[];
  for(const u in c.army) if(c.army[u]) armyArr.push(`${u}:${c.army[u]}`);
  $('info-army').textContent=armyArr.length?armyArr.join(', '):'нет';
  $('info-status').textContent=c.status;
}

// --- Points ---
function updatePoints(){
  let total=0;
  Object.values(COUNTRIES).forEach(c=>{ total+=c.points||0; });
  $('points').textContent='Очки: '+total;
}

// --- Actions ---
document.querySelectorAll('#actions .btn').forEach(btn=>{
  btn.onclick=async ()=>{
    if(!USER) return alert('Сначала войдите');
    if(!SELECTED_COUNTRY && btn.dataset.action!=='admin-open') return alert('Выберите страну');
    const action = btn.dataset.action;
    const countryId = SELECTED_COUNTRY;
    const cost = parseInt(btn.dataset.cost||0);
    const unit = btn.dataset.unit;

    if(action==='admin-open'){ show($('admin-panel')); return; }
    if(action==='economy-spend'){ await apiOp('build_economy',{countryId,cost}); await loadCountries(); return; }
    if(action==='buy-unit'){ await apiOp('buy_unit',{countryId,unit,cost}); await loadCountries(); return; }
    if(action==='declare-war'){
      const target = prompt('ID страны для войны:'); if(!target) return;
      await apiOp('declare_war',{attackerId:countryId,defenderId:target});
      await loadCountries(); return;
    }
    if(action==='attack'){
      const target = prompt('ID страны для атаки:'); if(!target) return;
      const res = await apiOp('attack',{attackerId:countryId,defenderId:target});
      alert('Потери противника: '+(res.lost||0));
      await loadCountries(); return;
    }
  };
});

// --- Admin panel ---
document.querySelectorAll('#admin-panel .btn').forEach(btn=>{
  btn.onclick=async ()=>{
    if(!USER) return alert('Сначала войдите');
    if(USER.role!=='owner' && USER.role!=='admin') return alert('Только для админа или владельца');

    const op = btn.dataset.admin;
    if(op==='create-country'){
      const name = prompt('Название страны (только буквы):'); 
      if(!name || /\d/.test(name)) return alert('Неверное имя');
      const x = parseInt(prompt('Координата X на карте:'));
      const y = parseInt(prompt('Координата Y на карте:'));
      if(isNaN(x)||isNaN(y)) return alert('Неверные координаты');
      await apiOp('create_country',{name,x,y});
      await loadCountries(); return;
    }
    if(op==='assign-owner'){
      const countryId=prompt('ID страны:'); if(!countryId) return;
      const login=prompt('Логин нового владельца:'); if(!login) return;
      await apiOp('assign_owner',{countryId,login});
      await loadCountries(); return;
    }
    if(op==='give-points'){
      const countryId=prompt('ID страны:'); if(!countryId) return;
      const c = COUNTRIES[countryId]; if(!c) return alert('Страна не найдена');
      let amount = parseInt(prompt('Количество очков:')); if(isNaN(amount)) return alert('Только цифры');
      const now = Date.now();
      if(USER.role==='admin' && now-LAST_ADMIN_POINTS<60000) return alert('Кд 1 минута');
      await apiOp('give_points',{countryId,amount});
      if(USER.role==='admin') LAST_ADMIN_POINTS=now;
      await loadCountries(); return;
    }
    if(op==='view-logs'){
      const r = await apiOp('logs',{}); $('logs-view').textContent = r.logs.map(l=>JSON.stringify(l)).join('\n'); show(dlgLogs);
      return;
    }
  };
});

// --- API wrapper ---
async function apiOp(op,data){
  const res = await fetch(`${API}`,{
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+TOKEN },
    body: JSON.stringify({op,...data})
  });
  const r = await res.json();
  if(!r.ok) alert(r.message||'Ошибка');
  return r;
}

// --- Init ---
(async()=>{ await checkSession(); await loadCountries(); })();
