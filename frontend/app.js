let user = null;
let role = 'PATIENT';      // tab selected on the sign in page
let registering = false;
let doctors = [];

function $(id) { return document.getElementById(id); }

// makes sure names typed by users are shown as text, not html
function esc(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function show(id, visible) { $(id).classList.toggle('hidden', !visible); }

function say(text, isError) {
  $('message').textContent = text;
  $('message').className = isError ? 'error' : '';
}

// "2026-10-20 09:30:00" -> "2026-10-20 09:30"
function when(text) { return esc(String(text).replace('T', ' ').slice(0, 16)); }

function doctorName(id) {
  const doctor = doctors.find(function (d) { return d.id === id; });
  return doctor ? doctor.name : 'Doctor #' + id;
}

// make a list, or a short message if there is nothing to show
function items(rows, makeHtml, emptyText) {
  if (rows.length === 0) return '<p class="muted">' + emptyText + '</p>';
  return '<ul>' + rows.map(function (r) { return '<li>' + makeHtml(r) + '</li>'; }).join('') + '</ul>';
}

// fill a doctor dropdown but keep what was already chosen
function fillSelect(id, firstText) {
  const select = $(id);
  const old = select.value;
  select.innerHTML = '<option value="">' + firstText + '</option>' + doctors.map(function (d) {
    return '<option value="' + d.id + '">' + esc(d.name) + '</option>';
  }).join('');
  select.value = old;
}

// talk to the server
async function api(url, method, body) {
  const response = await fetch('/api' + url, {
    method: method || 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Something went wrong.');
  return data;
}

// do an action, show the message, then reload the lists
async function act(url, method, body, form) {
  try {
    const result = await api(url, method, body || {});
    say(result.message || 'Done.', !result.ok);
    if (result.ok && form) form.reset();
    await reload();
  } catch (err) {
    say(err.message, true);
  }
}

// ----- sign in, register, sign out -----
function setRole(newRole) { role = newRole; registering = false; drawAuth(); }
function toggleRegister() { registering = !registering; drawAuth(); }

function drawAuth() {
  $('patientTab').className = role === 'PATIENT' ? 'selected' : '';
  $('staffTab').className = role === 'STAFF' ? 'selected' : '';
  $('authTitle').textContent = registering ? 'Create patient account' : 'Sign in';
  $('authButton').textContent = registering ? 'Create account' : 'Sign in';
  $('switchLabel').textContent = registering ? 'Already have an account?' : 'New patient?';
  $('switchButton').textContent = registering ? 'Sign in' : 'Create an account';
  $('nameInput').required = registering;
  show('nameLabel', registering);
  show('switchText', role === 'PATIENT');
  show('staffNote', role === 'STAFF');
  say('');
}

$('authForm').onsubmit = async function (e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = { email: form.get('email'), password: form.get('password'), role: role };
  if (registering) body.name = form.get('name');
  try {
    const result = await api(registering ? '/auth/register' : '/auth/login', 'POST', body);
    user = result.user;
    e.target.reset();
    start();
  } catch (err) {
    say(err.message, true);
  }
};

async function logout() {
  try { await api('/auth/logout', 'POST'); } catch (err) { /* ignore */ }
  user = null;
  start();
}

// show the right page for whoever is signed in
function start() {
  say('');
  show('authPage', !user);
  show('topbar', !!user);
  show('staffPage', !!user && user.role === 'STAFF');
  show('patientPage', !!user && user.role === 'PATIENT');
  if (!user) return drawAuth();
  $('who').textContent = user.name + ' (' + user.role.toLowerCase() + ')';
  $('hello').textContent = 'Hello, ' + user.name;
  reload();
}

async function reload() {
  try {
    if (user.role === 'STAFF') await loadStaff();
    else await loadPatient();
  } catch (err) {
    say(err.message, true);
  }
}

// ----- staff -----
async function loadStaff() {
  doctors = await api('/doctors');
  const slots = await api('/slots');

  $('doctorList').innerHTML = items(doctors, function (d) {
    return '<span><strong>' + esc(d.name) + '</strong><br><small>' + esc(d.specialty) + '</small></span>' +
      '<button class="danger" onclick="deleteDoctor(' + d.id + ')">Delete</button>';
  }, 'No doctors added yet.');

  fillSelect('doctorSelect', 'Choose a doctor');

  $('staffSlots').innerHTML = items(slots, function (s) {
    return '<span>' + esc(doctorName(s.doctor_id)) + '</span><span>' + when(s.date_time) + '</span>';
  }, 'No open slots yet. Add one above.');
}

$('doctorForm').onsubmit = function (e) {
  e.preventDefault();
  const form = new FormData(e.target);
  act('/doctors', 'POST', { name: form.get('name'), specialty: form.get('specialty') }, e.target);
};

$('slotForm').onsubmit = function (e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const dateTime = form.get('date') + ' ' + form.get('time') + ':00';
  act('/slots', 'POST', { doctorId: Number(form.get('doctorId')), dateTime: dateTime }, e.target);
};

function deleteDoctor(id) {
  if (confirm('Delete this doctor and all their open slots?')) act('/doctors/' + id, 'DELETE');
}

// ----- patient -----
async function loadPatient() {
  const [doctorRows, slots, bookings, waitlist, offers] = await Promise.all([
    api('/doctors'), api('/slots'), api('/my-bookings'), api('/my-waitlist'), api('/offers')
  ]);
  doctors = doctorRows;
  fillSelect('waitDoctor', 'Any doctor');

  $('slotList').innerHTML = items(slots, function (s) {
    return '<span><strong>' + esc(doctorName(s.doctor_id)) + '</strong><br><small>' + when(s.date_time) + '</small></span>' +
      '<button class="primary" onclick="act(\'/book\', \'POST\', { slotId: ' + s.id + ' })">Book</button>';
  }, 'There are no open appointments right now.');

  $('bookingList').innerHTML = items(bookings, function (b) {
    return '<span><strong>' + esc(b.doctor_name) + '</strong><br><small>' + when(b.date_time) + '</small></span>' +
      '<button class="danger" onclick="act(\'/cancel\', \'POST\', { slotId: ' + b.slot_id + ' })">Cancel</button>';
  }, 'No appointments booked yet.');

  $('offerList').innerHTML = items(offers, function (o) {
    return '<span><strong>' + esc(o.doctor_name) + '</strong><br><small>' + when(o.date_time) +
      ', answer by ' + new Date(o.expires_at).toLocaleString() + '</small></span>' +
      '<span class="buttons">' +
      '<button class="primary" onclick="act(\'/offers/' + o.offer_id + '/accept\', \'POST\')">Accept</button>' +
      '<button onclick="act(\'/offers/' + o.offer_id + '/decline\', \'POST\')">Decline</button></span>';
  }, 'No pending offers.');

  $('waitList').innerHTML = items(waitlist, function (w) {
    return '<span><strong>' + esc(w.doctor_name || 'Any doctor') + '</strong><br><small>' +
      esc(w.days.split(',').join(', ')) + ' from ' + w.start_hour + ':00 to ' + w.end_hour + ':00, until ' +
      esc(String(w.end_date).slice(0, 10)) + '</small></span>' +
      '<button onclick="act(\'/waitlist/' + w.id + '\', \'DELETE\')">Leave</button>';
  }, 'You have no active waitlist requests.');
}

$('waitForm').onsubmit = function (e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const days = form.getAll('day');
  if (days.length === 0) return say('Choose at least one day.', true);
  const range = form.get('timeRange').split('-');
  const doctor = form.get('doctorId');
  act('/waitlist', 'POST', {
    doctorId: doctor ? Number(doctor) : null,
    days: days.join(','),
    startHour: Number(range[0]),
    endHour: Number(range[1]),
    mode: form.get('mode'),
    endDate: form.get('endDate')
  }, e.target);
};

// Do not let the waitlist end date be earlier than the user's local date.
const localToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60 * 1000)
  .toISOString().slice(0, 10);
$('waitForm').elements.endDate.min = localToday;

// ----- first thing when the page opens: am I already signed in? -----
api('/auth/me')
  .then(function (data) { user = data.user; })
  .catch(function () { user = null; })
  .then(start);
