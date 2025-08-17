// =================== CONFIG ===================
const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

const $ = id => document.getElementById(id);
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

// =================== HELPERS ===================
function buildHeaders(json = true){
  const h = {};
  if(json) h['Content-Type'] = 'application/json';
  if(TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
  return h;
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
    console.log('Countries loaded:', COUNTRIES);
  }catch(e){ console.error(e); }
}

function updatePoints(){
  let total = 0;
  Object.values(COUNTRIES).forEach(c => { total += c.points || 0; });
  const p = $('points');
  if(p) p.textContent = 'Очки: ' + total;
}

// =================== PROMPT ===================
function promptAsync(message){
  return new Promise(resolve => {
    const input = $('prompt-input');
    const dlg = $('dlg-prompt');
    const title = $('prompt-title');
    if(!input || !dlg || !title){
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

// =================== FLOWS ===================

// --- CREATE COUNTRY ---
async function createCountryFlow(){
  if(!USER || USER.role !== 'owner') return alert('Нет прав! Только владелец может создавать страну');

  const resFlags = await fetch(`${API}/flags`);
  const availableFlags = resFlags.ok ? await resFlags.json() : [];
  if(!availableFlags.length) return alert('Флаги недоступны на сервере');

  const name = await promptAsync("Введите название страны (макс 256 символов, любые буквы)");
  if(!name || name.length>256) return alert("Некорректное название!");

  const flag = await promptAsync("Введите название флага (доступные: " + availableFlags.join(', ') + ")");
  if(!flag || !availableFlags.includes(flag)) return alert("Такого флага нет!");

  alert("Теперь кликните по карте для установки позиции страны");
  const mapObj = $('map');
  if(!mapObj) return alert('Элемент карты не найден');

  return new Promise(resolve=>{
    const handler = async e=>{
      const rect = mapObj.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);
      mapObj.removeEventListener('click', handler);

      const res = await apiPost('create_country',{ name, flag, x, y });
      if(res.ok){ alert('Страна создана'); await loadCountries(); }
      else alert('Ошибка: ' + (res.message||'unknown'));
      resolve();
    };
    mapObj.addEventListener('click', handler);
  });
}

// --- LOGS ---
async function viewLogsFlow(){
  if(!USER || !(USER.role==='admin'||USER.role==='owner')) return alert('Нет прав на просмотр логов');

  try{
    const res = await fetch(`${API}/logs`, { headers: buildHeaders(true) });
    if(!res.ok) return alert('Ошибка загрузки логов');
    const data = await res.json();
    if(Array.isArray(data) && data.length) {
      $('logs-view').textContent = data.map(l=>`${l.timestamp} ${l.user} ${l.role} ${l.action}`).join('\n');
    } else {
      $('logs-view').textContent = 'Логи пусты';
    }
    const dlg = $('dlg-logs'); if(dlg) dlg.showModal();
  }catch(e){ alert('Ошибка: ' + e.message); }
}

// --- GIVE POINTS ---
async function givePointsFlow(){
  if(!USER || !(USER.role==='admin'||USER.role==='owner')) return alert('Нет прав на выдачу очков');

  const id = await promptAsync("Введите ID страны");
  const amount = await promptAsync("Введите количество очков");
  if(!id || isNaN(amount) || amount.trim()==='') return alert("Только число!");
  const res = await apiPost('give_points',{ countryId:id, amount });
  if(res.ok){ alert('Очки выданы'); await loadCountries(); }
  else alert('Ошибка: ' + (res.message||'unknown'));
}

// --- TOGGLE ECONOMY ---
async function toggleEconomyFlow(){
  const res = await apiPost('toggle_economy',{});
  if(res.ok) alert('Экономика теперь: ' + (res.value?'Включена':'Выключена'));
  else alert('Ошибка: ' + (res.message||'unknown'));
}

// =================== ACTIONS ===================
function bindActionButtons(){
  document.querySelectorAll('#actions .btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!USER) return alert('Сначала войдите');
      const action = btn.dataset.action;
      if(action==='admin-open'){ show($('admin-panel')); return; }
      if(action==='economy-spend'){ await toggleEconomyFlow(); await loadCountries(); return; }
      if(action==='buy-unit'){
        const unit = btn.dataset.unit;
        const countryId = await promptAsync('Введите ID вашей страны');
        if(!countryId) return;
        const r = await apiPost('buy_unit',{ countryId, unit });
        if(r.ok){ alert('Юнит куплен'); await loadCountries(); } else alert('Ошибка: '+(r.message||'unknown'));
      }
      if(action==='declare-war'){
        const target = await promptAsync('ID страны для войны:');
        if(!target) return;
        const attacker = await promptAsync('Ваш ID страны:');
        if(!attacker) return;
        const res = await apiPost('declare_war',{ attackerId: attacker, defenderId: target });
        if(res.ok){ alert('Война объявлена'); await loadCountries(); } else alert('Ошибка: '+(res.message||'unknown'));
      }
      if(action==='attack'){
        const attacker = await promptAsync('Ваш ID страны:');
        const target = await promptAsync('ID страны для атаки:');
        if(!attacker || !target) return;
        const res = await apiPost('attack',{ attackerId: attacker, defenderId: target });
        if(res.ok) alert('Атака выполнена. Потери: ' + (res.lost||0)); else alert('Ошибка: ' + (res.message||'unknown'));
      }
    });
  });
}

// =================== ADMIN ===================
function bindAdminButtons(){
  document.querySelectorAll('#admin-panel [data-admin]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!USER) return alert('Войдите!');
      const action = btn.getAttribute('data-admin');
      if(action==='create-country' && USER.role==='owner') return await createCountryFlow();
      if(action==='assign-owner' && USER.role==='owner') return await assignOwnerFlow();
      if(action==='toggle-economy' && (USER.role==='admin'||USER.role==='owner')) return await toggleEconomyFlow();
      if(action==='give-points' && (USER.role==='admin'||USER.role==='owner')) return await givePointsFlow();
      if(action==='view-logs' && (USER.role==='admin'||USER.role==='owner')) return await viewLogsFlow();
      alert('Нет прав или неизвестная операция');
    });
  });
}

// =================== AUTH ===================
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
      const r = await apiAuth('register',{ login, password: pass });
      if(r.ok){ TOKEN=r.token; localStorage.setItem('token',TOKEN); USER=r.user; if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message||'Ошибка');
    });
  }

  if(btnSignin){
    btnSignin.addEventListener('click', async e=>{
      e.preventDefault();
      const login = $('auth-username')?.value?.trim();
      const pass  = $('auth-password')?.value?.trim();
      if(!login || !pass) return alert('Введите логин и пароль');
      const r = await apiAuth('login',{ login, password: pass });
      if(r.ok){ TOKEN=r.token; localStorage.setItem('token',TOKEN); USER=r.user; if(dlgAuth) dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message||'Ошибка');
    });
  }
}

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', async ()=>{
  bindActionButtons();
  bindAdminButtons();
  bindAuthHandlers();

  $('btn-logout')?.addEventListener('click', async ()=>{
    TOKEN=''; USER=null; localStorage.removeItem('token'); await checkSession();
  });

  document.querySelectorAll('[data-action="admin-open"]').forEach(b=> b.addEventListener('click', ()=>show($('admin-panel')) ));

  await checkSession();
  await loadCountries();
});
