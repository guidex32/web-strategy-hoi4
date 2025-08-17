const API = 'https://web-strategy-hoi4.onrender.com';
let TOKEN = null;
let ROLE = null;

// хелперы
function $(id) { return document.getElementById(id); }
function saveAuth() { localStorage.setItem('auth', JSON.stringify({ TOKEN, ROLE })); }
function loadAuth() {
  try {
    const d = JSON.parse(localStorage.getItem('auth'));
    if (d) { TOKEN = d.TOKEN; ROLE = d.ROLE; }
  } catch {}
}
function logout() {
  TOKEN = null; ROLE = null;
  localStorage.removeItem('auth');
  updateUI();
}
function updateUI() {
  if (TOKEN) {
    $('loginForm').style.display = 'none';
    $('logoutBtn').style.display = 'block';
    if (ROLE === 'admin') $('adminBtn').style.display = 'block';
    else $('adminBtn').style.display = 'none';
  } else {
    $('loginForm').style.display = 'block';
    $('logoutBtn').style.display = 'none';
    $('adminBtn').style.display = 'none';
  }
}

// вход
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const username = $('username').value.trim();
  const password = $('password').value.trim();
  try {
    const res = await fetch(API + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.ok) {
      TOKEN = data.token;
      ROLE = data.role;
      saveAuth();
      updateUI();
      await loadCountries();
    } else alert(data.message);
  } catch (err) { alert('Ошибка входа: ' + err.message); }
});
$('logoutBtn').addEventListener('click', logout);

// список стран
async function loadCountries() {
  if (!TOKEN) return;
  try {
    const res = await fetch(API + '/api/countries', {
      headers: { 'Authorization': 'Bearer ' + TOKEN }
    });
    const countries = await res.json();
    renderCountries(countries);
  } catch (e) { console.error(e); }
}
function renderCountries(countries) {
  const map = $('map');
  map.innerHTML = '';
  countries.forEach(c => {
    const el = document.createElement('div');
    el.className = 'country';
    el.style.left = c.x + 'px';
    el.style.top = c.y + 'px';
    el.innerHTML = `<img src="flags/${c.flag}" alt="" width="24"><span>${c.name}</span>`;
    map.appendChild(el);
  });
}

// диалоги
function promptAsync(msg) {
  return new Promise(resolve => {
    const result = prompt(msg);
    resolve(result);
  });
}

// выбор флага
async function chooseFlag() {
  try {
    const res = await fetch(API + '/api/flags', { headers: { 'Authorization': 'Bearer ' + TOKEN } });
    const files = await res.json();
    if (!Array.isArray(files) || files.length === 0) return null;
    return await promptAsync("Выберите флаг (имя файла):\n" + files.join(', '));
  } catch (e) {
    alert("Ошибка загрузки флагов: " + e.message);
    return null;
  }
}

// создание страны
async function createCountryFlow() {
  const name = await promptAsync("Введите название страны (только буквы, максимум 256)");
  if (!name || !name.match(/^[a-zA-Zа-яА-Я\s]{1,256}$/)) return alert("Некорректное название!");

  const flag = await chooseFlag();
  if (!flag) return alert("Флаг не выбран!");

  alert("Теперь кликните по карте для установки позиции страны");
  const map = $('map');
  return new Promise(resolve => {
    const handler = async e => {
      const rect = map.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      map.removeEventListener('click', handler);

      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
          body: JSON.stringify({ op: 'create_country', name, flag, x, y })
        });
        const data = await res.json();
        if (data.ok) {
          alert("Страна создана!");
          await loadCountries();
        } else alert("Ошибка: " + data.message);
      } catch (e) { alert("Ошибка: " + e.message); }
      resolve();
    };
    map.addEventListener('click', handler);
  });
}

// init
loadAuth();
updateUI();
if (TOKEN) loadCountries();
