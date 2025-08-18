// =================== CONFIG ===================
const API = 'https://web-strategy-hoi4.onrender.com/api';
const ORIGIN = 'https://web-strategy-hoi4.onrender.com';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

// кэш: baseName -> fileName с расширением
const FLAG_RESOLVE_CACHE = Object.create(null);

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
    await renderCountriesOnMap();
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

// =================== VALIDATION ===================
function isValidCountryName(name){
  if(!name) return false;
  const trimmed = name.trim();
  if(trimmed.length === 0 || trimmed.length > 256) return false;
  if(/\d/.test(trimmed)) return false; // нельзя цифры
  // максимально совместимая проверка букв (латиница + кириллица) + пробел/дефис/апостроф
  const reFallback = /^[A-Za-z\u0400-\u04FF][A-Za-z\u0400-\u04FF\s\-']*$/u;
  try{
    const re = /^\p{L}[\p{L}\s\-']*$/u;
    return re.test(trimmed);
  }catch{
    return reFallback.test(trimmed);
  }
}

async function countryExistsByName(name){
  try{
    const res = await fetch(`${API}/countries`, { headers: buildHeaders(false) });
    const data = await res.json();
    const list = Object.values(data || {});
    return list.some(c => (c.name || '').toLowerCase() === name.toLowerCase());
  }catch{
    return COUNTRIES.some(c => (c.name||'').toLowerCase() === name.toLowerCase());
  }
}

// =================== FLAGS: LIST & RESOLVE ===================
// 1) Нормальный способ — новый эндпоинт сервера /api/flags (см. правки server.js ниже).
async function fetchFlagsList(){
  // Сначала пробуем серверный список
  try{
    const r = await fetch(`${API}/flags`, { headers: buildHeaders(false), cache: 'no-store' });
    if(r.ok){
      const ct = r.headers.get('content-type') || '';
      if(ct.includes('application/json')){
        const arr = await r.json();
        if(Array.isArray(arr) && arr.length) return arr;
      }
    }
  }catch(_){}

  // Фолбэк: пробуем статический манифест в /flags/
  const candidates = ['/flags/manifest.json','/flags/index.json','/flags/_manifest.json'];
  for(const url of candidates){
    try{
      const r = await fetch(ORIGIN + url, { cache: 'no-store' });
      if(r.ok){
        const ct = r.headers.get('content-type') || '';
        if(ct.includes('application/json')){
          const j = await r.json();
          let arr = Array.isArray(j) ? j : (Array.isArray(j.flags) ? j.flags : null);
          if(arr && arr.length){
            return arr.map(f => String(f).replace(/^\/?flags\//,'').replace(/\.(png|jpe?g|svg|webp)$/i,''));
          }
        }
      }
    }catch(_){}
  }

  // Если списка нет — вернём null (дальше будет ручной ввод + проверка файла)
  return null;
}

async function resolveExistingFlagFilename(baseName){
  if(!baseName) return null;
  if(FLAG_RESOLVE_CACHE[baseName]) return FLAG_RESOLVE_CACHE[baseName];
  const exts = ['png','jpg','jpeg','svg','webp'];
  for(const ext of exts){
    const url = `${ORIGIN}/flags/${encodeURIComponent(baseName)}.${ext}`;
    try{
      let r = await fetch(url, { method:'HEAD', cache:'no-store' });
      if(r.ok){ FLAG_RESOLVE_CACHE[baseName] = `${baseName}.${ext}`; return FLAG_RESOLVE_CACHE[baseName]; }
    }catch(_){}
    try{
      let r2 = await fetch(url, { method:'GET', cache:'no-store' });
      if(r2.ok){ FLAG_RESOLVE_CACHE[baseName] = `${baseName}.${ext}`; return FLAG_RESOLVE_CACHE[baseName]; }
    }catch(_){}
  }
  return null;
}

// =================== MAP RENDER ===================
function ensureMarkersLayer(){
  const wrap = document.querySelector('.map-wrap') || document.body;
  // гарантируем относительное позиционирование обёртки, чтобы слой совпадал с картой
  if(getComputedStyle(wrap).position === 'static'){
    wrap.style.position = 'relative';
  }
  let layer = document.getElementById('map-markers');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'map-markers';
    layer.style.position = 'absolute';
    layer.style.left = '0';
    layer.style.top = '0';
    layer.style.right = '0';
    layer.style.bottom = '0';
    layer.style.width = '100%';
    layer.style.height = '100%';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '5';
    wrap.appendChild(layer);
  }
  return layer;
}

async function renderCountriesOnMap(){
  const mapObj = $('map');
  if(!mapObj) return;

  const layer = ensureMarkersLayer();
  layer.innerHTML = '';

  for(const c of COUNTRIES){
    if(typeof c.x !== 'number' || typeof c.y !== 'number') continue;

    const marker = document.createElement('div');
    marker.style.position = 'absolute';
    marker.style.left = Math.max(0, (c.x - 12)) + 'px';
    marker.style.top  = Math.max(0, (c.y - 12)) + 'px';
    marker.style.width = '24px';
    marker.style.height = '24px';
    marker.style.borderRadius = '50%';
    marker.style.background = '#eee';
    marker.style.boxShadow = '0 0 2px rgba(0,0,0,.4)';
    marker.style.pointerEvents = 'auto';
    marker.title = `${c.name} (${c.owner || '—'})`;

    const base = (c.flag || '').replace(/\.(png|jpe?g|svg|webp)$/i,'');
    let file = base ? (FLAG_RESOLVE_CACHE[base] || null) : null;
    if(!file && base){
      resolveExistingFlagFilename(base).then(f=>{
        if(f){
          const img = new Image();
          img.src = `${ORIGIN}/flags/${f}`;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          marker.innerHTML = '';
          marker.appendChild(img);
        }
      });
    }else if(file){
      const img = new Image();
      img.src = `${ORIGIN}/flags/${file}`;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      marker.appendChild(img);
    }

    layer.appendChild(marker);
  }
}

// =================== CREATE COUNTRY FLOW ===================
async function createCountryFlow(){
  if(!USER || !(USER.role === 'owner' || USER.role === 'admin')) return alert('Нет прав');

  // 1) Название
  const name = await promptAsync('Введите название страны (≤256, без цифр)');
  if(!isValidCountryName(name)) return alert('Некорректное название!');
  if(await countryExistsByName(name)) return alert('Страна с таким именем уже существует');

  // 2) Флаги
  let flags = await fetchFlagsList();
  let flagBase = '';
  if(flags && flags.length){
    // покажем первые 50 для читаемости
    const sample = flags.slice(0, 50);
    const choice = await promptAsync('Выберите флаг (введите точное имя из списка):\n' + sample.join(', ') + (flags.length>50 ? `\n...и ещё ${flags.length-50}` : ''));
    if(!choice) return alert('Флаг не выбран');
    if(!flags.includes(choice)) return alert('Такого флага нет в списке');
    const resolved = await resolveExistingFlagFilename(choice);
    if(!resolved) return alert('Файл флага не найден в папке /flags');
    flagBase = choice;
  } else {
    // если сервер не даёт список — ручной ввод с реальной проверкой файла
    const manual = await promptAsync('Введите имя флага (без .png/.jpg/.svg/.webp)\nПапка: /flags');
    if(!manual) return alert('Флаг не выбран');
    const resolved = await resolveExistingFlagFilename(manual);
    if(!resolved) return alert('Файл флага не найден в папке /flags');
    flagBase = manual;
  }

  // 3) Владелец (опционально). Проверять существование будем на шаге assign_owner — сервер сам вернёт ошибку, если нет пользователя или уже есть страна.
  const ownerLogin = await promptAsync('Введите логин владельца страны (пусто = вы)');

  // 4) Клик по карте (в реальных координатах объекта)
  alert('Теперь кликните по карте, где разместить страну');
  const mapObj = $('map');
  if(!mapObj) return alert('Элемент карты не найден');

  const getCoords = (evt) => {
    const rect = mapObj.getBoundingClientRect();
    const x = Math.round(evt.clientX - rect.left);
    const y = Math.round(evt.clientY - rect.top);
    return { x, y };
  };

  const waitClickOnMap = () => new Promise(resolve=>{
    let detached = false;
    const cleanup = () => { detached = true;
      mapObj.removeEventListener('click', onObjClick);
      try{
        const doc = mapObj.contentDocument;
        const root = doc && doc.documentElement;
        if(root) root.removeEventListener('click', onSvgClick);
      }catch(_){}
    };
    const onAny = (e) => { if(detached) return; e.preventDefault(); const c = getCoords(e); cleanup(); resolve(c); };
    const onObjClick = onAny;
    const onSvgClick = onAny;

    mapObj.addEventListener('click', onObjClick);
    const trySvg = () => {
      try{
        const doc = mapObj.contentDocument;
        const root = doc && doc.documentElement;
        if(root) root.addEventListener('click', onSvgClick);
      }catch(_){}
    };
    trySvg();
    mapObj.addEventListener('load', trySvg, { once:true });
  });

  const { x, y } = await waitClickOnMap();

  // 5) Создание
  const res = await apiPost('create_country', { name, flag: flagBase, x, y });
  if(!res || !res.ok) return alert('Ошибка при создании: ' + (res && res.message || 'unknown'));

  // 6) Назначение владельца (если попросили другого)
  if(ownerLogin && ownerLogin.toLowerCase() !== (USER.login||'').toLowerCase()){
    try{
      // найдём только что созданную страну по имени
      const all = await fetch(`${API}/countries`, { headers: buildHeaders(false) }).then(r=>r.json());
      const created = Object.values(all || {}).find(c => (c.name||'').toLowerCase() === name.toLowerCase());
      if(!created) {
        alert('Страна создана, но не нашлась для назначение владельца — обновите страницу и назначьте вручную.');
      } else {
        const ar = await apiPost('assign_owner', { countryId: created.id, login: ownerLogin });
        if(!ar.ok) return alert('Страна создана, но владельца назначить не удалось: ' + (ar.message || 'unknown'));
      }
    }catch(e){
      console.warn('assign_owner failed:', e);
    }
  }

  alert('Страна создана');
  await loadCountries(); // перерисует маркеры
}

// =================== LOGS ===================
async function viewLogsFlow(){
  if(!USER) return alert('Войдите!');
  if(!(USER.role === 'admin' || USER.role === 'owner')){
    $('logs-view').textContent = 'Нет доступа к логам: нужна роль admin или owner.';
    $('dlg-logs')?.showModal();
    return;
  }
  try{
    const res = await fetch(`${ORIGIN}/logs`, { headers: buildHeaders(false) });
    const ct = res.headers.get('content-type') || '';
    if(!ct.includes('application/json')){
      $('logs-view').textContent = 'Логи недоступны (сервер вернул не JSON). Проверьте права на сервере.';
    } else {
      const data = await res.json();
      if(Array.isArray(data) && data.length){
        $('logs-view').textContent = data.map(
          l => `[${l.timestamp}] ${l.user} — ${l.action}`
        ).join('\n');
      } else {
        $('logs-view').textContent = 'Логи пусты (или нет доступа).';
      }
    }
    $('dlg-logs')?.showModal();
  }catch(e){
    alert('Ошибка при загрузке логов: ' + e.message);
  }
}

// =================== ПРОЧИЕ ФЛОУ ===================
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

// =================== BUTTONS ===================
function bindActionButtons(){
  document.querySelectorAll('#actions .btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!USER) { alert('Сначала войдите'); return; }
      const action = btn.dataset.action;
      if(action === 'admin-open'){ show($('admin-panel')); return; }
      if(action === 'economy-spend'){
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
    TOKEN = ''; USER = null; localStorage.removeItem('token');
    await checkSession();
  });

  await checkSession();
  await loadCountries();

  // на случай, если SVG подгружается позже
  $('map')?.addEventListener('load', ()=> renderCountriesOnMap());
});
