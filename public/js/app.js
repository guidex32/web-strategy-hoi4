// =================== CONFIG ===================
const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

// =================== HELPERS ===================
const $ = id => document.getElementById(id);
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

function buildHeaders(json = true){
  const h = {};
  if(json) h['Content-Type'] = 'application/json';
  if(TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
  return h;
}

async function apiPost(op, data){
  try{
    const res = await fetch(`${API}`, {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({ op, ...data })
    });
    return await res.json();
  }catch(e){ return { ok:false, message: e.message }; }
}

async function apiAuth(op, data){
  try{
    const res = await fetch(`${API}/auth`, {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({ op, ...data })
    });
    return await res.json();
  }catch(e){ return { ok:false, message: e.message }; }
}

function promptAsync(message){
  return new Promise(resolve => {
    const input = $('prompt-input');
    const dlg = $('dlg-prompt');
    const title = $('prompt-title');
    if(!input || !dlg || !title) {
      const val = window.prompt(message);
      resolve(val ? val.trim() : '');
      return;
    }
    title.textContent = message;
    input.value = '';
    dlg.showModal();
    const ok = $('prompt-ok');

    const handler = ev => {
      ev.preventDefault();
      dlg.close();
      ok.removeEventListener('click', handler);
      resolve(input.value.trim());
    };
    ok.addEventListener('click', handler);
  });
}

// =================== SESSION ===================
async function checkSession(){
  if(!TOKEN){
    USER = null;
    hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel'));
    return false;
  }

  const r = await apiAuth('session', {});
  if(r.ok && r.user){
    USER = r.user;
    const info = $('user-info');
    if(info) info.textContent = `${USER.login} (${USER.role})`;
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role === 'admin' || USER.role === 'owner') show($('admin-panel')); else hide($('admin-panel'));
    return true;
  } else {
    USER = null; TOKEN = ''; localStorage.removeItem('token');
    hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel'));
    return false;
  }
}

// =================== COUNTRIES ===================
async function loadCountries(){
  if(!TOKEN) return;
  try{
    const res = await fetch(`${API}/countries`, { headers: buildHeaders(false) });
    const data = await res.json();
    if(data && data.ok === false){ console.warn('countries:', data.message); return; }
    COUNTRIES = Object.values(data || {});
    updatePoints();
  }catch(e){ console.error(e); }
}

function updatePoints(){
  let total = 0;
  Object.values(COUNTRIES).forEach(c => { total += c.points || 0; });
  const p = $('points');
  if(p) p.textContent = 'Очки: ' + total;
}

// =================== CREATE COUNTRY FLOW ===================
async function createCountryFlow(){
  if(!(USER.role==='owner' || USER.role==='admin')) return alert('Нет прав');

  // Название страны
  const name = await promptAsync("Введите название страны (только буквы, макс 256)");
  if(!name || name.length>256 || /[^a-zA-Zа-яА-ЯёЁ\s]/.test(name)) return alert("Некорректное название!");

  // Проверка в БД, что такой страны нет
  const check = await apiPost('check_country', { name });
  if(!check.ok) return alert(check.message || 'Ошибка проверки страны');

  // Получаем список флагов
  const flagsRes = await apiPost('get_flags', {});
  if(!flagsRes.ok || !Array.isArray(flagsRes.flags)) return alert('Ошибка получения списка флагов');
  alert('Доступные флаги: ' + flagsRes.flags.join(', '));

  const flag = await promptAsync('Введите название флага из списка выше (без расширения)');
  if(!flag || !flagsRes.flags.includes(flag)) return alert('Флаг не найден!');

  // Выбор владельца
  const owner = await promptAsync('Введите логин владельца страны');
  if(!owner) return;
  const ownerCheck = await apiPost('check_user', { login: owner });
  if(!ownerCheck.ok) return alert(ownerCheck.message || 'Пользователь не найден или уже имеет страну');

  alert('Теперь кликните по карте, где будет расположена страна');
  const mapObj = $('map');
  if(!mapObj) return alert('Элемент карты не найден');

  return new Promise(resolve => {
    const handler = async e => {
      const rect = mapObj.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);
      mapObj.removeEventListener('click', handler);

      const res = await apiPost('create_country', { name, flag, owner, x, y });
      if(res.ok){ alert('Страна создана'); await loadCountries(); }
      else alert('Ошибка: ' + (res.message||'unknown'));
      resolve();
    };
    mapObj.addEventListener('click', handler);
  });
}

// =================== VIEW LOGS ===================
async function viewLogsFlow(){
  if(!(USER.role==='owner' || USER.role==='admin')) return alert('Нет прав');
  try{
    const res = await fetch(`${API}/logs`, { headers: buildHeaders(true) });
    const data = await res.json();
    if(!Array.isArray(data)) return alert('Ошибка: нет данных JSON');
    $('logs-view').textContent = data.map(l => `${l.timestamp} ${l.user} (${l.role}) — ${l.action}`).join('\n');
    const dlg = $('dlg-logs'); if(dlg) dlg.showModal();
  }catch(e){ alert('Ошибка: ' + e.message); }
}

// =================== BUILDINGS / ECONOMY ===================
const BUILDINGS = [
  { name:'Офис', cost:10, income:5 },
  { name:'Военная база', cost:30, income:15 },
  { name:'Аэропорт', cost:100, income:50 },
  { name:'Нефтекачка', cost:500, income:200 }
];

async function buildBuildingFlow(){
  if(!USER) return alert('Войдите');
  const countryId = await promptAsync('Введите ID вашей страны');
  if(!countryId) return;

  const country = COUNTRIES.find(c=>c.id==countryId);
  if(!country || country.owner!==USER.login) return alert('Вы не владеете этой страной');

  const options = BUILDINGS.map(b=>`${b.name} (стоимость ${b.cost})`).join('\n');
  const choice = await promptAsync('Выберите здание:\n' + options);
  const building = BUILDINGS.find(b=>b.name.toLowerCase()===choice.toLowerCase());
  if(!building) return alert('Неверный выбор здания');
  if((country.points||0) < building.cost) return alert('Недостаточно очков');

  const res = await apiPost('build', { countryId, building: building.name });
  if(res.ok){
    alert(`Здание построено: ${building.name}, доход +${building.income}/час`);
    await loadCountries();
  } else alert('Ошибка: ' + (res.message||'unknown'));
}

// =================== BIND ACTION BUTTONS ===================
function bindActionButtons(){
  document.querySelectorAll('#actions .btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!USER) { alert('Сначала войдите'); return; }
      const action = btn.dataset.action;
      if(action==='admin-open'){ show($('admin-panel')); return; }
      if(action==='build-econ'){ await buildBuildingFlow(); return; }
    });
  });
}

// =================== BIND ADMIN BUTTONS ===================
function bindAdminButtons(){
  document.querySelectorAll('#admin-panel [data-admin]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!USER) return alert('Войдите!');
      const action = btn.getAttribute('data-admin');
      if(action==='create-country' && (USER.role==='owner' || USER.role==='admin')) return await createCountryFlow();
      if(action==='view-logs' && (USER.role==='owner' || USER.role==='admin')) return await viewLogsFlow();
      alert('Нет прав или неизвестная операция');
    });
  });
}

// =================== AUTH HANDLERS ===================
function bindAuthHandlers(){
  const dlgAuth = $('dlg-auth');
  const btnRegister = $('btn-register');
  const btnSignin = $('btn-signin');

  if(btnRegister){
    btnRegister.addEventListener('click', async e=>{
      e.preventDefault();
      const login = $('auth-username')?.value?.trim();
      const pass  = $('auth-password')?.value?.trim();
      if(!login || !pass) return alert('Введите логин и пароль');
      const r = await apiAuth('register', { login, password: pass });
      if(r.ok){ TOKEN = r.token; localStorage.setItem('token', TOKEN); USER = r.user; if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message || 'Ошибка');
    });
  }

  if(btnSignin){
    btnSignin.addEventListener('click', async e=>{
      e.preventDefault();
      const login = $('auth-username')?.value?.trim();
      const pass  = $('auth-password')?.value?.trim();
      if(!login || !pass) return alert('Введите логин и пароль');
      const r = await apiAuth('login', { login, password: pass });
      if(r.ok){ TOKEN = r.token; localStorage.setItem('token', TOKEN); USER = r.user; if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message || 'Ошибка');
    });
  }
}

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', async ()=>{
  bindActionButtons();
  bindAdminButtons();
  bindAuthHandlers();

  $('btn-logout')?.addEventListener('click', async ()=>{
    TOKEN=''; USER=null; localStorage.removeItem('token');
    await checkSession();
  });

  await checkSession();
  await loadCountries();
});
