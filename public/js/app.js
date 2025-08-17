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

function promptAsync(message){
  return new Promise(resolve=>{
    const input = $('prompt-input');
    const dlg = $('dlg-prompt');
    const title = $('prompt-title');
    title.textContent = message;
    input.value='';
    dlg.showModal();
    const ok = $('prompt-ok');

    const handler = (ev)=>{ 
      ev.preventDefault();
      dlg.close(); 
      ok.removeEventListener('click',handler); 
      resolve(input.value.trim());
    };
    ok.addEventListener('click',handler);
  });
}

async function createCountryFlow(){
  const name = await promptAsync("Введите название страны (только буквы, максимум 256)");
  if(!name.match(/^[a-zA-Zа-яА-Я\s]{1,256}$/)) return alert("Некорректное название!");

  const flag = await promptAsync("Введите название флага (из папки flags)");

  alert("Теперь кликните по карте для установки позиции страны");
  const map = $('map');
  return new Promise(resolve=>{
    const handler = async (e)=>{
      const rect = map.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      map.removeEventListener('click',handler);

      try{
        const res = await fetch(`${API}`,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
          body:JSON.stringify({op:'create_country',name,flag,x,y})
        });
        const data = await res.json();
        if(data.ok){ alert("Страна создана!"); await loadCountries(); }
        else alert("Ошибка: "+data.message);
      }catch(e){ alert("Ошибка: "+e.message); }
      resolve();
    };
    map.addEventListener('click',handler);
  });
}

async function assignOwnerFlow(){
  const id = await promptAsync("Введите ID страны");
  if(!id) return;
  const login = await promptAsync("Введите логин нового владельца");
  if(!login) return;

  try{
    const res = await fetch(`${API}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body:JSON.stringify({op:'assign_owner',countryId:id,login})
    });
    const data = await res.json();
    if(data.ok) alert("Владелец назначен!"); else alert("Ошибка: "+data.message);
  }catch(e){ alert("Ошибка: "+e.message); }
}

async function toggleEconomyFlow(){
  try{
    const res = await fetch(`${API}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body:JSON.stringify({op:'toggle_economy'})
    });
    const data = await res.json();
    if(data.ok) alert("Экономика теперь: "+(data.value?'Включена':'Выключена')); 
    else alert("Ошибка: "+data.message);
  }catch(e){ alert("Ошибка: "+e.message); }
}

async function givePointsFlow(){
  const id = await promptAsync("Введите ID страны");
  const amount = await promptAsync("Введите количество очков");
  if(isNaN(amount)) return alert("Только число!");
  try{
    const res = await fetch(`${API}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body:JSON.stringify({op:'give_points',countryId:id,amount})
    });
    const data = await res.json();
    if(data.ok) alert("Очки выданы!"); else alert("Ошибка: "+data.message);
  }catch(e){ alert("Ошибка: "+e.message); }
}

async function viewLogsFlow(){
  try{
    const res = await fetch(`${API}/logs`,{headers:{'Authorization':'Bearer '+TOKEN}});
    const data = await res.json();
    if(Array.isArray(data)) $('logs-view').textContent = data.map(l=>`${l.timestamp} ${l.user} ${l.action}`).join('\n');
    $('dlg-logs').showModal();
  }catch(e){ alert("Ошибка: "+e.message); }
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

  // --- кнопки админа ---
  document.querySelectorAll('[data-admin]').forEach(btn=>{
    btn.onclick=async ()=>{
      const action = btn.getAttribute('data-admin');
      if(!USER) return alert("Войдите!");
      if(action==='create-country' && USER.role==='owner') await createCountryFlow();
      if(action==='assign-owner' && USER.role==='owner') await assignOwnerFlow();
      if(action==='toggle-economy' && (USER.role==='admin'||USER.role==='owner')) await toggleEconomyFlow();
      if(action==='give-points' && USER.role==='admin') await givePointsFlow();
      if(action==='view-logs' && USER.role==='admin') await viewLogsFlow();
    };
  });
});
