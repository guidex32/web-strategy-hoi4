const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

const $ = id=>document.getElementById(id);
const dlgAuth = $('dlg-auth');

function show(el){el.classList.remove('hidden');}
function hide(el){el.classList.add('hidden');}

// --- Auth ---
async function apiAuth(op,data){
  const res = await fetch(`${API}/auth`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':TOKEN?'Bearer '+TOKEN:''},
    body: JSON.stringify({op,...data})
  });
  return res.json();
}

async function checkSession(){
  if(!TOKEN){USER=null;hide($('user-info'));hide($('btn-logout'));show($('btn-login'));hide($('admin-panel'));return;}
  const r = await apiAuth('session',{});
  if(r.user){
    USER=r.user;TOKEN=r.token||TOKEN;
    localStorage.setItem('token',TOKEN);
    $('user-info').textContent=USER.login+' ('+USER.role+')';
    show($('user-info'));show($('btn-logout'));hide($('btn-login'));
    if(USER.role==='owner'||USER.role==='admin') show($('admin-panel')); else hide($('admin-panel'));
  }else{
    TOKEN='';localStorage.removeItem('token');USER=null;
    hide($('user-info'));hide($('btn-logout'));show($('btn-login'));hide($('admin-panel'));
  }
}

// --- Login/Register ---
$('btn-login').onclick = ()=>dlgAuth.showModal();
$('btn-logout').onclick = async ()=>{TOKEN='';USER=null;localStorage.removeItem('token');await checkSession();};

$('btn-register').onclick = async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login||!pass)return alert('Введите логин и пароль');
  const r = await apiAuth('register',{login,password:pass});
  if(r.ok){
    const lr = await apiAuth('login',{login,password:pass});
    if(lr.ok){TOKEN=lr.token;localStorage.setItem('token',TOKEN);USER=lr.user;dlgAuth.close();await checkSession();await loadCountries();}
    else alert(lr.message);
  } else alert(r.message);
};

$('btn-signin').onclick = async e=>{
  e.preventDefault();
  const login=$('auth-username').value.trim();
  const pass=$('auth-password').value.trim();
  if(!login||!pass)return alert('Введите логин и пароль');
  const r = await apiAuth('login',{login,password:pass});
  if(r.ok){TOKEN=r.token;localStorage.setItem('token',TOKEN);USER=r.user;dlgAuth.close();await checkSession();await loadCountries();}
  else alert(r.message);
};

// --- Countries ---
async function apiCountries(){
  if(!TOKEN) return;
  const res = await fetch(`${API}/countries`,{headers:{'Authorization':'Bearer '+TOKEN}});
  const data = await res.json();
  COUNTRIES = data;
  updateMap();
  updatePoints();
}
async function loadCountries(){await apiCountries();}

// --- Map ---
let creatingCountry = false;
$('map').addEventListener('load',()=>{
  const svgDoc = $('map').contentDocument;
  if(!svgDoc) return;
  svgDoc.addEventListener('click',async e=>{
    if(creatingCountry){
      const rect = svgDoc.getBoundingClientRect();
      const x = Math.round(e.clientX-rect.left);
      const y = Math.round(e.clientY-rect.top);
      await apiOp('create_country',{name:creatingCountry.name,x,y});
      creatingCountry=false;
      await loadCountries();
    }
  });

  Object.keys(COUNTRIES).forEach(id=>{
    const c = COUNTRIES[id];
    let el = svgDoc.getElementById(id);
    if(!el){
      el = document.createElementNS("http://www.w3.org/2000/svg",'circle');
      el.setAttribute('id',id);
      el.setAttribute('cx',c.x);
      el.setAttribute('cy',c.y);
      el.setAttribute('r',10);
      el.setAttribute('fill','#4cc9f0');
      svgDoc.documentElement.appendChild(el);
    }
    el.style.cursor='pointer';
    el.onclick = ()=>selectCountry(id);
  });
});

// --- Admin panel ---
document.querySelector('[data-admin="create-country"]').onclick=()=>{
  if(USER.role!=='owner') return alert('Только овнер');
  const name = prompt('Название страны (только буквы)');
  if(!name||/\d/.test(name)) return alert('Неверное имя');
  creatingCountry={name};
  alert('Кликните на карте для размещения страны');
};

document.querySelector('[data-admin="toggle-economy"]').onclick=async()=>{
  if(!SELECTED_COUNTRY) return alert('Выберите страну');
  const r = await apiOp('toggle_economy',{countryId:SELECTED_COUNTRY});
  alert('Экономика: '+(r.newVal?'Вкл':'Выкл'));
  await loadCountries();
};

// --- Select country ---
let SELECTED_COUNTRY=null;
function selectCountry(id){
  SELECTED_COUNTRY=id;
  const c=COUNTRIES[id];
  $('info-country').textContent=c.name;
  $('info-owner').textContent=c.owner||'—';
  $('info-econ').textContent=c.economy||0;
  $('info-army').textContent=Object.entries(c.army||{}).filter(([k,v])=>v>0).map(([k,v])=>`${k}:${v}`).join(', ')||'нет';
  $('info-status').textContent=c.status;
}

// --- API wrapper ---
async function apiOp(op,data){
  const res = await fetch(`${API}`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
    body: JSON.stringify({op,...data})
  });
  return await res.json();
}

// --- Init ---
(async()=>{
  await checkSession();
  await loadCountries();
})();
