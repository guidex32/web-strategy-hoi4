const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token')||'';
let USER = null;
let COUNTRIES = [];
let ECONOMY_ON = true;

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

async function apiPost(data){
  try{
    const res = await fetch(`${API}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body: JSON.stringify(data)
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

// --- UI и Авторизация ---
window.addEventListener('DOMContentLoaded',()=>{

  const btnLogin = $('btn-login');
  const btnLogout = $('btn-logout');
  const btnRegister = $('btn-register');
  const btnSignin = $('btn-signin');
  const dlgAuth = $('dlg-auth');
  const dlgPrompt = $('dlg-prompt');
  const promptInput = $('prompt-input');
  const promptTitle = $('prompt-title');
  const promptOk = $('prompt-ok');
  const dlgLogs = $('dlg-logs');
  const logsView = $('logs-view');

  if(btnLogin&&dlgAuth) btnLogin.onclick = ()=>dlgAuth.showModal();
  if(btnLogout) btnLogout.onclick = async ()=>{ TOKEN=''; USER=null; localStorage.removeItem('token'); await checkSession(); };
  
  if(btnRegister){
    btnRegister.addEventListener('click', async e=>{
      e.preventDefault();
      const login = $('auth-username').value.trim();
      const pass = $('auth-password').value.trim();
      if(!login||!pass) return alert('Введите логин и пароль');
      const r = await apiAuth('register',{login,password:pass});
      if(r.ok){ TOKEN=r.token; USER=r.user; localStorage.setItem('token',TOKEN); dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message);
    });
  }

  if(btnSignin){
    btnSignin.addEventListener('click', async e=>{
      e.preventDefault();
      const login = $('auth-username').value.trim();
      const pass = $('auth-password').value.trim();
      if(!login||!pass) return alert('Введите логин и пароль');
      const r = await apiAuth('login',{login,password:pass});
      if(r.ok){ TOKEN=r.token; USER=r.user; localStorage.setItem('token',TOKEN); dlgAuth.close(); await checkSession(); await loadCountries(); }
      else alert(r.message);
    });
  }

  // --- Admin кнопки ---
  document.querySelectorAll('[data-admin]').forEach(btn=>{
    btn.onclick = async ()=>{
      const op = btn.getAttribute('data-admin');

      // Создать страну
      if(op==='create-country'){
        promptTitle.textContent = 'Название страны (без цифр, до 256 символов)';
        promptInput.value = '';
        dlgPrompt.showModal();
        promptOk.onclick = async ()=>{
          let name = promptInput.value.trim();
          if(!name || name.length>256 || /[0-9]/.test(name)) return alert('Неправильное название!');
          let flag = prompt('Введите название флага (из папки flags)'); 
          if(!flag) return alert('Флаг обязателен');
          alert('Кликните по карте для размещения страны');
          const mapObj = document.getElementById('map');
          function clickMap(e){
            const rect = mapObj.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            apiPost({op:'create_country',name,flag,x,y}).then(r=>{
              if(r.ok) alert('Страна создана!');
              else alert(r.message);
            });
            mapObj.removeEventListener('click',clickMap);
            dlgPrompt.close();
          }
          mapObj.addEventListener('click',clickMap);
        }
      }

      // Назначить владельца
      if(op==='assign-owner'){
        promptTitle.textContent = 'ID страны';
        promptInput.value = '';
        dlgPrompt.showModal();
        promptOk.onclick = async ()=>{
          const countryId = promptInput.value.trim();
          if(!countryId) return alert('Введите ID страны');
          let login = prompt('Введите логин нового владельца');
          if(!login) return alert('Введите логин');
          const r = await apiPost({op:'assign_owner',countryId,login});
          if(r.ok) alert('Владелец назначен!');
          else alert(r.message);
          dlgPrompt.close();
        }
      }

      // Экономика
      if(op==='toggle-economy'){
        const r = await apiPost({op:'toggle_economy'});
        if(r.ok){ ECONOMY_ON = r.value; alert('Экономика '+(ECONOMY_ON?'ВКЛ':'ВЫКЛ')); }
        else alert(r.message);
      }

      // Логи
      if(op==='view-logs'){
        const r = await apiPost({op:'view_logs'});
        if(r.ok){
          logsView.textContent = r.logs.map(l=>`[${l.timestamp}] ${l.message}`).join('\n');
          dlgLogs.showModal();
        } else alert(r.message);
      }

    }
  });

  checkSession();
});
