const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token')||'';
let USER = null;
let COUNTRIES = [];

const $ = id=>document.getElementById(id);
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

async function apiAuth(op,data){
  try{
    const res = await fetch(`${API}/auth`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':TOKEN?'Bearer '+TOKEN:''},
      body: JSON.stringify({op,...data})
    });
    return await res.json();
  }catch(e){ return {ok:false,message:e.message}; }
}

async function checkSession(){
  if(!TOKEN){ USER=null; hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel')); return false; }
  const r = await apiAuth('session',{}); 
  if(r.user){
    USER = r.user;
    const info = $('user-info'); if(info) info.textContent = `${USER.login} (${USER.role})`;
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if(USER.role==='admin'||USER.role==='owner') show($('admin-panel')); else hide($('admin-panel'));
    return true;
  }else{ USER=null; TOKEN=''; localStorage.removeItem('token'); hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel')); return false; }
}

async function loadCountries(){
  if(!TOKEN) return;
  try{
    const res = await fetch(`${API}/countries`,{headers:{'Authorization':'Bearer '+TOKEN}});
    const data = await res.json();
    COUNTRIES = Object.values(data);
    console.log('Countries loaded:',COUNTRIES);
  }catch(e){ console.error(e); }
}

function promptAsync(message){
  return new Promise(resolve=>{
    const input = $('prompt-input');
    const dlg = $('dlg-prompt');
    const title = $('prompt-title');
    title.textContent = message;
    input.value='';
    dlg.showModal();
    const ok = $('prompt-ok');

    const handler = (ev)=>{ 
      ev.preventDefault();
      dlg.close(); 
      ok.removeEventListener('click',handler); 
      resolve(input.value.trim());
    };
    ok.addEventListener('click',handler);
  });
}

async function createCountryFlow(){
  const availableFlags = ['flag_chern','flag_blue','flag_red'];

  const name = await promptAsync("Введите название страны (только буквы, максимум 256)");
  if(!name.match(/^[a-zA-Zа-яА-Я\s]{1,256}$/)) return alert("Некорректное название!");

  const flag = await promptAsync("Введите название флага (доступные: " + availableFlags.join(', ') + ")\nТолько имя, без .png/.jpg");
  if(!availableFlags.includes(flag)) return alert("Такого флага нет!");

  alert("Теперь кликните по карте для установки позиции страны");
  const map = $('map');
  return new Promise(resolve=>{
    const handler = async (e)=>{
      const rect = map.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      map.removeEventListener('click',handler);

      try{
        const res = await fetch(`${API}`,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
          body:JSON.stringify({op:'create_country',name,flag,x,y})
        });
        const data = await res.json();
        console.log('Create country response:', data);
        if(data.ok){ 
          alert("Страна создана!"); 
          await loadCountries(); 
        }
        else alert("Ошибка: "+data.message);
      }catch(e){ alert("Ошибка: "+e.message); }
      resolve();
    };
    map.addEventListener('click',handler);
  });
}

async function assignOwnerFlow(){
  const id = await promptAsync("Введите ID страны");
  if(!id) return;
  const login = await promptAsync("Введите логин нового владельца");
  if(!login) return;

  try{
    const res = await fetch(`${API}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body:JSON.stringify({op:'assign_owner',countryId:id,login})
    });
    const data = await res.json();
    if(data.ok) alert("Владелец назначен!"); else alert("Ошибка: "+data.message);
  }catch(e){ alert("Ошибка: "+e.message); }
}

async function toggleEconomyFlow(){
  try{
    const res = await fetch(`${API}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body:JSON.stringify({op:'toggle_economy'})
    });
    const data = await res.json();
    if(data.ok) alert("Экономика теперь: "+(data.value?'Включена':'Выключена')); 
    else alert("Ошибка: "+data.message);
  }catch(e){ alert("Ошибка: "+e.message); }
}

async function givePointsFlow(){
  const id = await promptAsync("Введите ID страны");
  const amount = await promptAsync("Введите количество очков");
  if(isNaN(amount)) return alert("Только число!");
  try{
    const res = await fetch(`${API}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body:JSON.stringify({op:'give_points',countryId:id,amount})
    });
    const data = await res.json();
    if(data.ok) alert("Очки выданы!"); else alert("Ошибка: "+data.message);
  }catch(e){ alert("Ошибка: "+e.message); }
}

async function viewLogsFlow(){
  try{
    const res = await fetch(`${API}/logs`,{headers:{'Authorization':'Bearer '+TOKEN}});
    const data = await res.json();
    console.log('Logs from server:', data);
    if(Array.isArray(data) && data.length){
      $('logs-view').textContent = data.map(l=>`${l.timestamp} ${l.user} ${l.action}`).join('\n');
    } else {
      $('logs-view').textContent = "Логи пусты";
    }
    $('dlg-logs').showModal();
  }catch(e){ alert("Ошибка: "+e.message); }
}

// --- Events ---
$('btn-login').addEventListener('click',async()=>{
  const login = prompt('Логин:'); 
  const pass = prompt('Пароль:'); 
  if(!login||!pass) return;
  const r = await apiAuth('login',{login,password:pass});
  if(r.ok){ TOKEN = r.token; localStorage.setItem('token',TOKEN); await checkSession(); alert("Успешно!"); }
  else alert(r.message);
});

$('btn-logout').addEventListener('click',async()=>{
  TOKEN=''; USER=null; localStorage.removeItem('token'); hide($('user-info')); hide($('btn-logout')); show($('btn-login')); hide($('admin-panel'));
});

$('btn-create-country').addEventListener('click',createCountryFlow);
$('btn-assign-owner').addEventListener('click',assignOwnerFlow);
$('btn-toggle-economy').addEventListener('click',toggleEconomyFlow);
$('btn-give-points').addEventListener('click',givePointsFlow);
$('btn-view-logs').addEventListener('click',viewLogsFlow);

// --- Init ---
checkSession().then(loadCountries);
