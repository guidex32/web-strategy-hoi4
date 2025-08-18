// app.js (ПФ) — полный файл, готов к замене
// =================== CONFIG ===================
const API = 'https://web-strategy-hoi4.onrender.com/api';
const ORIGIN = 'https://web-strategy-hoi4.onrender.com';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

// кэш: baseName -> fileName с расширением
const FLAG_RESOLVE_CACHE = Object.create(null);

// UI helper
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
  }catch(e){
    return { ok:false, message: e.message };
  }
}

async function apiPost(op, data){
  try{
    const res = await fetch(`${API}`, {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({ op, ...data })
    });
    return await res.json();
  }catch(e){
    return { ok:false, message: e.message };
  }
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

// =================== PROMPT DIALOG HELPER ===================
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
// Try server endpoint first (/api/flags). If not available - fall back to manual input with resolveExistingFlagFilename check.
async function fetchFlagsList(){
  try{
    const r = await fetch(`${API}/flags`, { headers: buildHeaders(false), cache: 'no-store' });
    if(r.ok){
      const ct = r.headers.get('content-type') || '';
      if(ct.includes('application/json')){
        const arr = await r.json();
        // server returns filenames with extensions -> convert to base names
        if(Array.isArray(arr) && arr.length) {
          return arr.map(f => String(f).replace(/^\/?flags\//,'').replace(/\.(png|jpe?g|svg|webp)$/i,''));
        }
      }
    }
  }catch(_){ /* fall through */ }

  // no manifest and no /api/flags — return null to indicate manual input flow
  return null;
}

async function resolveExistingFlagFilename(baseName){
  if(!baseName) return null;
  if(FLAG_RESOLVE_CACHE[baseName]) return FLAG_RESOLVE_CACHE[baseName];
  const exts = ['png','jpg','jpeg','svg','webp'];
  for(const ext of exts){
    const url = `${ORIGIN}/flags/${encodeURIComponent(baseName)}.${ext}`;
    try{
      // try HEAD first (faster when supported)
      let r = await fetch(url, { method:'HEAD', cache:'no-store' });
      if(r.ok){ FLAG_RESOLVE_CACHE[baseName] = `${baseName}.${ext}`; return FLAG_RESOLVE_CACHE[baseName]; }
    }catch(_){}
    try{
      // some servers don't allow HEAD — try GET
      let r2 = await fetch(url, { method:'GET', cache:'no-store' });
      if(r2.ok){ FLAG_RESOLVE_CACHE[baseName] = `${baseName}.${ext}`; return FLAG_RESOLVE_CACHE[baseName]; }
    }catch(_){}
  }
  return null;
}

// =================== MAP + MARKERS (position + svg scaling) ===================
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

// Helper: get svg viewBox size (if accessible)
function getSvgViewBoxSize(mapObj){
  try{
    const doc = mapObj.contentDocument;
    const svg = doc && doc.documentElement;
    if(svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width){
      return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height };
    }
    // fallback: try width/height attributes or client sizes
    if(svg){
      const w = parseFloat(svg.getAttribute('width')) || svg.clientWidth || null;
      const h = parseFloat(svg.getAttribute('height')) || svg.clientHeight || null;
      if(w && h) return { width: w, height: h };
    }
  }catch(_){}
  return null;
}

async function renderCountriesOnMap(){
  const mapObj = $('map');
  if(!mapObj) return;

  const layer = ensureMarkersLayer();
  layer.innerHTML = '';

  const rect = mapObj.getBoundingClientRect();
  const vb = getSvgViewBoxSize(mapObj); // may be null
  const scaleX = vb ? (rect.width / vb.width) : 1;
  const scaleY = vb ? (rect.height / vb.height) : 1;

  for(const c of COUNTRIES){
    if(typeof c.x !== 'number' || typeof c.y !== 'number') continue;

    const marker = document.createElement('div');
    marker.className = 'country-flag';
    marker.style.position = 'absolute';
    // compute pixel positions relative to layer
    const px = vb ? Math.round(c.x * scaleX) : Math.round(c.x);
    const py = vb ? Math.round(c.y * scaleY) : Math.round(c.y);
    // layer's top-left aligns with mapObj inside map-wrap; but map may be centered — compute offsets relative to layer
    // mapObj is centered or has margins; we want coordinates inside layer, which covers the whole map-wrap,
    // so compute offsets based on mapObj position inside the wrap:
    const wrap = layer.parentElement.getBoundingClientRect();
    const offsetLeft = rect.left - wrap.left;
    const offsetTop  = rect.top - wrap.top;

    const left = Math.max(0, (offsetLeft + px - 10)); // subtract half marker (marker width ~20)
    const top  = Math.max(0, (offsetTop  + py - 10));
    marker.style.left = left + 'px';
    marker.style.top  = top + 'px';
    marker.style.width = '20px';
    marker.style.height = '20px';
    marker.style.borderRadius = '50%';
    marker.style.background = '#e7eef6';
    marker.style.boxShadow = '0 0 2px rgba(0,0,0,.4)';
    marker.style.pointerEvents = 'auto';
    marker.title = `${c.name} (${c.owner || '—'})`;

    // try to show flag image
    const base = (c.flag || '').replace(/\.(png|jpe?g|svg|webp)$/i,'');
    let file = base ? (FLAG_RESOLVE_CACHE[base] || null) : null;
    if(!file && base){
      // async resolve — append placeholder now, replace when resolved
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
    } else if(file){
      const img = new Image();
      img.src = `${ORIGIN}/flags/${file}`;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      marker.appendChild(img);
    } else {
      // fallback label first letter
      const txt = document.createElement('div');
      txt.style.fontSize = '10px';
      txt.style.lineHeight = '20px';
      txt.style.textAlign = 'center';
      txt.style.width = '100%';
      txt.style.color = '#001018';
      txt.textContent = (c.name||'')[0] || '?';
      marker.innerHTML = '';
      marker.appendChild(txt);
    }

    layer.appendChild(marker);
  }
}

// =================== CREATE COUNTRY FLOW ===================
// Full flow: name -> check -> choose flag (server list or manual) -> owner optional -> click on map -> create
async function createCountryFlow(){
  if(!USER || !(USER.role === 'owner' || USER.role === 'admin')) return alert('Нет прав');

  // 1) Name
  const name = await promptAsync('Введите название страны (≤256, без цифр)');
  if(!isValidCountryName(name)) return alert('Некорректное название!');
  if(await countryExistsByName(name)) return alert('Страна с таким именем уже существует');

  // 2) Flags: try server /api/flags
  let flags = null;
  try{ flags = await fetchFlagsList(); }catch(_){ flags = null; }

  let flagBase = '';
  if(flags && flags.length){
    // show first N
    const sample = flags.slice(0, 120); // show many
    const choice = await promptAsync('Выберите флаг (введите точное имя из списка):\n' + sample.join(', ') + (flags.length>sample.length ? `\n...и ещё ${flags.length-sample.length}` : ''));
    if(!choice) return alert('Флаг не выбран');
    if(!flags.includes(choice)) return alert('Такого флага нет в списке');
    const resolved = await resolveExistingFlagFilename(choice);
    if(!resolved) return alert('Файл флага не найден в папке /flags');
    flagBase = choice;
  } else {
    // manual input + check file exists
    const manual = await promptAsync('Введите имя флага (без .png/.jpg)\nПапка: /flags');
    if(!manual) return alert('Флаг не выбран');
    const resolved = await resolveExistingFlagFilename(manual);
    if(!resolved) return alert('Файл флага не найден в папке /flags');
    flagBase = manual;
  }

  // 3) owner optional (empty = you)
  const ownerLogin = await promptAsync('Введите логин владельца страны (пусто = вы)');

  // 4) click on map -> coordinates should be in SVG viewBox coordinate system if viewBox exists
  alert('Теперь кликните по карте, где разместить страну');
  const mapObj = $('map');
  if(!mapObj) return alert('Элемент карты не найден');

  // prepare converter
  const rect = mapObj.getBoundingClientRect();
  const vb = (function(){
    try{
      const doc = mapObj.contentDocument;
      const svg = doc && doc.documentElement;
      if(svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width){
        return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height };
      }
    }catch(_){}
    return null;
  })();

  const getCoords = (evt) => {
    const rx = evt.clientX - rect.left;
    const ry = evt.clientY - rect.top;
    if(vb){
      // convert pixel to viewBox coords
      const x = Math.round(rx * (vb.width / rect.width));
      const y = Math.round(ry * (vb.height / rect.height));
      return { x, y };
    } else {
      return { x: Math.round(rx), y: Math.round(ry) };
    }
  };

  const waitClickOnMap = () => new Promise(resolve=>{
    let detached = false;
    const cleanup = () => {
      detached = true;
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

  // 5) create on server
  const res = await apiPost('create_country', { name, flag: flagBase, x, y });
  if(!res || !res.ok) return alert('Ошибка при создании: ' + (res && res.message || 'unknown'));

  // 6) optionally assign owner (if specified and not yourself)
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
    // try API-root logs first (some servers might expose /api/logs)
    let res = null;
    let data = null;
    try{
      res = await fetch(`${API}/logs`, { headers: buildHeaders(false) });
      // if 404 or text/html, fallback
      const ct = (res.headers.get('content-type') || '');
      if(!res.ok || !ct.includes('application/json')){
        // fallback to origin /logs
        res = await fetch(`${ORIGIN}/logs`, { headers: buildHeaders(false) });
      }
    }catch(_){
      res = await fetch(`${ORIGIN}/logs`, { headers: buildHeaders(false) });
    }

    const ct = (res.headers.get('content-type') || '');
    if(!ct.includes('application/json')){
      // don't try to parse HTML -> show message
      $('logs-view').textContent = 'Логи недоступны (сервер вернул не JSON). Проверьте права/эндпоинт на сервере.';
      $('dlg-logs')?.showModal();
      return;
    }

    data = await res.json();
    if(Array.isArray(data) && data.length){
      $('logs-view').textContent = data.map(l => `[${l.timestamp}] ${l.user} — ${l.action}`).join('\n');
    } else {
      $('logs-view').textContent = 'Логи пусты (или нет доступа).';
    }
    $('dlg-logs')?.showModal();
  }catch(e){
    alert('Ошибка при загрузке логов: ' + e.message);
  }
}

// =================== BUILDINGS (economy) ===================
const BUILDINGS = [
  { name: 'Офис', income: 5, cost: 10 },
  { name: 'Военная база', income: 15, cost: 30 },
  { name: 'Аэропорт', income: 50, cost: 100 },
  { name: 'Нефтекaчка', income: 200, cost: 500 }
];

// Flow: pick country (owner), pick building, check points, call server 'build_building'
async function buildBuildingFlow(){
  if(!USER) return alert('Сначала войдите');

  const countryId = await promptAsync('Введите ID вашей страны');
  if(!countryId) return;
  const country = COUNTRIES.find(c => String(c.id) === String(countryId));
  if(!country) return alert('Страна не найдена');
  if(country.owner?.toLowerCase() !== (USER.login||'').toLowerCase()) return alert('Вы не владелец этой страны');

  const menu = BUILDINGS.map((b,i)=>`${i+1}. ${b.name} (стоимость: ${b.cost}, +${b.income} очков/час)`).join('\n');
  const choice = await promptAsync('Выберите здание:\n' + menu);
  const idx = parseInt(choice) - 1;
  if(isNaN(idx) || idx<0 || idx>=BUILDINGS.length) return alert('Неверный выбор');
  const building = BUILDINGS[idx];

  if((country.points||0) < building.cost) return alert('Недостаточно очков для строительства');

  // send to server; server must implement 'build_building' op and perform points deduction & store building data
  const res = await apiPost('build_building', { countryId, building: building.name });
  if(!res.ok) return alert('Ошибка: ' + (res.message||'unknown'));

  alert(`${building.name} построено! Пассивный доход ${building.income} очков/час`);
  await loadCountries();
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
  // keep server toggle available for admins (but primary economy flow is buildings)
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
      if(action === 'economy-spend'){ return await buildBuildingFlow(); } // changed: build flow instead of simple toggle
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

// =================== AUTH HANDLERS (не меняем логику регистрации/входа) ===================
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

  // Re-render markers when SVG loaded (in case contentDocument wasn't available earlier)
  $('map')?.addEventListener('load', ()=> renderCountriesOnMap());
});
