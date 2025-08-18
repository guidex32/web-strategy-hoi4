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
async function fetchFlagsList(){
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

// =================== MAP RENDER FIX ===================
function ensureMarkersLayer(){
  const wrap = document.querySelector('.map-wrap') || document.body;
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
    marker.style.left = Math.min(layer.clientWidth-24, Math.max(0, c.x - 12)) + 'px';
    marker.style.top  = Math.min(layer.clientHeight-24, Math.max(0, c.y - 12)) + 'px';
    marker.style.width = '24px';
    marker.style.height = '24px';
    marker.style.borderRadius = '50%';
    marker.style.background = '#eee';
    marker.style.boxShadow = '0 0 2px rgba(0,0,0,.4)';
    marker.style.pointerEvents = 'auto';
    marker.title = `${c.name} (${c.owner || '—'})`;

    const base = (c.flag || '').replace(/\.(png|jpe?g|svg|webp)$/i,'');
    let file = base ? (FLAG_RESOLVE_CACHE[base] || null) : null;
    const appendFlag = (f)=>{
      if(f){
        const img = new Image();
        img.src = `${ORIGIN}/flags/${f}`;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        marker.innerHTML = '';
        marker.appendChild(img);
      }
    };
    if(!file && base){
      resolveExistingFlagFilename(base).then(f=>{
        FLAG_RESOLVE_CACHE[base] = f;
        appendFlag(f);
      });
    } else if(file){
      appendFlag(file);
    }

    layer.appendChild(marker);
  }
}

// =================== CREATE COUNTRY FLOW ===================
async function createCountryFlow(){
  if(!USER || !(USER.role === 'owner' || USER.role === 'admin')) return alert('Нет прав');

  const name = await promptAsync('Введите название страны (≤256, без цифр)');
  if(!isValidCountryName(name)) return alert('Некорректное название!');
  if(await countryExistsByName(name)) return alert('Страна с таким именем уже существует');

  let flags = await fetchFlagsList();
  let flagBase = '';
  if(flags && flags.length){
    const sample = flags.slice(0, 50);
    const choice = await promptAsync('Выберите флаг (введите точное имя из списка):\n' + sample.join(', ') + (flags.length>50 ? `\n...и ещё ${flags.length-50}` : ''));
    if(!choice) return alert('Флаг не выбран');
    if(!flags.includes(choice)) return alert('Такого флага нет в списке');
    const resolved = await resolveExistingFlagFilename(choice);
    if(!resolved) return alert('Файл флага не найден в папке /flags');
    flagBase = choice;
  } else {
    const manual = await promptAsync('Введите имя флага (без .png/.jpg/.svg/.webp)\nПапка: /flags');
    if(!manual) return alert('Флаг не выбран');
    const resolved = await resolveExistingFlagFilename(manual);
    if(!resolved) return alert('Файл флага не найден в папке /flags');
    flagBase = manual;
  }

  const ownerLogin = await promptAsync('Введите логин владельца страны (пусто = вы)');

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

  const res = await apiPost('create_country', { name, flag: flagBase, x, y });
  if(!res || !res.ok) return alert('Ошибка при создании: ' + (res && res.message || 'unknown'));

  if(ownerLogin && ownerLogin.toLowerCase() !== (USER.login||'').toLowerCase()){
    try{
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
  await loadCountries();
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
  }catch(e){ $('logs-view').textContent = 'Ошибка: ' + e.message; $('dlg-logs')?.showModal(); }
}

// =================== BUILDINGS ===================
const BUILDINGS = [
  { name: 'Офис', income: 5, cost: 10 },
  { name: 'Военная база', income: 15, cost: 30 },
  { name: 'Аэропорт', income: 50, cost: 100 },
  { name: 'Нефтекaчка', income: 200, cost: 500 }
];

async function buildBuildingFlow(){
  if(!USER) return alert('Сначала войдите');

  const countryId = await promptAsync('Введите ID вашей страны');
  if(!countryId) return;
  const country = COUNTRIES.find(c => String(c.id) === String(countryId));
  if(!country) return alert('Страна не найдена');
  if(country.owner?.toLowerCase() !== (USER.login||'').toLowerCase()) return alert('Вы не владелец этой страны');

  const choice = await promptAsync('Выберите здание:\n' + BUILDINGS.map((b,i)=>`${i+1}. ${b.name} (стоимость: ${b.cost})`).join('\n'));
  const idx = parseInt(choice)-1;
  if(isNaN(idx) || idx<0 || idx>=BUILDINGS.length) return alert('Неверный выбор');
  const building = BUILDINGS[idx];

  if((country.points||0) < building.cost) return alert('Недостаточно очков для строительства');

  const res = await apiPost('build_building', { countryId, building: building.name });
  if(!res.ok) return alert('Ошибка: ' + (res.message||'unknown'));

  alert(`${building.name} построено! Пассивный доход ${building.income} очков/час`);
  await loadCountries();
}

// =================== BUTTONS ===================
function bindActionButtons(){
  document.querySelectorAll('#actions .btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!USER) { alert('Сначала войдите'); return; }
      const action = btn.dataset.action;
      if(action === 'build-building') return buildBuildingFlow();
      if(action === 'economy-spend') return alert('Экономика теперь управляется через здания и пассивный доход');
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

// =================== INIT ===================
async function initApp(){
  await checkSession();
  await loadCountries();
  bindActionButtons();

  $('btn-login')?.addEventListener('click', async ()=>{
    const login = await promptAsync('Логин'); if(!login) return;
    const password = await promptAsync('Пароль'); if(!password) return;
    const r = await apiAuth('login', { login, password });
    if(r.ok && r.token){ TOKEN = r.token; localStorage.setItem('token', TOKEN); await checkSession(); await loadCountries(); alert('Вход выполнен'); }
    else alert('Ошибка входа: ' + (r.message||'unknown'));
  });

  $('btn-logout')?.addEventListener('click', ()=>{
    TOKEN = ''; USER = null; localStorage.removeItem('token');
    checkSession();
  });

  $('btn-create-country')?.addEventListener('click', createCountryFlow);
  $('btn-view-logs')?.addEventListener('click', viewLogsFlow);
}

document.addEventListener('DOMContentLoaded', initApp);
