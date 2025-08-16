const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

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
window.addEventListener('DOMContentLoaded', ()=>{
  const btnLogin = $('btn-login');
  const btnLogout = $('btn-logout');
  const btnRegister = $('btn-register');
  const btnSignin = $('btn-signin');

  if(btnLogin) btnLogin.onclick = ()=>dlgAuth.showModal();
  if(btnLogout) btnLogout.onclick = async ()=>{
    TOKEN=''; USER=null;
    localStorage.removeItem('token');
    await checkSession();
  };
  if(btnRegister) btnRegister.onclick = async e=>{
    e.preventDefault();
    const login=$('auth-username').value.trim();
    const pass=$('auth-password').value.trim();
    if(!login || !pass) return alert('Введите логин и пароль');
    const r = await apiAuth('register',{login,password:pass});
    if(r.ok){
      TOKEN=r.token; USER=r.user;
      localStorage.setItem('token', TOKEN);
      dlgAuth.close();
      await checkSession();
      await loadCountries();
    } else alert(r.message);
  };
  if(btnSignin) btnSignin.onclick = async e=>{
    e.preventDefault();
    const login=$('auth-username').value.trim();
    const pass=$('auth-password').value.trim();
    if(!login || !pass) return alert('Введите логин и пароль');
    const r = await apiAuth('login',{login,password:pass});
    if(r.ok){
      TOKEN=r.token; USER=r.user;
      localStorage.setItem('token', TOKEN);
      dlgAuth.close();
      await checkSession();
      await loadCountries();
    } else alert(r.message);
  };
});

// --- Load countries ---
async function loadCountries(){
  if(!TOKEN) return;
  const res = await fetch(`${API}/countries`,{
    headers:{'Authorization':'Bearer '+TOKEN}
  });
  const data = await res.json();
  COUNTRIES = Object.values(data);
  console.log('Countries loaded:', COUNTRIES);
}

// --- Initial check ---
checkSession();
