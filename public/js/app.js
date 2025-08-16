const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token')||'';
let USER = null;
let COUNTRIES = [];

const $ = id=>document.getElementById(id);
const dlgAuth=$('dlg-auth');
const dlgLogs=$('dlg-logs');

function show(el){el.classList.remove('hidden');}
function hide(el){el.classList.add('hidden');}

// --- Auth ---
async function apiAuth(op,data){
  const res = await fetch(`${API}/auth`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({op,...data})
  });
  return res.json();
}

async function checkSession(){
  if(!TOKEN){ USER=null; hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel')); return false; }
  try {
    const r = await fetch(`${API}/session`,{ headers:{'Authorization':'Bearer '+TOKEN} });
    const data = await r.json();
    if(data.ok && data.user){
      USER=data.user;
      $('user-info').textContent=USER.login+' ('+USER.role+')';
      show($('user-info')); show($('btn-logout')); hide($('btn-login'));
      if(USER.role==='admin'||USER.role==='owner') show($('admin-panel')); else hide($('admin-panel'));
      return true;
    } else {
      TOKEN=''; USER=null; localStorage.removeItem('token');
      hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel'));
      return false;
    }
  } catch(e){ console.error(e); return false; }
}

// --- Login/Register ---
$('btn-login').onclick=()=>dlgAuth.showModal();
$('btn-logout').onclick=async ()=>{
  TOKEN=''; USER=null; localStorage.removeItem('token');
  await checkSession();
};

$('btn-register').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login||!pass) return alert('Введите логин и пароль');
  const r = await apiAuth('register',{login,password:pass});
  if(r.ok){ TOKEN=r.token; localStorage.setItem('token',TOKEN); USER=r.user; dlgAuth.close(); await checkSession(); await loadCountries(); }
  else alert(r.message);
};

$('btn-signin').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login||!pass) return alert('Введите логин и пароль');
  const r = await apiAuth('login',{login,password:pass});
  if(r.ok){ TOKEN=r.token; localStorage.setItem('token',TOKEN); USER=r.user; dlgAuth.close(); await checkSession(); await loadCountries(); }
  else alert(r.message);
};

// --- Load countries ---
async function loadCountries(){
  if(!TOKEN) return;
  const res = await fetch(`${API}/countries`,{ headers:{'Authorization':'Bearer '+TOKEN} });
  COUNTRIES = await res.json();
  updateMap(); updatePoints();
}

// --- Map / Actions / Admin ---
function updateMap(){ /* здесь логика отображения карты и войск */ }
function updatePoints(){ /* обновление очков */ }

// --- On start ---
checkSession().then(loadCountries);
