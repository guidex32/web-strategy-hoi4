// Client for HOI-Lite Node version
const API = {
  async post(path, data) {
    const token = localStorage.getItem('token');
    const res = await fetch(path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...(token? {'Authorization': 'Bearer ' + token} : {})},
      body: JSON.stringify(data||{})
    });
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { throw new Error(text); }
    if(!res.ok) throw new Error(j.error || j.message || 'error');
    return j;
  },
  async get(path) {
    const token = localStorage.getItem('token');
    const res = await fetch(path, { headers: token? {'Authorization': 'Bearer ' + token} : {} });
    const j = await res.json(); if(!res.ok) throw new Error(j.error||'error'); return j;
  }
}

const state = {
  user: null,
  selectedCountryId: null,
  countries: {}
};

function $(sel, root=document){ return root.querySelector(sel) }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)) }

function setHidden(el, hidden){ hidden ? el.classList.add('hidden') : el.classList.remove('hidden') }

async function init(){
  wireUI();
  await refreshSession();
  await loadCountries();
  bindMap();
  tickUI();
}

function wireUI(){
  $('#btn-login').addEventListener('click', ()=> $('#dlg-auth').showModal());
  $('#btn-logout').addEventListener('click', logout);
  $('#btn-register').addEventListener('click', onRegister);
  $('#btn-signin').addEventListener('click', onLogin);

  $('[data-action="admin-open"]').addEventListener('click', ()=>{
    if(!state.user || state.user.role!=='admin'){ alert('Только админ'); return; }
    $('#admin-panel').classList.toggle('hidden');
  });

  // Admin actions
  $('[data-admin="create-country"]').addEventListener('click', ()=> promptDialog('Название страны', async (name)=>{
    if(!name) return;
    await API.post('/api', {op:'admin_create_country', name});
    await loadCountries();
  }));
  $('[data-admin="assign-owner"]').addEventListener('click', ()=> promptDialog('Логин владельца (и выбери страну на карте)', async (login)=>{
    const id = state.selectedCountryId;
    if(!login || !id) return alert('Нужны логин и выбранная страна');
    await API.post('/api', {op:'admin_assign_owner', countryId:id, login});
    await loadCountries();
  }));
  $('[data-admin="give-points"]').addEventListener('click', ()=> promptDialog('Сколько очков выдать выбранной стране?', async (n)=>{
    const id = state.selectedCountryId;
    await API.post('/api', {op:'admin_give_points', countryId:id, amount:parseInt(n||'0')});
    await loadCountries();
  }));
  $('[data-admin="toggle-economy"]').addEventListener('click', async ()=>{
    await API.post('/api', {op:'admin_toggle_economy'});
    alert('Переключено');
  });
  $('[data-admin="view-logs"]').addEventListener('click', async ()=>{
    const r = await API.post('/api', {op:'admin_logs'});
    $('#logs-view').textContent = r.logs.join('\n');
    $('#dlg-logs').showModal();
  });

  // Gameplay actions (Г)
  $all('[data-action="buy-unit"]').forEach(btn => btn.addEventListener('click', async ()=>{
    if(!state.selectedCountryId) return alert('Выбери страну');
    await API.post('/api', {op:'buy_unit', countryId: state.selectedCountryId, unit: btn.dataset.unit, cost: parseInt(btn.dataset.cost)});
    await loadCountries();
  }));
  $('[data-action="economy-spend"]').addEventListener('click', async (e)=>{
    if(!state.selectedCountryId) return alert('Выбери страну');
    await API.post('/api', {op:'build_economy', countryId: state.selectedCountryId, cost: parseInt(e.target.dataset.cost)});
    await loadCountries();
  });
  $('[data-action="declare-war"]').addEventListener('click', async ()=>{
    if(!state.selectedCountryId) return alert('Выбери свою страну');
    const target = prompt('С кем война? Введи ID страны');
    if(!target) return;
    await API.post('/api', {op:'declare_war', attackerId: state.selectedCountryId, defenderId: target});
    await loadCountries();
  });
  $('[data-action="attack"]').addEventListener('click', async ()=>{
    if(!state.selectedCountryId) return alert('Выбери свою страну');
    const target = prompt('Кого атаковать? Введи ID страны');
    if(!target) return;
    await API.post('/api', {op:'attack', attackerId: state.selectedCountryId, defenderId: target});
    await loadCountries();
  });
}

async function refreshSession(){
  try{
    const r = await API.post('/auth', {op:'session'});
    state.user = r.user;
    updateAuthUI();
  }catch(e){ console.warn(e) }
}

async function onRegister(e){
  e.preventDefault();
  const login = $('#auth-username').value.trim();
  const password = $('#auth-password').value.trim();
  if(!login || !password) return;
  const r = await API.post('/auth', {op:'register', login, password});
  alert(r.message);
  $('#dlg-auth').close();
  await refreshSession();
}

async function onLogin(e){
  e.preventDefault();
  const login = $('#auth-username').value.trim();
  const password = $('#auth-password').value.trim();
  const r = await API.post('/auth', {op:'login', login, password});
  if(r.ok){
    localStorage.setItem('token', r.token);
    $('#dlg-auth').close();
    await refreshSession();
  } else alert(r.message||'Ошибка');
}

async function logout(){
  localStorage.removeItem('token');
  state.user = null;
  updateAuthUI();
}

function updateAuthUI(){
  const isAuth = !!state.user;
  setHidden($('#btn-login'), isAuth);
  setHidden($('#btn-logout'), !isAuth);
  setHidden($('#user-info'), !isAuth);
  if(isAuth){
    $('#user-info').textContent = `${state.user.login} · ${state.user.role}`;
  }
}

async function loadCountries(){
  const r = await API.post('/api', {op:'list'});
  state.countries = r.countries;
  renderSelectedInfo();
}

function bindMap(){
  const obj = document.getElementById('map');
  obj.addEventListener('load', ()=>{
    const svg = obj.contentDocument;
    if(!svg) return;
    svg.querySelectorAll('[id^="c-"], [data-country-id]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', ()=>{
        const id = el.getAttribute('data-country-id') || el.id.replace('c-','');
        state.selectedCountryId = id;
        renderSelectedInfo();
      });
      el.addEventListener('mousemove', (ev)=> showTooltip(ev, el));
      el.addEventListener('mouseleave', hideTooltip);
    });
  });
}

function showTooltip(ev, el){
  const tip = $('#tooltip');
  const id = el.getAttribute('data-country-id') || el.id.replace('c-','');
  const c = state.countries[id];
  tip.innerHTML = c ? `<b>${c.name}</b><br/>Экономика: ${c.economy}<br/>Очки: ${c.points}` : `Страна ${id}`;
  tip.style.left = ev.clientX + 'px';
  tip.style.top = ev.clientY + 'px';
  setHidden(tip, false);
}
function hideTooltip(){ setHidden($('#tooltip'), true) }

function renderSelectedInfo(){
  const id = state.selectedCountryId;
  const c = id ? state.countries[id] : null;
  $('#info-country').textContent = c ? `${c.name} (ID ${id})` : '—';
  $('#info-owner').textContent = c?.owner || '—';
  $('#info-econ').textContent = c?.economy ?? 0;
  $('#info-army').textContent = c ? JSON.stringify(c.army) : 'нет';
  $('#info-status').textContent = c?.status || 'мир';
  $('#points').textContent = 'Очки: ' + (c?.points ?? 0);
}

function promptDialog(title, onOk){
  $('#prompt-title').textContent = title;
  $('#prompt-input').value='';
  $('#dlg-prompt').showModal();
  $('#prompt-ok').onclick = (e)=>{ e.preventDefault(); $('#dlg-prompt').close(); onOk($('#prompt-input').value.trim()) }
}

function tickUI(){ setTimeout(tickUI, 20000) }
window.addEventListener('DOMContentLoaded', init);
