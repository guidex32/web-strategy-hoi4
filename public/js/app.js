const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

const $ = id => document.getElementById(id);
const dlgAuth = $('dlg-auth');

function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

// --- API --- 
async function apiAuth(op, data){
  try {
    const res = await fetch(`${API}/auth`, {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization': TOKEN ? 'Bearer '+TOKEN : ''},
      body: JSON.stringify({op, ...data})
    });
    return await res.json();
  } catch(err){ console.error('Auth error', err); return {ok:false, message:'Сервер не отвечает'}; }
}

// --- check session ---
async function checkSession(){
  if(!TOKEN){
    USER = null;
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
    return false;
  }
  const r = await apiAuth('session',{});
  if(r.user){
    USER = r.user;
    $('user-info').textContent = `${USER.login} (${USER.role})`;
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role==='admin') show($('admin-panel')); else hide($('admin-panel'));
    return true;
  } else {
    TOKEN=''; USER=null;
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
  const login = $('auth-username').value.trim();
  const pass = $('auth-password').value.trim();
  if(!login || !pass) return alert('Введите логин и пароль');
  const r = await apiAuth('register',{login,password:pass});
  if(r.ok){
    // после регистрации делаем **авто-вход**
    const loginRes = await apiAuth('login',{login,password:pass});
    if(loginRes.ok){
      TOKEN = loginRes.token;
      localStorage.setItem('token', TOKEN);
      USER = loginRes.user;
      dlgAuth.close();
      await checkSession();
      await loadCountries();
    } else alert('Не удалось автоматически войти: '+loginRes.message);
  } else alert(r.message);
};

$('btn-signin').onclick = async e=>{
  e.preventDefault();
  const login = $('auth-username').value.trim();
  const pass = $('auth-password').value.trim();
  if(!login || !pass) return alert('Введите логин и пароль');
  const r = await apiAuth('login',{login,password:pass});
  if(r.ok){
    TOKEN = r.token;
    localStorage.setItem('token', TOKEN);
    USER = r.user;
    dlgAuth.close();
    await checkSession();
    await loadCountries();
  } else alert(r.message);
};

// --- Countries ---
async function apiCountries(){
  if(!TOKEN) return;
  try {
    const res = await fetch(`${API}/countries`, { headers:{ 'Authorization':'Bearer '+TOKEN } });
    const data = await res.json();
    if(!Array.isArray(data)) {
      console.error('Invalid countries', data);
      if(data.message==='Invalid token'){ TOKEN=''; localStorage.removeItem('token'); await checkSession(); }
      return;
    }
    COUNTRIES = data;
    updateInfo(null);
    updateMap();
    updatePoints();
  } catch(err){ console.error(err); }
}

async function loadCountries(){ await ap
