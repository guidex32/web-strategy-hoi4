const API = 'https://web-strategy-hoi4.onrender.com'; // твой Node сервер на Render
let TOKEN = localStorage.getItem('token')||'';
let USER = null;
let COUNTRIES = [];

const $ = id=>document.getElementById(id);
const dlgAuth=$('dlg-auth');
const dlgPrompt=$('dlg-prompt');
const dlgLogs=$('dlg-logs');

function show(el){el.classList.remove('hidden');}
function hide(el){el.classList.add('hidden');}

// --- Auth ---
async function apiAuth(op,data){
  const res = await fetch(`${API}/auth`,{
    method:'POST',
    headers:{'Content-Type':'application/json', 'Authorization': TOKEN?'Bearer '+TOKEN:''},
    body: JSON.stringify({op,...data})
  });
  return res.json();
}

async function checkSession(){
  const r = await apiAuth('session',{});
  if(r.user){
    USER = r.user;
    TOKEN = TOKEN || '';
    localStorage.setItem('token',TOKEN);
    $('user-info').textContent = USER.login+' ('+USER.role+')';
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role!=='admin') hide($('admin-panel'));
    else show($('admin-panel'));
  }else{
    USER = null;
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
  }
}

// --- Login/Register ---
$('btn-login').onclick = ()=>dlgAuth.showModal();
$('btn-logout').onclick = ()=>{
  TOKEN=''; USER=null;
  localStorage.removeItem('token');
  checkSession();
};

$('btn-register').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  const r = await apiAuth('register',{login,password:pass});
  alert(r.message);
};
$('btn-signin').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  const r = await apiAuth('login',{login,password:pass});
  if(r.ok){
    TOKEN=r.token;
    localStorage.setItem('token',TOKEN);
    USER=r.user;
    dlgAuth.close();
    checkSession();
    loadCountries();
  }else alert(r.message);
};

// --- Countries ---
async function apiCountries(){
  const res = await fetch(`${API}/countries`);
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
  infoOwner.textContent=c.owner||'—';
  infoEcon.textContent=c.economy||0;
  const army = JSON.parse(c.army||'{}');
  infoArmy.textContent = Object.entries(army).map(([k,v])=>`${k}:${v}`).join(', ')||'нет';
  infoStatus.textContent=c.status;
}

function updatePoints(){
  const total = COUNTRIES.reduce((a,c)=>a+(c.points||0),0);
  $('points').textContent = 'Очки: '+total;
}

// --- Init ---
checkSession();
loadCountries();
