// =================== CONFIG ===================
const API = 'https://web-strategy-hoi4.onrender.com/api';
const ORIGIN = 'https://web-strategy-hoi4.onrender.com';
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

// =================== SESSION / COUNTRIES ===================
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
  COUNTRIES.forEach(c => { total += c.points || 0; });
  const p = $('points');
  if(p) p.textContent = 'Очки: ' + total;
}

// =================== PROMPT HELPER ===================
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

// =================== UTILS ===================
// Unicode: буквы (любой алфавит), пробел, дефис, апостроф; длина 1..256; без цифр
function isValidCountryName(name){
  if(!name) return false;
  if(name.length > 256) return false;
  // запрет на цифры
  if(/\d/.test(name)) return false;
  // только буквы/пробелы/дефис/апостроф
  return /^[\p{L}\s\-']+$/u.test(name);
}

// получить актуальные страны и проверить дубликат
async function countryExistsByName(name){
  // подстрахуемся свежими данными
  try{
    const res = await fetch(`${API}/countries`, { headers: buildHeaders(false) });
    const data = await res.json();
    const list = Object.values(data || {});
    return list.some(c => (c.name || '').toLowerCase() === name.toLowerCase());
  }catch{ return COUNTRIES.some(c => (c.name||'').toLowerCase() === name.toLowerCase()); }
}

// Список флагов: пробуем несколько вариантов манифеста, иначе вернём null (будем спрашивать вручную)
async function fetchFlagsList(){
  const candidates = ['/flags/manifest.json','/flags/index.json','/flags/_manifest.json'];
  for(const url of candidates){
    try{
      const r = await fetch(ORIGIN + url, { cache: 'no-store' });
      if(r.ok){
        const ct = r.headers.get('content-type') || '';
        if(ct.includes('application/json')){
          const j = await r.json();
          // допускаем {flags:[...]} или просто массив
          if(Array.isArray(j)) return j;
          if(Array.isArray(j.flags)) return j.flags;
        }
      }
    }catch(_){}
  }
  return null;
}

// Проверка фактического существования файла флага по базе имени (без расширения)
async function resolveExistingFlagFilename(baseName){
  if(!baseName) return null;
  const exts = ['png','jpg','jpeg','svg','webp'];
  for(const ext of exts){
    try{
      const r = await fetch(`${ORIGIN}/flags/${encodeURIComponent(baseName)}.${ext}`, { method:'HEAD', cache:'no-store' });
      if(r.ok) return `${baseName}.${ext}`;
    }catch(_){}
  }
  return null;
}

// =================== FLOWS ===================
async function createCountryFlow(){
  if(!USER || !(USER.role === 'owner' || USER.role === 'admin')) return alert('Нет прав');

  // 1) Название
  const name = await promptAsync('Введите название страны (≤256, без цифр)');
  if(!isValidCountryName(name)) return alert('Некорректное название!');
  if(await countryExistsByName(name)) return alert('Страна с таким именем уже существует');

  // 2) Флаг
  let flags = await fetchFlagsList(); // может быть null, если манифеста нет
  let flagBase = '';
  if(flags && flags.length){
    const list = flags.map(f => f.replace(/^\/?flags\//,'').replace(/\.(png|jpg|jpeg|svg|webp)$/i,''));
    const choice = await promptAsync('Выберите флаг (введите имя из списка):\n' + list.join(', '));
    if(!choice) return alert('Флаг не выбран');
    if(!list.includes(choice)) return alert('Такого флага нет в списке');
    const resolved = await resolveExistingFlagFilename(choice);
    if(!resolved) return alert('Файл флага не найден в папке /flags');
    flagBase = choice; // в БД хранится базовое имя, без расширения
  } else {
    // манифеста нет — спрашиваем имя и валидируем существование файла
    const manual = await promptAsync('Введите имя флага (без .png/.jpg/.svg/.webp)\nПапка: /flags');
    if(!manual) return alert('Флаг не выбран');
    const resolved = await resolveExistingFlagFilename(manual);
    if(!resolved) return alert('Файл флага не найден в папке /flags');
    flagBase = manual;
  }

  // 3) Владелец (опционально другой)
  const ownerLogin = await promptAsync('Введите логин владельца страны (оставьте пустым, чтобы создать на себя)');
  if(ownerLogin){
    // проверка, что у него нет страны
    const hasCountry = COUNTRIES.some(c => (c.owner || '').toLowerCase() === ownerLogin.toLowerCase());
    if(hasCountry) return alert('У этого пользователя уже есть страна');
  }

  // 4) Клик по карте
  alert('Теперь кликните по карте, где разместить страну');
  const mapObj = $('map');
  if(!mapObj) return alert('Элемент карты не найден');

  // Обработчик, работающий и на <object>, и на SVG внутри
  const clickOnce = (target, handler) => {
    const wrap = (e) => { target.removeEventListener('click', wrap); handler(e); };
    target.addEventListener('click', wrap);
    return () => target.removeEventListener('click', wrap);
  };

  const getCoords = (evt) => {
    const rect = mapObj.getBoundingClientRect();
    const x = Math.round(evt.clientX - rect.left);
    const y = Math.round(evt.clientY - rect.top);
    return { x, y };
  };

  const createAt = async ({x,y}) => {
    // Сначала создаём страну на текущего пользователя (так устроен сервер)
    const res = await apiPost('create_country', { name, flag: flagBase, x, y });
    if(!res.ok) return alert('Ошибка: ' + (res.message || 'unknown'));

    // Если указан другой владелец — назначаем
    if(ownerLogin && ownerLogin.toLowerCase() !== (USER.login||'').toLowerCase()){
      const all = await fetch(`${API}/countries`, { headers: buildHeaders(false) }).then(r=>r.json()).catch(()=>null);
      let created = null;
      if(all && typeof all === 'object'){
        created = Object.values(all).find(c => (c.name||'').toLowerCase() === name.toLowerCase());
      }
      if(created){
        const ar = await apiPost('assign_owner', { countryId: created.id, login: ownerLogin });
        if(!ar.ok) return alert('Страна создана, но не удалось назначить владельца: ' + (ar.message||'unknown'));
      }
    }

    alert('Страна создана');
    await loadCountries();
  };

  // Пытаемся навеситься на корень SVG внутри <object>
  const attachAndWaitClick = () => new Promise(resolve=>{
    let detachSvg = null, detachObj = null;

    const handler = async (e) => {
      e.preventDefault();
      const coords = getCoords(e);
      // снимаем оба лиснера
      if(detachSvg) detachSvg();
      if(detachObj) detachObj();
      resolve(coords);
    };

    // 1) обработчик на сам object (попадёт, если браузер отдаст событие на объект контейнер)
    detachObj = clickOnce(mapObj, handler);

    // 2) если SVG уже загружен — вешаем на его корень
    const trySvg = () => {
      try{
        const doc = mapObj.contentDocument;
        const root = doc && doc.documentElement;
        if(root){
          detachSvg = clickOnce(root, handler);
          return true;
        }
      }catch(_){}
      return false;
    };

    if(!trySvg()){
      // дождёмся загрузки SVG и потом навесим
      const onLoad = () => { mapObj.removeEventListener('load', onLoad); trySvg(); };
      mapObj.addEventListener('load', onLoad);
    }
  });

  const coords = await attachAndWaitClick();
  await createAt(coords);
}

// =================== ЛОГИ ===================
async function viewLogsFlow(){
  if(!USER || !(USER.role === 'admin' || USER.role === 'owner')) return alert('Нет прав');
  try{
    const res = await fetch(`${ORIGIN}/logs`, { headers: buildHeaders(false) });
    const ct = res.headers.get('content-type') || '';
    if(!ct.includes('application/json')){
      // Скорее всего отдался index.html из SPA — значит, запросили не тот путь или нет прав
      const text = await res.text();
      console.warn('Non-JSON logs response:', text.slice(0,200));
      $('logs-view').textContent = 'Логи пусты или нет доступа';
    } else {
      const data = await res.json();
      if(Array.isArray(data) && data.length){
        $('logs-view').textContent = data.map(
          l => `[${l.timestamp}] ${l.user} — ${l.action}`
        ).join('\n');
      } else {
        $('logs-view').textContent = 'Логи пусты';
      }
    }
    const dlg = $('dlg-logs'); if(dlg) dlg.showModal();
  }catch(e){
    alert('Ошибка при загрузке логов: ' + e.message);
  }
}

// =================== ПРОЧИЕ ФЛОУЫ (как у тебя) ===================
async function assignOwnerFlow(){
  const id = await promptAsync("Введите ID страны"); if(!id) return;
  const login = await promptAsync("Введите логин нового владельца"); if(!login) return;
  const res = await apiPost('assign_owner', { countryId: id, login });
  if(res.ok) { alert('Владелец назначен'); await loadCountries(); }
  else alert('Ошибка: ' + (res.message || 'unknown'));
}

async function toggleEconomyFlow(){
  const res = await apiPost('toggle_economy', {});
  if(res.ok) alert('Экономика теперь: ' + (res.value ? 'Включена' : 'Выключена'));
  else alert('Ошибка: ' + (res.message || 'unknown'));
}

async function givePointsFlow(){
  if(!USER || !(USER.role === 'admin' || USER.role === 'owner')) return alert('Нет прав');
  const id = await promptAsync("Введите ID страны");
  const amount = await promptAsync("Введите количество очков");
  if(!amount || isNaN(amount)) return alert("Только число!");
  const res = await apiPost('give_points', { countryId: id, amount });
  if(res.ok) { alert('Очки выданы'); await loadCountries(); }
  else alert('Ошибка: ' + (res.message || 'unknown'));
}

// =================== КНОПКИ ===================
function bindActionButtons(){
  document.querySelectorAll('#actions .btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!USER) { alert('Сначала войдите'); return; }
      const action = btn.dataset.action;
      if(action === 'admin-open'){ show($('admin-panel')); return; }
      if(action === 'economy-spend'){ // как у тебя было: переключение экономики
        await toggleEconomyFlow();
        await loadCountries();
      }
      if(action === 'buy-unit'){
        const unit = btn.dataset.unit;
        const countryId = await promptAsync('Введите ID вашей страны');
        if(!countryId) return;
        const r = await apiPost('buy_unit', { countryId, unit });
        if(r.ok) { alert('Юнит куплен'); await loadCountries(); } else alert('Ошибка: ' + (r.message||'unknown'));
      }
      if(action === 'declare-war'){
        const target = await promptAsync('ID страны для войны:');
        if(!target) return;
        const res = await apiPost('declare_war', { attackerId: await promptAsync('Ваш ID страны:'), defenderId: target });
        if(res.ok) { alert('Война объявлена'); await loadCountries(); } else alert('Ошибка: ' + (res.message||'unknown'));
      }
      if(action === 'attack'){
        const attacker = await promptAsync('Ваш ID страны:');
        const target = await promptAsync('ID страны для атаки:');
        if(!attacker || !target) return;
        const res = await apiPost('attack', { attackerId: attacker, defenderId: target });
        if(res.ok) alert('Атака выполнена. Потери: ' + (res.lost||0)); else alert('Ошибка: ' + (res.message||'unknown'));
      }
    });
  });
}

function bindAdminButtons(){
  document.querySelectorAll('#admin-panel [data-admin]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!USER) return alert('Войдите!');
      const action = btn.getAttribute('data-admin');
      if(action === 'create-country' && (USER.role === 'owner' || USER.role === 'admin')) return await createCountryFlow();
      if(action === 'assign-owner' && (USER.role === 'owner' || USER.role === 'admin')) return await assignOwnerFlow();
      if(action === 'toggle-economy' && (USER.role === 'admin' || USER.role === 'owner')) return await toggleEconomyFlow();
      if(action === 'give-points' && (USER.role === 'admin' || USER.role === 'owner')) return await givePointsFlow();
      if(action === 'view-logs' && (USER.role === 'admin' || USER.role === 'owner')) return await viewLogsFlow();
      alert('Нет прав или неизвестная операция');
    });
  });
}

// =================== АВТОРИЗАЦИЯ (как у тебя) ===================
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
    TOKEN = ''; USER = null; localStorage.removeItem('token');
    await checkSession();
  });

  await checkSession();
  await loadCountries();
});
