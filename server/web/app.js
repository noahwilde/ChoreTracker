const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000`;

const PIN_LAYOUT = [
  [ [0,1], [0,0], [1,1], [1,0], [2,1], [2,0] ],
  [ [0,3], [0,2], [1,3], [1,2], [2,3], [2,2] ],
  [ [0,5], [0,4], [1,5], [1,4], [2,5], [2,4] ],
];

const PIN_LABELS = [
  '1','2','3','4','5','6',
  '7','8','9','10','11','12',
  '13','14','15','16','17','18'
];
const scheduleMap = {};

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  const dark = document.body.classList.contains('dark');
  btn.textContent = dark ? '☀' : '☾';
}

function initTheme() {
  const stored = localStorage.getItem('theme');
  const preferDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const useDark = stored ? stored === 'dark' : preferDark;
  document.body.classList.toggle('dark', useDark);
  updateThemeIcon();
}

function buildGrid() {
  const grid = document.getElementById('pin-grid');
  PIN_LAYOUT.flat().forEach(([chip, pin], idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = PIN_LABELS[idx];

    btn.dataset.chip = chip;
    btn.dataset.pin = pin;
    btn.addEventListener('click', () => handlePinClick(chip, pin));
    grid.appendChild(btn);
  });
}

function selectPin(chip, pin) {
  document.getElementById('chip').value = chip;
  document.getElementById('pin').value = pin;
  document.querySelectorAll('#pin-grid button').forEach(b => b.classList.remove('selected'));
  const btn = document.querySelector(`#pin-grid button[data-chip="${chip}"][data-pin="${pin}"]`);
  if (btn) btn.classList.add('selected');
}

function handlePinClick(chip, pin) {
  selectPin(chip, pin);
  const sched = scheduleMap[`${chip}-${pin}`];
  if (sched) {
    populateForm(sched);
  } else {
    document.getElementById('form').reset();
    document.querySelectorAll('.repeat-presets button, .overdue-presets button').forEach(b => b.classList.remove('active'));
    document.getElementById('repeat-advanced').classList.add('hidden');
    selectPin(chip, pin);
    document.getElementById('delete').classList.add('hidden');
  }
}

async function fetchSchedules() {
  const res = await fetch(`${API_BASE}/schedules`);
  const data = await res.json();
  const tbody = document.querySelector('#schedule-list tbody');
  tbody.innerHTML = '';
  Object.keys(scheduleMap).forEach(k => delete scheduleMap[k]);
  document.querySelectorAll('#pin-grid button').forEach(b => b.classList.remove('scheduled'));
  const schedules = data.schedules.slice().reverse();
  schedules.forEach(s => {
    scheduleMap[`${s.chip}-${s.pin}`] = s;
    const tr = document.createElement('tr');
    const due = new Date(s.due).toLocaleString();
    tr.innerHTML = `<td>${s.name}</td><td>${labelFor(s.chip, s.pin)}</td>` +
                   `<td>${due}</td>` +
                   `<td>${formatInterval(s.repeat)}</td><td>${formatInterval(s.overdue)}</td>`;
    tr.addEventListener('click', () => populateForm(s));
    tbody.appendChild(tr);
    const btn = document.querySelector(`#pin-grid button[data-chip="${s.chip}"][data-pin="${s.pin}"]`);
    if (btn) btn.classList.add('scheduled');
  });
}

function labelFor(chip, pin) {
  const idx = PIN_LAYOUT.flat().findIndex(([c,p]) => c === chip && p === pin);
  return PIN_LABELS[idx] || `${chip}/${pin}`;
}

function formatInterval(obj) {
  return Object.entries(obj || {}).map(([k, v]) => `${v} ${k}`).join(' ');
}

function populateForm(s) {
  selectPin(s.chip, s.pin);
  document.getElementById('name').value = s.name || '';
  const dueDate = new Date(s.due);
  dueDate.setMinutes(dueDate.getMinutes() - dueDate.getTimezoneOffset());
  document.getElementById('due').value = dueDate.toISOString().slice(0,16);
  const adv = document.getElementById('repeat-advanced');
  adv.classList.add('hidden');
  document.getElementById('repeat-days').value = s.repeat?.days || '';
  document.getElementById('repeat-hours').value = s.repeat?.hours || '';
  document.querySelectorAll('.repeat-presets button').forEach(b => b.classList.remove('active'));
  if (s.repeat) {
    if ((s.repeat.days === 1 || s.repeat.days === 7) && !s.repeat.hours) {
      const type = s.repeat.days === 1 ? 'daily' : 'weekly';
      const btn = document.querySelector(`.repeat-presets button[data-repeat="${type}"]`);
      if (btn) btn.classList.add('active');
    } else {
      adv.classList.remove('hidden');
    }
  }
  document.getElementById('overdue-days').value = s.overdue?.days || '';
  document.getElementById('overdue-hours').value = s.overdue?.hours || '';
  document.querySelectorAll('.overdue-presets button').forEach(b => b.classList.remove('active'));
  if (s.overdue) {
    if (s.overdue.days === 1 && !s.overdue.hours) {
      const btn = document.querySelector('.overdue-presets button[data-overdue="1d"]');
      if (btn) btn.classList.add('active');
    } else if (s.overdue.days === 3 && !s.overdue.hours) {
      const btn = document.querySelector('.overdue-presets button[data-overdue="3d"]');
      if (btn) btn.classList.add('active');
    }
  }
  document.getElementById('delete').classList.remove('hidden');
}

function applyDuePreset(type) {
  const input = document.getElementById('due');
  const now = new Date();
  let target = new Date(now);
  switch(type) {
    case 'morning':
      target.setHours(8,0,0,0);
      if (target <= now) target.setDate(target.getDate()+1);
      break;
    case 'evening':
      target.setHours(18,0,0,0);
      if (target <= now) target.setDate(target.getDate()+1);
      break;
    case 'plus1d':
      target = new Date(now.getTime() + 24*60*60*1000);
      break;
    case 'plus3d':
      target = new Date(now.getTime() + 3*24*60*60*1000);
      break;
    case 'nextweek':
      target = new Date(now.getTime() + 7*24*60*60*1000);
      break;
    default:
      return;
  }
  target.setMinutes(target.getMinutes() - target.getTimezoneOffset());
  input.value = target.toISOString().slice(0,16);
}

function toggleRepeatPreset(btn) {
  const type = btn.dataset.repeat;
  const active = btn.classList.contains('active');
  document.querySelectorAll('.repeat-presets button[data-repeat]').forEach(b => b.classList.remove('active'));
  const adv = document.getElementById('repeat-advanced');
  adv.classList.add('hidden');
  document.getElementById('repeat-days').value = '';
  document.getElementById('repeat-hours').value = '';
  if (!active) {
    btn.classList.add('active');
    if (type === 'daily') document.getElementById('repeat-days').value = 1;
    if (type === 'weekly') document.getElementById('repeat-days').value = 7;
  }
}

function toggleOverduePreset(btn) {
  const type = btn.dataset.overdue;
  const active = btn.classList.contains('active');
  document.querySelectorAll('.overdue-presets button').forEach(b => b.classList.remove('active'));
  document.getElementById('overdue-days').value = '';
  document.getElementById('overdue-hours').value = '';
  if (!active) {
    btn.classList.add('active');
    if (type === '1d') document.getElementById('overdue-days').value = 1;
    if (type === '3d') document.getElementById('overdue-days').value = 3;
  }
}

async function submitForm(e) {
  e.preventDefault();
  const payload = {
    chip: parseInt(document.getElementById('chip').value, 10),
    pin: parseInt(document.getElementById('pin').value, 10),
    name: document.getElementById('name').value,
    due: new Date(document.getElementById('due').value).toISOString(),
  };
  const repeatDays = document.getElementById('repeat-days').value;
  const repeatHours = document.getElementById('repeat-hours').value;
  const overdueDays = document.getElementById('overdue-days').value;
  const overdueHours = document.getElementById('overdue-hours').value;
  const repeat = {};
  if (repeatDays) repeat.days = parseInt(repeatDays, 10);
  if (repeatHours) repeat.hours = parseInt(repeatHours, 10);
  if (Object.keys(repeat).length) payload.repeat = repeat;
  const overdue = {};
  if (overdueDays) overdue.days = parseInt(overdueDays, 10);
  if (overdueHours) overdue.hours = parseInt(overdueHours, 10);
  if (Object.keys(overdue).length) payload.overdue = overdue;
  await fetch(`${API_BASE}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  e.target.reset();
  document.querySelectorAll('.repeat-presets button, .overdue-presets button').forEach(b => b.classList.remove('active'));
  document.getElementById('repeat-advanced').classList.add('hidden');
  fetchSchedules();
}

async function deleteSchedule() {
  const chip = parseInt(document.getElementById('chip').value, 10);
  const pin = parseInt(document.getElementById('pin').value, 10);
  await fetch(`${API_BASE}/schedule/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chip, pin })
  });
  document.getElementById('form').reset();
  document.querySelectorAll('.repeat-presets button, .overdue-presets button').forEach(b => b.classList.remove('active'));
  document.getElementById('repeat-advanced').classList.add('hidden');
  fetchSchedules();
}

initTheme();
buildGrid();
fetchSchedules();
document.getElementById('form').addEventListener('submit', submitForm);
document.getElementById('delete').addEventListener('click', deleteSchedule);
document.getElementById('show-advanced').addEventListener('click', () => {
  document.getElementById('repeat-advanced').classList.remove('hidden');
});
document.getElementById('theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  updateThemeIcon();
});
document.querySelectorAll('.quick-due button').forEach(btn => {
  btn.addEventListener('click', () => applyDuePreset(btn.dataset.due));
});
document.querySelectorAll('.repeat-presets button[data-repeat]').forEach(btn => {
  btn.addEventListener('click', () => toggleRepeatPreset(btn));
});
document.querySelectorAll('.overdue-presets button').forEach(btn => {
  btn.addEventListener('click', () => toggleOverduePreset(btn));
});
