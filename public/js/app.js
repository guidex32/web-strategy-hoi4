const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token')||'';
let USER = null;
let COUNTRIES = [];

const $ = id=>document.getElementById(id);
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

async function apiAuth(op,data){
  try{
    const res = await fetch(`${API}/auth`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':TOKEN?'Bearer '+TOKEN:''},
      body: JSON.stringify({op,...data})
    });
    return await res.json();
  }catch(e){ return {ok:false,message:e.message}; }
}

async function checkSession(){
  if(!TOKEN){ USER=null; hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel')); return false; }
  const r = await apiAuth('session',{});
  if(r.user){
    USER = r.user;
    const info = $('user-info'); if(info) info.textContent = `${USER.login} (${USER.role})`;
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role==='admin'||USER.role==='owner') show($('admin-panel')); else hide($('admin-panel'));
    return true;
  }else{ USER=null; TOKEN=''; localStorage.removeItem('token'); hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel')); return false; }
}

async function loadCountries(){
  if(!TOKEN) return;
  try{
    const res = await fetch(`${API}/countries`,{headers:{'Authorization':'Bearer '+TOKEN}});
    const data = await res.json();
    COUNTRIES = Object.values(data);
    console.log('Countries loaded:',COUNTRIES);
  }catch(e){ console.error(e); }
}

window.addEventListener('DOMContentLoaded',()=>{

  const btnLogin = $('btn-login');
  const btnLogout = $('btn-logout');
  const btnRegister = $('btn-register');
  const btnSignin = $('btn-signin');
  const dlgAuth = $('dlg-auth');

  if(btnLogin&&dlgAuth) btnLogin.onclick = ()=>dlgAuth.showModal();
  if(btnLogout) btnLogout.onclick = async ()=>{ TOKEN=''; USER=null; localStorage.removeItem('token'); await checkSession(); };

  if(btnRegister){
    btnRegister.addEventListener('click', async e=>{
      e.preventDefault();
      const loginInput = $('auth-username'); const passInput = $('auth-password');
      if(!loginInput||!passInput) return alert('Форма не найдена!');
      const login = loginInput.value.trim(); const pass = passInput.value.trim();
      if(!login||!pass) return alert('Введите логин и пароль');
      const r = await apiAuth('register',{login,password:pass});
      if(r.ok){ TOKEN=r.token; USER=r.user; localStorage.setItem('token',TOKEN); if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message);
    });
  }

  if(btnSignin){
    btnSignin.addEventListener('click', async e=>{
      e.preventDefault();
      const loginInput = $('auth-username'); const passInput = $('auth-password');
      if(!loginInput||!passInput) return alert('Форма не найдена!');
      const login = loginInput.value.trim(); const pass = passInput.value.trim();
      if(!login||!pass) return alert('Введите логин и пароль');
      const r = await apiAuth('login',{login,password:pass});
      if(r.ok){ TOKEN=r.token; USER=r.user; localStorage.setItem('token',TOKEN); if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message);
    });
  }

  checkSession();
});
