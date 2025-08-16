const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];
let ECONOMY_ON = true;

const $ = id => document.getElementById(id);
const dlgAuth = $('dlg-auth');
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

  const r = await apiAuth('session', {});
  if(r.user){
    USER = r.user;
    $('user-info').textContent = USER.login+' ('+USER.role+')';
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role==='admin' || USER.role==='owner') show($('admin-panel'));
    else hide($('admin-panel'));
    return true;
  } else {
    USER = null;
    TOKEN = '';
    localStorage.removeItem('token');
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
    return false;
  }
}

// --- Login/Register ---
$('btn-login').onclick = ()=>dlgAuth.showModal();

$('btn-logout').onclick = async ()=>{
  TOKEN=''; USER=null;
  localStorage.removeItem('token');
  await checkSession();
};

$('btn-register').onclick = async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login || !pass) return alert('Введите логин и пароль');
  const r = await apiAuth('register',{login,password:pass});
  if(r.ok){
    TOKEN=r.token;
    localStorage.setItem('token', TOKEN);
    USER=r.user;
    dlgAuth.close();
    await checkSession();
    await loadCountries();
  } else alert(r.message);
};

$('btn-signin').onclick = async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login || !pass) return alert('Введите логин и пароль');
  const r = await apiAuth('login',{login,password:pass});
  if(r.ok){
    TOKEN=r.token;
    localStorage.setItem('token', TOKEN);
    USER=r.user;
    dlgAuth.close();
    await checkSession();
    await loadCountries();
  } else alert(r.message);
};

// --- Load countries ---
async function loadCountries(){
  if(!TOKEN) return;
  const res = await fetch(`${API}/countries`,{
    headers:{ 'Authorization':'Bearer '+TOKEN }
  });
  const data = await res.json();
  COUNTRIES = data;
  updateMap();
  updatePoints();
}

// --- Map ---
let SELECTED_COUNTRY = null;
const mapObj = $('map');
mapObj.onload = () => {
  const svgDoc = mapObj.contentDocument;
  if(!svgDoc) return;
  Object.values(COUNTRIES).forEach(c=>{
    const el = svgDoc.getElementById(c.id);
    if(el){
      el.style.fill = '#ccc';
      el.style.stroke = '#333';
      el.style.cursor = 'pointer';
      el.onclick = ()=>selectCountry(c.id);
      el.onmouseenter = ()=>showTooltip(c.id);
      el.onmouseleave = ()=>hideTooltip();
    }
  });

  // --- Клик по карте для создания страны ---
  svgDoc.addEventListener('click', async e=>{
    if(!USER || USER.role!=='owner') return;
    if(!window.createCountryMode) return;
    const pt = svgDoc.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svgDoc.getElementById('map').getScreenCTM().inverse());
    const x = Math.round(svgPt.x), y = Math.round(svgPt.y);
    const name = prompt('Название страны (без цифр):');
    if(!name || /[0-9]/.test(name)) return alert('Некорректное название');
    const r = await apiOp('create_country',{name,x,y});
    if(r.ok){
      window.createCountryMode = false;
      await loadCountries();
    } else alert(r.message);
  });
};

// --- Tooltip ---
function showTooltip(id){
  const tt = $('tooltip');
  const country = COUNTRIES[id];
  if(!country) return;
  tt.textContent = country.name;
  tt.classList.remove('hidden');
}
function hideTooltip(){
  $('tooltip').classList.add('hidden');
}

// --- Select country ---
function selectCountry(id){
  const c = COUNTRIES[id];
  if(!c) return;
  SELECTED_COUNTRY = id;
  $('info-country').textContent = c.name;
  $('info-owner').textContent = c.owner || '—';
  $('info-econ').textContent = c.economy || 0;
  const armyArr = [];
  for(const u in c.army) if(c.army[u]) armyArr.push(`${u}:${c.army[u]}`);
  $('info-army').textContent = armyArr.length?armyArr.join(', '):'нет';
  $('info-status').textContent = c.status;
}

// --- Update points ---
function updatePoints(){
  let total = 0;
  Object.values(COUNTRIES).forEach(c=>{ total += c.points||0; });
  $('points').textContent = 'Очки: '+total;
}

// --- Action buttons ---
document.querySelectorAll('#actions .btn').forEach(btn=>{
  btn.onclick = async ()=>{
    if(!USER) return alert('Сначала войдите');
    const action = btn.dataset.action;
    if(action==='admin-open'){ show($('admin-panel')); return; }
    if(!SELECTED_COUNTRY && !['admin-open'].includes(action)) return alert('Выберите страну');

    if(action==='economy-spend'){
      await apiOp('toggle_economy',{});
      await loadCountries();
    }
    if(action==='buy-unit'){
      await apiOp('buy_unit',{countryId:SELECTED_COUNTRY,unit:btn.dataset.unit,cost:btn.dataset.cost});
      await loadCountries();
    }
    if(action==='declare-war'){
      const target = prompt('ID страны для войны:');
      if(!target) return;
      await apiOp('declare_war',{attackerId:SELECTED_COUNTRY,defenderId:target});
      await loadCountries();
    }
    if(action==='attack'){
      const target = prompt('ID страны для атаки:');
      if(!target) return;
      const res = await apiOp('attack',{attackerId:SELECTED_COUNTRY,defenderId:target});
      alert('Потери противника: '+(res.lost||0));
      await loadCountries();
    }
  };
});

// --- Admin panel ---
document.querySelectorAll('#admin-panel .btn').forEach(btn=>{
  btn.onclick = async ()=>{
    if(!USER || !['admin','owner'].includes(USER.role)) return alert('Только для админа/овнера');
    const op = btn.dataset.admin;

    if(op==='create-country'){ window.createCountryMode = true; alert('Кликните на карту для создания страны'); return; }
    if(op==='assign-owner'){
      const countryId = prompt('ID страны:'); if(!countryId) return;
      const login = prompt('Логин нового владельца:'); if(!login) return;
      await apiOp('assign_owner',{countryId,login});
      await loadCountries();
    }
    if(op==='give-points'){
      const countryId = prompt('ID страны:'); if(!countryId) return;
      const amount = prompt('Количество очков:'); if(!countryId || isNaN(amount)) return alert('Ошибка');
      await apiOp('give_points',{countryId,amount});
      await loadCountries();
    }
    if(op==='toggle-economy'){ await apiOp('toggle_economy',{}); await loadCountries(); }
    if(op==='view-logs'){
      const r = await fetch(`${API}/logs`, {headers:{'Authorization':'Bearer '+TOKEN}});
      const logs = await r.json();
      $('logs-view').textContent = logs.map(l=>JSON.stringify(l)).join('\n');
      show($('dlg-logs'));
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
(async()=>{
  await checkSession();
  await loadCountries();
})();
