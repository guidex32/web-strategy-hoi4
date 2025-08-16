const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];
let SELECTED_COUNTRY = null;

const $ = id => document.getElementById(id);
const dlgAuth = $('dlg-auth');
const dlgPrompt = $('dlg-prompt');
const dlgLogs = $('dlg-logs');

function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

// --- API ---
async function apiAuth(op, data){
  try {
    const res = await fetch(`${API}/auth`, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization': TOKEN ? 'Bearer '+TOKEN : ''},
      body: JSON.stringify({op, ...data})
    });
    return await res.json();
  } catch(err){ console.error(err); return {ok:false,message:'Сервер не отвечает'}; }
}

async function apiOp(op, data={}){
  try {
    const res = await fetch(`${API}/api`, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization': TOKEN ? 'Bearer '+TOKEN : ''},
      body: JSON.stringify({op,...data})
    });
    return await res.json();
  } catch(err){ console.error(err); return {ok:false,message:'Сервер не отвечает'}; }
}

// --- check session ---
async function checkSession(){
  if(!TOKEN){
    USER = null;
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
    return false;
  }
  const r = await apiAuth('session',{});
  if(r.user){
    USER = r.user;
    $('user-info').textContent = `${USER.login} (${USER.role})`;
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role==='admin') show($('admin-panel')); else hide($('admin-panel'));
    return true;
  } else {
    TOKEN=''; USER=null;
    localStorage.removeItem('token');
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
    return false;
  }
}

// --- Auth buttons ---
$('btn-login').onclick = ()=>dlgAuth.showModal();
$('btn-logout').onclick = async ()=>{
  TOKEN=''; USER=null;
  localStorage.removeItem('token');
  await checkSession();
};

// --- Register ---
$('btn-register').onclick = async e=>{
  e.preventDefault();
  const login = $('auth-username').value.trim();
  const pass = $('auth-password').value.trim();
  if(!login || !pass) return alert('Введите логин и пароль');
  const r = await apiAuth('register',{login,password:pass});
  if(r.ok){
    const loginRes = await apiAuth('login',{login,password:pass});
    if(loginRes.ok){
      TOKEN = loginRes.token;
      localStorage.setItem('token', TOKEN);
      USER = loginRes.user;
      dlgAuth.close();
      await checkSession();
      await loadCountries();
    } else alert('Не удалось автоматически войти: '+loginRes.message);
  } else alert(r.message);
};

// --- Sign in ---
$('btn-signin').onclick = async e=>{
  e.preventDefault();
  const login = $('auth-username').value.trim();
  const pass = $('auth-password').value.trim();
  if(!login || !pass) return alert('Введите логин и пароль');
  const r = await apiAuth('login',{login,password:pass});
  if(r.ok){
    TOKEN = r.token;
    localStorage.setItem('token', TOKEN);
    USER = r.user;
    dlgAuth.close();
    await checkSession();
    await loadCountries();
  } else alert(r.message);
};

// --- Countries ---
async function loadCountries(){
  if(!TOKEN) return;
  try {
    const res = await fetch(`${API}/countries`,{headers:{'Authorization':'Bearer '+TOKEN}});
    const data = await res.json();
    if(!Array.isArray(data)) {
      console.error('Invalid countries', data);
      if(data.message==='Invalid token'){ TOKEN=''; localStorage.removeItem('token'); await checkSession(); }
      return;
    }
    COUNTRIES = data;
    updatePoints();
    updateMap();
  } catch(err){ console.error(err); }
}

// --- Update points ---
function updatePoints(){
  let pts = 0;
  for(const id in COUNTRIES) if(COUNTRIES[id].owner===USER?.login) pts += COUNTRIES[id].points||0;
  $('points').textContent = `Очки: ${pts}`;
}

// --- Map ---
const mapObj = $('map');
mapObj.addEventListener('load',()=>{
  const svg = mapObj.contentDocument;
  for(const id in COUNTRIES){
    const el = svg.getElementById(id);
    if(el){
      el.style.fill = COUNTRIES[id].owner ? '#8bc34a':'#ccc';
      el.addEventListener('click',()=>selectCountry(id));
      el.addEventListener('mouseenter',()=>showTooltip(el,COUNTRIES[id].name));
      el.addEventListener('mouseleave',()=>hide($('tooltip')));
    }
  }
});

function selectCountry(id){
  SELECTED_COUNTRY = COUNTRIES[id];
  $('info-country').textContent = SELECTED_COUNTRY.name;
  $('info-owner').textContent = SELECTED_COUNTRY.owner||'—';
  $('info-econ').textContent = SELECTED_COUNTRY.economy||0;
  $('info-army').textContent = JSON.stringify(SELECTED_COUNTRY.army);
  $('info-status').textContent = SELECTED_COUNTRY.status||'мир';
  updateActions();
}

function updateActions(){
  const actions = document.querySelectorAll('#actions button');
  actions.forEach(btn=>{
    const op = btn.dataset.action;
    if(op.startsWith('(Г)') || op.startsWith('buy-unit') || op.startsWith('economy-spend') || op.startsWith('declare-war') || op.startsWith('attack')){
      if(USER && (USER.role==='admin' || SELECTED_COUNTRY?.owner===USER.login)) btn.disabled=false;
      else btn.disabled=true;
    }
  });
}

// --- Tooltip ---
function showTooltip(el,name){
  const t=$('tooltip');
  t.textContent=name;
  const bbox=el.getBoundingClientRect();
  t.style.left=(bbox.x+bbox.width/2)+'px';
  t.style.top=(bbox.y-20)+'px';
  show(t);
}

// --- Actions click ---
document.querySelectorAll('#actions button').forEach(btn=>{
  btn.addEventListener('click',async()=>{
    if(!SELECTED_COUNTRY) return alert('Выберите страну');
    const op = btn.dataset.action;
    if(op==='buy-unit') {
      const unit=btn.dataset.unit, cost=parseInt(btn.dataset.cost||0);
      const r=await apiOp('buy_unit',{countryId: getCountryId(SELECTED_COUNTRY),unit,cost});
      if(r.ok){ alert('Юнит куплен'); await loadCountries(); selectCountry(getCountryId(SELECTED_COUNTRY)); }
      else alert(r.message);
    }
    if(op==='economy-spend'){
      const cost=parseInt(btn.dataset.cost||0);
      const r=await apiOp('build_economy',{countryId:getCountryId(SELECTED_COUNTRY),cost});
      if(r.ok){ alert('Экономика улучшена'); await loadCountries(); selectCountry(getCountryId(SELECTED_COUNTRY)); }
      else alert(r.message);
    }
    if(op==='declare-war'){
      const target = prompt('ID страны для войны?');
      if(!target) return;
      const r=await apiOp('declare_war',{attackerId:getCountryId(SELECTED_COUNTRY),defenderId:target});
      if(r.ok){ alert('Война объявлена'); await loadCountries(); selectCountry(getCountryId(SELECTED_COUNTRY)); }
      else alert(r.message);
    }
    if(op==='attack'){
      const target = prompt('ID страны для атаки?');
      if(!target) return;
      const r=await apiOp('attack',{attackerId:getCountryId(SELECTED_COUNTRY),defenderId:target});
      if(r.ok){ alert('Атака выполнена'); await loadCountries(); selectCountry(getCountryId(SELECTED_COUNTRY)); }
      else alert(r.message);
    }
  });
});

function getCountryId(c){
  for(const id in COUNTRIES) if(COUNTRIES[id]===c) return id;
  return null;
}

// --- Admin panel ---
document.querySelectorAll('#admin-panel button').forEach(btn=>{
  btn.addEventListener('click',async()=>{
    if(!USER || USER.role!=='admin') return alert('Только админ');
    const op = btn.dataset.admin;
    if(op==='create-country'){
      const name=prompt('Название страны?');
      if(!name) return;
      const r=await apiOp('admin_create_country',{name});
      if(r.ok) alert('Создана страна ID:'+r.id);
      await loadCountries();
    }
    if(op==='assign-owner'){
      const cid=prompt('ID страны?'); if(!cid) return;
      const login=prompt('Логин нового владельца?'); if(!login) return;
      const r=await apiOp('admin_assign_owner',{countryId:cid,login});
      if(r.ok) alert('Назначен владелец'); await loadCountries();
    }
    if(op==='give-points'){
      const cid=prompt('ID страны?'); if(!cid) return;
      const amt=parseInt(prompt('Сколько очков выдать?')||0);
      const r=await apiOp('admin_give_points',{countryId:cid,amount:amt});
      if(r.ok) alert('Очки выданы'); await loadCountries();
    }
    if(op==='toggle-economy'){
      const r=await apiOp('admin_toggle_economy');
      if(r.ok) alert('Экономика '+(r.ECONOMY_ENABLED?'включена':'выключена'));
    }
    if(op==='view-logs'){
      const r=await apiOp('admin_logs');
      if(r.ok){
        $('logs-view').textContent=r.logs.join('\n');
        dlgLogs.showModal();
      }
    }
  });
});

// --- Init ---
(async()=>{
  const ok = await checkSession();
  if(ok) await loadCountries();
})();
