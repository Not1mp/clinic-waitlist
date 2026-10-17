import { useEffect, useState } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

async function api(url, options = {}) {
  const response = await fetch('/api' + url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Something went wrong.');
  return data;
}

function AuthScreen({ onLogin }) {
  const [role, setRole] = useState('PATIENT');
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const body = {
      email: form.get('email'),
      password: form.get('password'),
      role
    };
    if (registering) body.name = form.get('name');
    try {
      const result = await api(registering ? '/auth/register' : '/auth/login', {
        method: 'POST', body: JSON.stringify(body)
      });
      onLogin(result.user);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand-mark" aria-hidden="true">+</div>
        <p className="eyebrow">CLINIC WAITLIST</p>
        <h1>{registering ? 'Create patient account' : 'Welcome back'}</h1>
        <p className="muted">Sign in to manage appointments and waitlist requests.</p>
        <div className="role-switch" aria-label="Account type">
          <button type="button" className={role === 'PATIENT' ? 'selected' : ''}
            onClick={() => { setRole('PATIENT'); setRegistering(false); }}>Patient</button>
          <button type="button" className={role === 'STAFF' ? 'selected' : ''}
            onClick={() => { setRole('STAFF'); setRegistering(false); }}>Staff</button>
        </div>
        <form onSubmit={submit} className="stack-form">
          {registering && <label>Full name<input name="name" autoComplete="name" required minLength="2" /></label>}
          <label>Email address<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength="8" /></label>
          {message && <p className="notice error" role="alert">{message}</p>}
          <button className="primary full-width" disabled={busy}>
            {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
          </button>
        </form>
        {role === 'PATIENT' && <p className="switch-auth">
          {registering ? 'Already have an account?' : 'New to the clinic?'}{' '}
          <button type="button" className="text-button" onClick={() => { setRegistering(!registering); setMessage(''); }}>
            {registering ? 'Sign in' : 'Create a patient account'}
          </button>
        </p>}
        {role === 'STAFF' && <p className="small-note">Staff accounts are created by the clinic administrator.</p>}
      </div>
    </main>
  );
}

function PageHeader({ user, onLogout }) {
  return <header className="topbar">
    <a className="brand" href="/"> <span className="brand-mark small">+</span><span>Clinic<span className="brand-light">Care</span></span></a>
    <div className="account-area"><div><strong>{user.name}</strong><span className="role-label">{user.role === 'STAFF' ? 'Staff' : 'Patient'}</span></div>
      <button className="quiet-button" onClick={onLogout}>Sign out</button></div>
  </header>;
}

function Message({ children }) {
  return children ? <p className="notice" role="status" aria-live="polite">{children}</p> : <p className="notice empty-notice" aria-live="polite" />;
}

function StaffDashboard({ user, onLogout }) {
  const [doctors, setDoctors] = useState([]);
  const [slots, setSlots] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    const [doctorRows, slotRows] = await Promise.all([api('/doctors'), api('/slots')]);
    setDoctors(doctorRows);
    setSlots(slotRows);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function addDoctor(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await api('/doctors', { method: 'POST', body: JSON.stringify({ name: form.get('name'), specialty: form.get('specialty') }) });
      if (!result.ok) throw new Error(result.message);
      formElement.reset();
      setMessage('Doctor added.'); setError(''); await refresh();
    } catch (e) { setError(e.message); }
  }
  async function deleteDoctor(id) {
  if (!window.confirm('Delete this doctor and all their open slots?')) return;
  try {
    const result = await api('/doctors/' + id, { method: 'DELETE' });
    if (!result.ok) throw new Error(result.message);
    setMessage(result.message); setError(''); await refresh();
  } catch (e) { setError(e.message); }
  }

  async function addSlot(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const dateTime = form.get('date') + ' ' + form.get('time') + ':00';
    try {
      const result = await api('/slots', { method: 'POST', body: JSON.stringify({ doctorId: Number(form.get('doctorId')), dateTime }) });
      if (!result.ok) throw new Error(result.message);
      formElement.reset();
      setMessage('Appointment slot added.'); setError(''); await refresh();
    } catch (e) { setError(e.message); }
  }

  return <><PageHeader user={user} onLogout={onLogout} /><main className="page-shell">
    <div className="page-intro"><p className="eyebrow">STAFF WORKSPACE</p><h1>Clinic schedule</h1><p className="muted">Add doctors and publish appointment times for patients.</p></div>
    <Message>{message || error}</Message>
    <div className="two-column">
      <section className="panel"><div className="panel-heading"><span className="step-dot">1</span><div><h2>Add a doctor</h2><p>Start by adding a doctor and their specialty.</p></div></div>
        <form className="stack-form" onSubmit={addDoctor}>
          <label>Doctor name<input name="name" placeholder="e.g. Dr. Maya Rao" required /></label>
          <label>Specialty<input name="specialty" placeholder="e.g. General medicine" required /></label>
          <button className="primary">Add doctor</button>
        </form>
        <div className="subsection"><h3>Doctors ({doctors.length})</h3>{doctors.length ? <ul className="clean-list">{doctors.map((d) => <li key={d.id}><span className="avatar">{d.name.charAt(0)}</span><span><strong>{d.name}</strong><small>{d.specialty}</small></span></li>)}</ul> : <p className="muted">No doctors added yet.</p>}</div>
      </section>
      <section className="panel"><div className="panel-heading"><span className="step-dot">2</span><div><h2>Add an appointment slot</h2><p>Choose the doctor, date, and start time.</p></div></div>
        <form className="stack-form" onSubmit={addSlot}>
          <label>Doctor<select name="doctorId" required disabled={!doctors.length}><option value="">{doctors.length ? 'Choose a doctor' : 'Add a doctor first'}</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.specialty}</option>)}</select></label>
          <div className="form-row"><label>Appointment date<input name="date" type="date" required /></label><label>Start time<input name="time" type="time" required /></label></div>
          <p className="help-text">Patients will see this slot as available to book.</p>
          <button className="primary" disabled={!doctors.length}>Add appointment slot</button>
        </form>
      </section>
    </div>
    <section className="panel"><div className="section-title"><div><p className="eyebrow">AVAILABILITY</p><h2>Open appointment slots</h2></div><span className="count-pill">{slots.length} open</span></div>
      {slots.length ? <div className="table-wrap"><table><thead><tr><th>Doctor ID</th><th>Date and time</th><th>Status</th></tr></thead><tbody>{slots.map((slot) => <tr key={slot.id}><td>#{slot.doctor_id}</td><td>{slot.date_time}</td><td><span className="status">Open</span></td></tr>)}</tbody></table></div> : <p className="empty-state">No open slots yet. Add a slot above to get started.</p>}
    </section>
  </main></>;
}

function PatientDashboard({ user, onLogout }) {
  const [doctors, setDoctors] = useState([]);
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [offers, setOffers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    const [doctorRows, slotRows, bookingRows, waitRows, offerRows] = await Promise.all([
      api('/doctors'), api('/slots'), api('/my-bookings'), api('/my-waitlist'), api('/offers')
    ]);
    setDoctors(doctorRows); setSlots(slotRows); setBookings(bookingRows); setWaitlist(waitRows); setOffers(offerRows);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function action(work, successText) {
    try { const result = await work(); setMessage(result.message || successText); setError(''); await refresh(); }
    catch (e) { setError(e.message); }
  }

  async function joinWaitlist(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const days = form.getAll('day');
    if (!days.length) { setError('Choose at least one day.'); return; }
    const range = String(form.get('timeRange')).split('-');
    const doctor = form.get('doctorId');
    try {
      const result = await api('/waitlist', { method: 'POST', body: JSON.stringify({
        doctorId: doctor ? Number(doctor) : null, days: days.join(','),
        startHour: Number(range[0]), endHour: Number(range[1]),
        mode: form.get('mode'), endDate: form.get('endDate')
      }) });
      if (!result.ok) throw new Error(result.message || 'Could not join the waitlist.');
      formElement.reset(); setMessage('You joined the waitlist.'); setError(''); await refresh();
    } catch (e) { setError(e.message); }
  }

  return <><PageHeader user={user} onLogout={onLogout} /><main className="page-shell">
    <div className="page-intro"><p className="eyebrow">PATIENT PORTAL</p><h1>Hello, {user.name}</h1><p className="muted">Find an appointment or let us know when you are available.</p></div>
    <Message>{message || error}</Message>
    <section className="panel"><div className="section-title"><div><p className="eyebrow">BOOK DIRECTLY</p><h2>Available appointments</h2></div><span className="count-pill">{slots.length} available</span></div>
      {slots.length ? <div className="slot-grid">{slots.map((slot) => <article className="slot-card" key={slot.id}><span className="slot-icon">◷</span><div><strong>{doctors.find((d) => String(d.id) === String(slot.doctor_id))?.name || 'Doctor'}</strong><p>{slot.date_time}</p></div><button className="primary small-button" onClick={() => action(() => api('/book', { method: 'POST', body: JSON.stringify({ slotId: slot.id }) }), 'Slot booked.')}>Book</button></article>)}</div> : <p className="empty-state">There are no open appointments right now.</p>}
    </section>
    <div className="two-column patient-columns">
      <section className="panel"><div className="panel-heading"><span className="step-dot">+</span><div><h2>Join the waitlist</h2><p>Set your preferences for an earlier opening.</p></div></div>
        <form className="stack-form" onSubmit={joinWaitlist}>
          <label>Preferred doctor<select name="doctorId"><option value="">Any doctor</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <fieldset><legend>Days you can come</legend><div className="choice-grid">{DAYS.map((day) => <label className="check-choice" key={day}><input type="checkbox" name="day" value={day} />{day}</label>)}</div></fieldset>
          <label>Preferred time<select name="timeRange"><option value="9-12">Morning · 9 AM–12 PM</option><option value="12-17">Afternoon · 12–5 PM</option><option value="17-20">Evening · 5–8 PM</option><option value="0-24">Any time</option></select></label>
          <fieldset><legend>If a slot opens</legend><label className="radio-choice"><input type="radio" name="mode" value="ASK_FIRST" defaultChecked />Ask me first</label><label className="radio-choice"><input type="radio" name="mode" value="AUTO_BOOK" />Book it automatically</label></fieldset>
          <label>Keep request active until<input name="endDate" type="date" required /></label>
          <button className="primary">Join waitlist</button>
        </form>
      </section>
      <div className="stack-panels">
        <section className="panel"><div className="section-title"><div><p className="eyebrow">YOUR SCHEDULE</p><h2>My appointments</h2></div><span className="count-pill">{bookings.length}</span></div>
          {bookings.length ? <ul className="clean-list">{bookings.map((b) => <li key={b.slot_id}><span><strong>{b.doctor_name}</strong><small>{b.date_time}</small></span><button className="danger-button" onClick={() => action(() => api('/cancel', { method: 'POST', body: JSON.stringify({ slotId: b.slot_id }) }), 'Appointment cancelled.')}>Cancel</button></li>)}</ul> : <p className="muted">No appointments booked yet.</p>}
        </section>
        <section className="panel"><div className="section-title"><div><p className="eyebrow">EARLIER OPENING</p><h2>My offers</h2></div><span className="count-pill">{offers.length}</span></div>
          {offers.length ? <ul className="clean-list">{offers.map((o) => <li key={o.offer_id}><span><strong>{o.doctor_name}</strong><small>{o.date_time} · respond by {o.expires_at}</small></span><div className="button-pair"><button className="primary small-button" onClick={() => action(() => api('/offers/' + o.offer_id + '/accept', { method: 'POST', body: '{}' }), 'Offer accepted.')}>Accept</button><button className="quiet-button" onClick={() => action(() => api('/offers/' + o.offer_id + '/decline', { method: 'POST', body: '{}' }), 'Offer declined.')}>Decline</button></div></li>)}</ul> : <p className="muted">No pending offers.</p>}
        </section>
        <section className="panel"><div className="section-title"><div><p className="eyebrow">YOUR REQUESTS</p><h2>Waitlist</h2></div><span className="count-pill">{waitlist.length}</span></div>
          {waitlist.length ? <ul className="clean-list">{waitlist.map((w) => <li key={w.id}><span><strong>{w.doctor_name || 'Any doctor'}</strong><small>{w.days} · {w.start_hour}:00–{w.end_hour}:00 · until {w.end_date}</small></span><button className="quiet-button" onClick={() => action(() => api('/waitlist/' + w.id, { method: 'DELETE' }), 'Removed from waitlist.')}>Leave</button></li>)}</ul> : <p className="muted">You have no active waitlist requests.</p>}
        </section>
      </div>
    </div>
  </main></>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/auth/me').then((data) => setUser(data.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api('/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
    setUser(null);
  }

  if (loading) return <main className="loading-screen"><div className="spinner" /><p>Loading clinic portal…</p></main>;
  if (!user) return <AuthScreen onLogin={setUser} />;
  return user.role === 'STAFF'
    ? <StaffDashboard user={user} onLogout={logout} />
    : <PatientDashboard user={user} onLogout={logout} />;
}
