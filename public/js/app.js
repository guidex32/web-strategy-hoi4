const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token')||'';
let USER = null;
let COUNTRIES = [];
let ECONOMY_ON = true;

const $ = id=>document.getElementById(id);
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

// --- API запрос ---
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

async function apiOp(data){
  try{
    const res = await fetch(`${API}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body: JSON.stringify(data)
    });
    return await res.json();
  }catch(e){ return {ok:false,message:e.message}; }
}

// --- Проверка сессии ---
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

// --- Загрузка стран ---
async function loadCountries(){
  if(!TOKEN) return;
  try{
    const res = await fetch(`${API}/countries`,{headers:{'Authorization':'Bearer '+TOKEN}});
    const data = await res.json();
    COUNTRIES = Object.values(data);
    console.log('Countries loaded:',COUNTRIES);
  }catch(e){ console.error(e); }
}

// --- Создать страну ---
async function createCountry(){
  if(USER.role!=='owner') return alert('Только Owner может создавать страны');
  const name = prompt('Введите название страны (макс 256 букв, без цифр):','');
  if(!name || name.length>256 || /\d/.test(name)) return alert('Неправильное название');
  const flag = prompt('Введите название флага (из папки flags):','');
  if(!flag) return alert('Флаг обязателен');

  alert('Теперь кликните по карте для размещения страны');
  const map = $('map');
  function onMapClick(e){
    const rect = map.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    apiOp({op:'create_country',name,flag,x,y})
      .then(r=>{ if(r.ok){ alert('Страна создана'); loadCountries(); } else alert(r.message); })
      .finally(()=>map.removeEventListener('click',onMapClick));
  }
  map.addEventListener('click',onMapClick);
}

// --- Назначить владельца ---
async function assignOwner(){
  if(USER.role!=='owner') return alert('Только Owner может назначать владельцев');
  const countryId = prompt('Введите ID страны:','');
  if(!countryId) return;
  const login = prompt('Введите логин нового владельца:','');
  if(!login) return;
  const r = await apiOp({op:'assign_owner',countryId,login});
  if(r.ok) alert('Владелец назначен'); else alert(r.message);
}

// --- Экономика ---
async function toggleEconomy(){
  const r = await apiOp({op:'toggle_economy'});
  if(r.ok){ ECONOMY_ON = r.value; alert(`Экономика теперь ${ECONOMY_ON?'ВКЛ':'ВЫКЛ'}`); }
}

// --- Логи ---
async function viewLogs(){
  if(USER.role!=='admin') return alert('Только Admin может просматривать логи');
  try{
    const res = await fetch(`${API}/logs`,{headers:{'Authorization':'Bearer '+TOKEN}});
    const data = await res.json();
    const logsView = $('logs-view'); if(logsView) logsView.textContent = JSON.stringify(data,null,2);
    const dlg = $('dlg-logs'); if(dlg) dlg.showModal();
  }catch(e){ alert(e.message); }
}

// --- Инициализация ---
window.addEventListener('DOMContentLoaded',()=>{
  const btnLogin = $('btn-login');
  const btnLogout = $('btn-logout');
  const btnRegister = $('btn-register');
  const btnSignin = $('btn-signin');
  const dlgAuth = $('dlg-auth');

  if(btnLogin&&dlgAuth) btnLogin.onclick = ()=>dlgAuth.showModal();
  if(btnLogout) btnLogout.onclick = async ()=>{ TOKEN=''; USER=null; localStorage.removeItem('token'); await checkSession(); };

  if(btnRegister){
    btnRegister.onclick = async e=>{
      e.preventDefault();
      const loginInput = $('auth-username'); const passInput = $('auth-password');
      if(!loginInput||!passInput) return alert('Форма не найдена!');
      const login = loginInput.value.trim(); const pass = passInput.value.trim();
      if(!login||!pass) return alert('Введите логин и пароль');
      const r = await apiAuth('register',{login,password:pass});
      if(r.ok){ TOKEN=r.token; USER=r.user; localStorage.setItem('token',TOKEN); if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message);
    };
  }

  if(btnSignin){
    btnSignin.onclick = async e=>{
      e.preventDefault();
      const loginInput = $('auth-username'); const passInput = $('auth-password');
      if(!loginInput||!passInput) return alert('Форма не найдена!');
      const login = loginInput.value.trim(); const pass = passInput.value.trim();
      if(!login||!pass) return alert('Введите логин и пароль');
      const r = await apiAuth('login',{login,password:pass});
      if(r.ok){ TOKEN=r.token; USER=r.user; localStorage.setItem('token',TOKEN); if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message);
    };
  }

  // --- Действия ---
  const actions = document.querySelectorAll('#actions button');
  actions.forEach(btn=>{
    btn.onclick = async ()=>{
      const action = btn.dataset.action;
      if(action==='admin-open'){ show($('admin-panel')); return; }
      if(action==='create-country'){ createCountry(); return; }
      if(action==='assign-owner'){ assignOwner(); return; }
      if(action==='toggle-economy'){ toggleEconomy(); return; }
      if(action==='view-logs'){ viewLogs(); return; }
      // Здесь можно добавить другие действия типа buy-unit, declare-war и attack
    };
  });

  checkSession();
  loadCountries();
});
