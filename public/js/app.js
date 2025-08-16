const API = 'https://web-strategy-hoi4.onrender.com/api';
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
    TOKEN = r.token || TOKEN; // обновляем токен от сервера
    localStorage.setItem('token', TOKEN);
    $('user-info').textContent = USER.login+' ('+USER.role+')';
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role==='admin') show($('admin-panel'));
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

$('btn-register').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
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

$('btn-signin').onclick=async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
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

// --- Countries ---
async function apiCountries(){
  if(!TOKEN) return;
  const res = await fetch(`${API}/countries`,{
    headers:{ 'Authorization':'Bearer '+TOKEN }
  });
  const data = await res.json();
  if(!Array.isArray(data)){
    console.error('Invalid countries', data);
    if(data.message==='Invalid token'){
      TOKEN=''; localStorage.removeItem('token'); await checkSession();
    }
    return;
  }
  COUNTRIES = data;
  updateInfo(null);
  updateMap();
  updatePoints();
}

async function loadCountries(){ await apiCountries(); }

// --- Init ---
(async()=>{
  const ok = await checkSession();
  if(ok) await loadCountries();
})();
