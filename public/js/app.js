const API = 'https://web-strategy-hoi4.onrender.com/api';
let TOKEN = localStorage.getItem('token') || '';
let USER = null;
let COUNTRIES = [];

const $ = id => document.getElementById(id);
const dlgAuth = $('dlg-auth');
const dlgLogs = $('dlg-logs');

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

// --- Auth ---
async function apiAuth(op, data) {
  try {
    const res = await fetch(`${API}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': TOKEN ? 'Bearer ' + TOKEN : ''
      },
      body: JSON.stringify({ op, ...data })
    });
    return await res.json();
  } catch (e) {
    console.error('Ошибка fetch /api/auth:', e);
    alert('Ошибка связи с сервером');
    return { ok: false, message: e.message };
  }
}

async function checkSession() {
  if (!TOKEN) {
    USER = null;
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
    return false;
  }
  const r = await apiAuth('session', {});
  if (r.ok && r.user) {
    USER = r.user;
    $('user-info').textContent = USER.login + ' (' + USER.role + ')';
    show($('user-info')); show($('btn-logout')); hide($('btn-login'));
    if (['admin', 'owner'].includes(USER.role)) show($('admin-panel'));
    else hide($('admin-panel'));
    return true;
  } else {
    TOKEN = ''; USER = null;
    localStorage.removeItem('token');
    hide($('user-info')); hide($('btn-logout')); show($('btn-login'));
    hide($('admin-panel'));
    return false;
  }
}

// --- Login/Register ---
$('btn-login').onclick = () => dlgAuth.showModal();
$('btn-logout').onclick = async () => {
  TOKEN = ''; USER = null; localStorage.removeItem('token');
  await checkSession();
};

$('btn-register').onclick = async () => {
  const login = $('reg-login').value.trim();
  const password = $('reg-password').value.trim();
  if (!login || !password) return alert('Введите логин и пароль');
  const r = await apiAuth('register', { login, password });
  if (r.ok) {
    TOKEN = r.token; USER = r.user;
    localStorage.setItem('token', TOKEN);
    await checkSession(); dlgAuth.close();
  } else alert(r.message);
};

$('btn-login-do').onclick = async () => {
  const login = $('login-login').value.trim();
  const password = $('login-password').value.trim();
  if (!login || !password) return alert('Введите логин и пароль');
  const r = await apiAuth('login', { login, password });
  if (r.ok) {
    TOKEN = r.token; USER = r.user;
    localStorage.setItem('token', TOKEN);
    await checkSession(); dlgAuth.close();
  } else alert(r.message);
};

// --- Init ---
window.onload = async () => {
  await checkSession();
};
