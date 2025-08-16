const API = 'https://web-strategy-hoi4.onrender.com/api'; // теперь все запросы идут к /api
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

const $ = id => document.getElementById(id);
const dlgAuth = $('dlg-auth');
const dlgPrompt = $('dlg-prompt');
const dlgLogs = $('dlg-logs');

function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

// --- Auth ---
async function apiAuth(op, data){
  const res = await fetch(`${API}/auth`, {
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
  const r = await apiAuth('session', {});
  if(r.user){
    USER = r.user;
    TOKEN = TOKEN || '';
    localStorage.setItem('token', TOKEN);
    $('user-info').textContent = USER.login+' ('+USER.role+')';
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role!=='admin') hide($('admin-panel'));
    else show($('admin-panel'));
  } else {
    USER = null;
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
  }
}

// --- Login/Register ---
$('btn-login').onclick = ()=>dlgAuth.showModal();
$('btn-logout').onclick = ()=>{
  TOKEN = ''; USER = null;
  localStorage.removeItem('token');
  checkSession();
};

$('btn-register').onclick = async e => {
  e.preventDefault();
  const login = $('auth-username').value.trim();
  const pass = $('auth-password').value.trim();
  const r = await apiAuth('register', {login, password: pass});
  alert(r.message);
};

$('btn-signin').onclick = async e => {
  e.preventDefault();
  const login = $('auth-username').value.trim();
  const pass = $('auth-password').value.trim();
  const r = await apiAuth('login', {login, password: pass});
  if(r.ok){
    TOKEN = r.token || 'FAKETOKEN';
    localStorage.setItem('token', TOKEN);
    USER = r.user;
    dlgAuth.close();
    checkSession();
    loadCountries();
  } else alert(r.message);
};

// --- Countries ---
async function apiCountries(){
  const res = await fetch(`${API}/countries`, {
    headers:{'Authorization':'Bearer '+TOKEN}
  });
  const data = await res.json();
  COUNTRIES = data;
  updateInfo(null);
  updateMap();
  updatePoints();
}

async function loadCountries(){ await apiCountries(); }

// --- Map & Info ---
function updateInfo(countryId){
  const infoCountry=$('info-country');
  const infoOwner=$('info-owner');
  const infoEcon=$('info-econ');
  const infoArmy=$('info-army');
  const infoStatus=$('info-status');

  if(!countryId){ infoCountry.textContent='—'; infoOwner.textContent='—'; infoEcon.textContent='0'; infoArmy.textContent='нет'; infoStatus.textContent='мир'; return;}

  const c = COUNTRIES.find(x=>x.id==countryId);
  if(!c) return;
  infoCountry.textContent=c.name;
  infoOwner.textContent=c.owner || '—';
  infoEcon.textContent=c.economy || 0;
  const army = JSON.parse(c.army || '{}');
  infoArmy.textContent = Object.entries(army).map(([k,v])=>`${k}:${v}`).join(', ')||'нет';
  infoStatus.textContent = c.status;
}

function updatePoints(){
  const total = COUNTRIES.reduce((a,c)=>a+(c.points||0),0);
  $('points').textContent = 'Очки: '+total;
}

// --- Map ---
function updateMap(){
  const svg = $('map').contentDocument;
  if(!svg) return;
  svg.querySelectorAll('path').forEach(p=>{
    const c = COUNTRIES.find(x=>x.name === p.id);
    p.style.fill = c && c.owner ? '#4cc9f0' : '#12151b';
  });
}

// --- Actions ---
async function doAction(action, el){
  if(!USER) { alert('Нужна авторизация'); return; }
  const cost = parseInt(el.dataset.cost || 0);
  const unit = el.dataset.unit;
  const countryId = COUNTRIES[0]?.id || 1; // берем первую страну

  let body = {op: action, countryId, unit, cost};

  if(action==='declare-war' || action==='attack'){
    const defenderId = prompt('ID страны?');
    body.attackerId = countryId;
    body.defenderId = defenderId;
  }

  if(action==='create-country'){
    const name = prompt('Название страны?');
    if(!name) return;
    body.name = name;
  }

  const res = await fetch(`${API}`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
    body: JSON.stringify(body)
  });
  const r = await res.json();

  if(r.ok){
    alert(action==='buy-unit'?'Куплено!':action==='declare-war'?'Война объявлена!':action==='attack'?'Атака прошла!':action==='create-country'?'Создано!':'OK');
    await loadCountries();
  } else alert(r.message);
}

// --- Admin ---
$('admin-panel').onclick = e=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  const op = btn.dataset.admin;
  if(op==='view-logs'){
    fetch(`${API}/logs`,{headers:{'Authorization':'Bearer '+TOKEN}})
      .then(r=>r.json())
      .then(data=>{
        $('logs-view').textContent = data.map(l=>`${l.timestamp}: ${l.text}`).join('\n');
        dlgLogs.showModal();
      });
  } else {
    doAction(op, btn);
  }
};

// --- Map hover ---
$('map').addEventListener('load', ()=>{
  const svg = $('map').contentDocument;
  if(!svg) return;
  svg.querySelectorAll('path').forEach(p=>{
    p.addEventListener('mouseenter', e=>{
      const id = p.id;
      const c = COUNTRIES.find(x=>x.name===id);
      if(c){
        const tip = $('tooltip');
        tip.textContent = c.name;
        tip.style.left = e.pageX+'px';
        tip.style.top = e.pageY+'px';
        show(tip);
        updateInfo(c.id);
      }
    });
    p.addEventListener('mouseleave', ()=>{
      hide($('tooltip'));
      updateInfo(null);
    });
  });
});

// --- Global action buttons ---
document.querySelectorAll('[data-action]').forEach(btn=>{
  btn.onclick = ()=>doAction(btn.dataset.action, btn);
});

// --- Init ---
checkSession();
loadCountries();
