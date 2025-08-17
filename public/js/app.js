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

async function apiPost(data){
  try{
    const res = await fetch(API,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body: JSON.stringify(data)
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

// --- модальные помощники ---
function promptInput(title, placeholder){
  return new Promise(resolve=>{
    const dlg = $('dlg-prompt');
    const input = $('prompt-input');
    const ok = $('prompt-ok');
    const cancelBtn = dlg.querySelector('button[value="cancel"]');
    $('prompt-title').textContent = title;
    input.value = '';
    dlg.showModal();
    ok.onclick = e=>{ e.preventDefault(); dlg.close(); resolve(input.value.trim()); }
    cancelBtn.onclick = e=>{ dlg.close(); resolve(null); }
  });
}

function alertMsg(msg){
  alert(msg);
}

// --- обработка админских действий ---
async function adminCreateCountry(){
  if(USER.role!=='owner'){ alertMsg('Доступно только Owner'); return; }
  const name = await promptInput('Введите название страны (без цифр, макс 256 букв)','');
  if(!name || /[0-9]/.test(name) || name.length>256){ alertMsg('Неправильное название'); return; }

  // получаем список флагов (предположим статичный список)
  const flags = ['flag1.png','flag2.png','flag3.png'];
  const flag = await promptInput('Введите название флага из списка: '+flags.join(','));
  if(!flags.includes(flag)){ alertMsg('Неправильный флаг'); return; }

  alertMsg('Теперь кликните по карте, чтобы выбрать координаты для страны');

  // временный обработчик клика на карте
  const map = $('map');
  function mapClickHandler(e){
    // координаты внутри SVG
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    map.removeEventListener('click',mapClickHandler);

    apiPost({op:'create_country',name,flag,x,y})
      .then(res=>{
        if(res.ok){ alertMsg('Страна создана!'); loadCountries(); }
        else alertMsg(res.message);
      });
  }
  map.addEventListener('click',mapClickHandler);
}

async function adminAssignOwner(){
  const countryId = await promptInput('Введите ID страны');
  if(!countryId) return;
  const login = await promptInput('Введите логин нового владельца');
  if(!login) return;
  const res = await apiPost({op:'assign_owner',countryId,login});
  if(res.ok) alertMsg('Владелец назначен'); else alertMsg(res.message);
}

async function adminGivePoints(){
  const countryId = await promptInput('Введите ID страны');
  if(!countryId) return;
  const amount = await promptInput('Введите количество очков');
  if(!amount || isNaN(amount)) return alertMsg('Только число');
  const res = await apiPost({op:'give_points',countryId,amount});
  if(res.ok) alertMsg('Очки выданы'); else alertMsg(res.message);
}

async function adminViewLogs(){
  try{
    const res = await fetch(API+'/logs',{headers:{'Authorization':'Bearer '+TOKEN}});
    const data = await res.json();
    const pre = $('logs-view');
    pre.textContent = JSON.stringify(data,null,2);
    $('dlg-logs').showModal();
  }catch(e){ alertMsg(e.message); }
}

// --- экономика ---
async function adminToggleEconomy(){
  const res = await apiPost({op:'toggle_economy'});
  if(res.ok) alertMsg('Экономика: '+(res.value?'Вкл':'Выкл'));
}

// --- основной DOMContentLoaded ---
window.addEventListener('DOMContentLoaded',()=>{

  const btnLogin = $('btn-login');
  const btnLogout = $('btn-logout');
  const btnRegister = $('btn-register');
  const btnSignin = $('btn-signin');

  if(btnLogin) btnLogin.onclick = ()=>$('dlg-auth').showModal();
  if(btnLogout) btnLogout.onclick = async ()=>{ TOKEN=''; USER=null; localStorage.removeItem('token'); await checkSession(); };

  if(btnRegister){
    btnRegister.addEventListener('click', async e=>{
      e.preventDefault();
      const loginInput = $('auth-username'); const passInput = $('auth-password');
      if(!loginInput||!passInput) return alertMsg('Форма не найдена!');
      const login = loginInput.value.trim(); const pass = passInput.value.trim();
      if(!login||!pass) return alertMsg('Введите логин и пароль');
      const r = await apiAuth('register',{login,password:pass});
      if(r.ok){ TOKEN=r.token; USER=r.user; localStorage.setItem('token',TOKEN); $('dlg-auth').close(); await checkSession(); await loadCountries(); }
      else alertMsg(r.message);
    });
  }

  if(btnSignin){
    btnSignin.addEventListener('click', async e=>{
      e.preventDefault();
      const loginInput = $('auth-username'); const passInput = $('auth-password');
      if(!loginInput||!passInput) return alertMsg('Форма не найдена!');
      const login = loginInput.value.trim(); const pass = passInput.value.trim();
      if(!login||!pass) return alertMsg('Введите логин и пароль');
      const r = await apiAuth('login',{login,password:pass});
      if(r.ok){ TOKEN=r.token; USER=r.user; localStorage.setItem('token',TOKEN); $('dlg-auth').close(); await checkSession(); await loadCountries(); }
      else alertMsg(r.message);
    });
  }

  // --- админ кнопки ---
  const adminButtons = document.querySelectorAll('[data-admin]');
  adminButtons.forEach(btn=>{
    btn.addEventListener('click',()=>{
      const op = btn.dataset.admin;
      if(op==='create-country') adminCreateCountry();
      if(op==='assign-owner') adminAssignOwner();
      if(op==='give-points') adminGivePoints();
      if(op==='view-logs') adminViewLogs();
      if(op==='toggle-economy') adminToggleEconomy();
    });
  });

  checkSession();
  loadCountries();
});
