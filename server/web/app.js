const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000`;

function fillSelect(select, max) {
  for (let i = 0; i < max; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    select.appendChild(opt);
  }
}

async function fetchSchedules() {
  const res = await fetch(`${API_BASE}/schedules`);
  const data = await res.json();
  const tbody = document.querySelector('#schedule-list tbody');
  tbody.innerHTML = '';
  const schedules = data.schedules.slice().reverse();
  schedules.forEach(s => {
    const tr = document.createElement('tr');
    const due = new Date(s.due).toLocaleString();
    tr.innerHTML = `<td>${s.name}</td><td>${s.chip}</td><td>${s.pin}</td>` +
                   `<td>${due}</td>` +
                   `<td>${formatInterval(s.repeat)}</td><td>${formatInterval(s.overdue)}</td>`;
    tr.addEventListener('click', () => populateForm(s));
    tbody.appendChild(tr);
  });
}

function formatInterval(obj) {
  return Object.entries(obj || {}).map(([k, v]) => `${v} ${k}`).join(' ');
}

function populateForm(s) {
  document.getElementById('chip').value = s.chip;
  document.getElementById('pin').value = s.pin;
  document.getElementById('name').value = s.name || '';
  const dueDate = new Date(s.due);
  dueDate.setMinutes(dueDate.getMinutes() - dueDate.getTimezoneOffset());
  document.getElementById('due').value = dueDate.toISOString().slice(0,16);
  document.getElementById('repeat-days').value = s.repeat?.days || '';
  document.getElementById('repeat-hours').value = s.repeat?.hours || '';
  document.getElementById('overdue-days').value = s.overdue?.days || '';
  document.getElementById('overdue-hours').value = s.overdue?.hours || '';
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
  fetchSchedules();
}

fillSelect(document.getElementById('chip'), 3);
fillSelect(document.getElementById('pin'), 6);
fetchSchedules();
document.getElementById('form').addEventListener('submit', submitForm);
