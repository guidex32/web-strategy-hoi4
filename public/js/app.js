const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

const $ = id=>document.getElementById(id);
const dlgAuth=$('dlg-auth');
const tooltip=$('tooltip');

function show(el){el.classList.remove('hidden');}
function hide(el){el.classList.add('hidden');}

// --- Auth ---
async function apiAuth(op,data){
  const res = await fetch(`${API}/auth`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':TOKEN?'Bearer '+TOKEN:''},
    body: JSON.stringify({op,...data})
  });
  return res.json();
}

async function checkSession(){
  if(!TOKEN){USER=null; hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel')); return;}
  const r = await apiAuth('session',{});
  if(r.user){
    USER=r.user;
    TOKEN=r.token || TOKEN;
    localStorage.setItem('token',TOKEN);
    $('user-info').textContent = USER.login+' ('+USER.role+')';
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role==='admin') show($('admin-panel')); else hide($('admin-panel'));
  } else {USER=null; TOKEN=''; localStorage.removeItem('token'); hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel'));}
}

// --- Login/Register ---
$('btn-login').onclick=()=>dlgAuth.showModal();
$('btn-logout').onclick=async ()=>{TOKEN=''; USER=null; localStorage.removeItem('token'); await checkSession();};

$('btn-register').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login||!pass)return alert('Введите логин и пароль');
  const r = await apiAuth('register',{login,password:pass});
  if(r.ok){
    const lr = await apiAuth('login',{login,password:pass});
    if(lr.ok){TOKEN=lr.token; localStorage.setItem('token',TOKEN); USER=lr.user; dlgAuth.close(); await checkSession(); await loadCountries();}
    else alert(lr.message);
  } else alert(r.message);
};

$('btn-signin').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login||!pass)return alert('Введите логин и пароль');
  const r = await apiAuth('login',{login,password:pass});
  if(r.ok){TOKEN=r.token; localStorage.setItem('token',TOKEN); USER=r.user; dlgAuth.close(); await checkSession(); await loadCountries();}
  else alert(r.message);
};

// --- Countries ---
async function apiCountries(){
  if(!TOKEN) return;
  const res = await fetch(`${API}/countries`,{headers:{'Authorization':'Bearer '+TOKEN}});
  const data = await res.json();
  COUNTRIES=data;
  updateMap();
  updateInfo(null);
  updatePoints();
}
async function loadCountries(){await apiCountries();}

// --- Map ---
function updateMap(){
  const mapObj = $('map');
  if(!mapObj) return;
  mapObj.onload = ()=>{
    const svgDoc = mapObj.contentDocument;
    if(!svgDoc) return;
    Object.keys(COUNTRIES).forEach(id=>{
      const el = svgDoc.getElementById(id);
      if(el){
        el.style.fill='#ccc';
        el.style.stroke='#333';
        el.style.cursor='pointer';
        el.onclick=()=>selectCountry(id);
        el.onmouseenter=()=>showTooltip(id);
        el.onmouseleave=()=>hideTooltip();
      }
    });
  };
}

// --- Tooltip ---
function showTooltip(id){if(!COUNTRIES[id])return; tooltip.textContent=COUNTRIES[id].name; show(tooltip);}
function hideTooltip(){hide(tooltip);}

// --- Info & Actions ---
let SELECTED_COUNTRY=null;
function selectCountry(id){
  const c=COUNTRIES[id]; if(!c) return;
  SELECTED_COUNTRY=id;
  $('info-country').textContent=c.name;
  $('info-owner').textContent=c.owner||'—';
  $('info-econ').textContent=c.economy||0;
  const armyArr=[]; for(const u in c.army) if(c.army[u]) armyArr.push(`${u}:${c.army[u]}`);
  $('info-army').textContent=armyArr.length?armyArr.join(', '):'нет';
  $('info-status').textContent=c.status;
}

// --- Points ---
function updatePoints(){
  let total=0; Object.values(COUNTRIES).forEach(c=>total+=c.points||0);
  $('points').textContent='Очки: '+total;
}

// --- Action buttons ---
document.querySelectorAll('#actions .btn').forEach(btn=>{
  btn.onclick=async ()=>{
    if(!USER) return alert('Сначала войдите');
    if(!SELECTED_COUNTRY && btn.dataset.action!=='admin-open') return alert('Выберите страну');
    const action=btn.dataset.action; const countryId=SELECTED_COUNTRY;
    if(action==='admin-open'){if(USER.role!=='admin') return alert('Только для админа'); show($('admin-panel')); return;}
    if(action==='buy-unit'){await apiOp('buy_unit',{countryId,unit:btn.dataset.unit}); await loadCountries(); return;}
    if(action==='declare-war'){const target=prompt('ID страны для войны:'); if(!target) return; await apiOp('declare_war',{attackerId:countryId,defenderId:target}); await loadCountries(); return;}
    if(action==='attack'){const target=prompt('ID страны для атаки:'); if(!target) return; const res=await apiOp('attack',{attackerId:countryId,defenderId:target}); alert('Потери противника: '+(res.lost||0)); await loadCountries(); return;}
  };
});

// --- Admin panel ---
document.querySelectorAll('#admin-panel .btn').forEach(btn=>{
  btn.onclick=async ()=>{
    if(USER.role!=='admin') return alert('Только для админа');
    const op=btn.dataset.admin;
    if(op==='create-country'){const name=prompt('Название страны:'); if(!name) return; await apiOp('create_country',{name}); await loadCountries(); return;}
  };
});

// --- API wrapper ---
async function apiOp(op,data){
  const res = await fetch(`${API}`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
    body: JSON.stringify({op,...data})
  });
  const r = await res.json(); if(!r.ok) alert(r.message||'Ошибка'); return r;
}

// --- Init ---
(async()=>{await checkSession(); await loadCountries();})();
