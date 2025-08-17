// =================== CONFIG ===================
const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

const $ = id=>document.getElementById(id);
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

// =================== HELPERS ===================
function buildHeaders(json=true){
  const h={};
  if(json) h['Content-Type']='application/json';
  if(TOKEN) h['Authorization']='Bearer '+TOKEN;
  return h;
}

async function apiPost(op,data){
  try{
    const res = await fetch(API,{
      method:'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({op,...data})
    });
    return await res.json();
  }catch(e){ return {ok:false,message:e.message}; }
}

async function apiAuth(op,data){
  try{
    const res = await fetch(API+'/auth',{
      method:'POST',
      headers:buildHeaders(true),
      body: JSON.stringify({op,...data})
    });
    return await res.json();
  }catch(e){ return {ok:false,message:e.message}; }
}

async function loadCountries(){
  if(!TOKEN) return;
  try{
    const res = await fetch(`${API}/countries`,{headers:buildHeaders(false)});
    const data = await res.json();
    if(data && data.ok===false){ console.warn('countries:',data.message); return; }
    COUNTRIES = Object.values(data||{});
    updatePoints();
  }catch(e){ console.error(e); }
}

function updatePoints(){
  let total=0;
  COUNTRIES.forEach(c=>{ total+=c.points||0; });
  const p=$('points'); if(p) p.textContent='Очки: '+total;
}

async function checkSession(){
  if(!TOKEN){ USER=null; hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel')); return false; }
  const r=await apiAuth('session',{});
  if(r.ok && r.user){
    USER=r.user;
    const info=$('user-info'); if(info) info.textContent=`${USER.login} (${USER.role})`;
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role==='admin'||USER.role==='owner') show($('admin-panel')); else hide($('admin-panel'));
    return true;
  }else{
    USER=null; TOKEN=''; localStorage.removeItem('token');
    hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel'));
    return false;
  }
}

function promptAsync(message){
  return new Promise(resolve=>{
    const input=$('prompt-input'), dlg=$('dlg-prompt'), title=$('prompt-title');
    if(!input||!dlg||!title){ const val=window.prompt(message); resolve(val?val.trim():''); return; }
    title.textContent=message; input.value=''; dlg.showModal();
    const ok=$('prompt-ok');
    const handler=ev=>{ ev.preventDefault(); dlg.close(); ok.removeEventListener('click',handler); resolve(input.value.trim()); };
    ok.addEventListener('click',handler);
  });
}

// =================== BUILDINGS / ECONOMY ===================
const BUILDINGS=[
  {name:'Офис',cost:10,income:5},
  {name:'Военная база',cost:30,income:15},
  {name:'Аэропорт',cost:100,income:50},
  {name:'Нефтекачка',cost:500,income:200}
];

async function buildBuildingFlow(){
  if(!USER) return alert('Войдите');
  const myCountry=COUNTRIES.find(c=>c.owner===USER.login);
  if(!myCountry) return alert('У вас нет страны');
  const options=BUILDINGS.map(b=>`${b.name} (стоимость ${b.cost})`).join('\n');
  const choice=await promptAsync('Выберите здание:\n'+options);
  const building=BUILDINGS.find(b=>b.name.toLowerCase()===choice.toLowerCase());
  if(!building) return alert('Неверный выбор здания');
  if((myCountry.points||0)<building.cost) return alert('Недостаточно очков');
  const res=await apiPost('build',{countryId:myCountry.id,building:building.name});
  if(res.ok){ alert(`Здание построено: ${building.name}, доход +${building.income}/час`); await loadCountries(); }
  else alert('Ошибка: '+(res.message||'unknown'));
}

// =================== COUNTRY CREATION ===================
async function createCountryFlow(){
  if(!USER || !(USER.role==='owner'||USER.role==='admin')) return alert('Нет прав');
  // Название страны
  const name=await promptAsync('Введите название страны (максимум 256 символов, только буквы)');
  if(!name||name.length>256||/\d/.test(name)) return alert('Некорректное название!');
  // Проверка на существование
  const check=await apiPost('check_country',{name}); if(check.exists) return alert('Страна уже существует!');
  // Список флагов
  const flags=await apiPost('list_flags',{}); // возвращает {flags:['flag1','flag2',...]}
  if(!flags.ok) return alert('Не удалось получить список флагов');
  const flagChoice=await promptAsync('Выберите флаг:\n'+flags.flags.join(', '));
  if(!flags.flags.includes(flagChoice)) return alert('Такого флага нет!');
  // Выбор владельца
  const ownerLogin=await promptAsync('Введите логин владельца страны');
  const ownerCheck=await apiPost('check_user',{login:ownerLogin});
  if(!ownerCheck.ok) return alert('Пользователь не найден');
  if(ownerCheck.hasCountry) return alert('У пользователя уже есть страна');
  alert('Теперь кликните по карте, где разместить страну');
  const mapObj=$('map'); if(!mapObj) return alert('Элемент карты не найден');
  return new Promise(resolve=>{
    const handler=async e=>{
      const rect=mapObj.getBoundingClientRect();
      const x=Math.round(e.clientX-rect.left);
      const y=Math.round(e.clientY-rect.top);
      mapObj.removeEventListener('click',handler);
      const res=await apiPost('create_country',{name,flag:flagChoice,owner:ownerLogin,x,y});
      if(res.ok){ alert('Страна создана'); await loadCountries(); }
      else alert('Ошибка: '+(res.message||'unknown'));
      resolve();
    };
    mapObj.addEventListener('click',handler);
  });
}

// =================== LOGS ===================
async function viewLogsFlow(){
  if(!USER||!(USER.role==='admin'||USER.role==='owner')) return alert('Нет прав');
  try{
    const res=await fetch(`${API}/logs`,{headers:buildHeaders(true)});
    const data=await res.json();
    if(Array.isArray(data)&&data.length) $('logs-view').textContent=data.map(l=>`[${l.timestamp}] ${l.user} (${l.role}) — ${l.action}`).join('\n');
    else $('logs-view').textContent='Логи пусты';
    const dlg=$('dlg-logs'); if(dlg) dlg.showModal();
  }catch(e){ alert('Ошибка: '+e.message); }
}

// =================== POINTS ===================
async function givePointsFlow(){
  if(!USER || !(USER.role==='admin'||USER.role==='owner')) return alert('Нет прав');
  const id=await promptAsync('Введите ID страны'); if(!id) return;
  const amount=await promptAsync('Введите количество очков'); if(!amount||isNaN(amount)) return alert('Только число!');
  const res=await apiPost('give_points',{countryId:id,amount}); if(res.ok){ alert('Очки выданы'); await loadCountries(); }
  else alert('Ошибка: '+(res.message||'unknown'));
}

// =================== ACTIONS ===================
function bindActionButtons(){
  document.querySelectorAll('#actions .btn').forEach(btn=>{
    btn.addEventListener('click',async ()=>{
      if(!USER){ alert('Сначала войдите'); return; }
      const action=btn.dataset.action;
      if(action==='admin-open'){ show($('admin-panel')); return; }
      if(action==='build-econ'){ await buildBuildingFlow(); return; }
    });
  });
}

function bindAdminButtons(){
  document.querySelectorAll('#admin-panel [data-admin]').forEach(btn=>{
    btn.addEventListener('click',async ()=>{
      if(!USER) return alert('Войдите!');
      const action=btn.getAttribute('data-admin');
      if(action==='create-country') return await createCountryFlow();
      if(action==='view-logs') return await viewLogsFlow();
      if(action==='give-points') return await givePointsFlow();
      alert('Нет прав или неизвестная операция');
    });
  });
}

function bindAuthHandlers(){
  const dlgAuth=$('dlg-auth'), btnRegister=$('btn-register'), btnSignin=$('btn-signin');
  if(btnRegister){
    btnRegister.addEventListener('click',async e=>{
      e.preventDefault();
      const login=$('auth-username')?.value?.trim();
      const pass=$('auth-password')?.value?.trim();
      if(!login||!pass) return alert('Введите логин и пароль');
      const r=await apiAuth('register',{login,password:pass});
      if(r.ok){ TOKEN=r.token; localStorage.setItem('token',TOKEN); USER=r.user; if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message||'Ошибка');
    });
  }
  if(btnSignin){
    btnSignin.addEventListener('click',async e=>{
      e.preventDefault();
      const login=$('auth-username')?.value?.trim();
      const pass=$('auth-password')?.value?.trim();
      if(!login||!pass) return alert('Введите логин и пароль');
      const r=await apiAuth('login',{login,password:pass});
      if(r.ok){ TOKEN=r.token; localStorage.setItem('token',TOKEN); USER=r.user; if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message||'Ошибка');
    });
  }
}

// =================== INIT ===================
document.addEventListener('DOMContentLoaded',async ()=>{
  bindActionButtons();
  bindAdminButtons();
  bindAuthHandlers();
  $('btn-logout')?.addEventListener('click',async ()=>{ TOKEN=''; USER=null; localStorage.removeItem('token'); await checkSession(); });
  await checkSession();
  await loadCountries();
});
