const db = require('./database');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// run a query and give back the rows
// (for INSERT / UPDATE this gives back insertId / affectedRows)
async function query(sql, values = []) {
  const [rows] = await db.execute(sql, values);
  return rows;
}

// turns "2026-10-20 09:30:00" into a Date
function toDate(dateTimeText) {
  return new Date(dateTimeText.replace(' ', 'T'));
}

// ---------- read data ----------

function getDoctors() {
  return query('SELECT id, name, specialty FROM doctors ORDER BY id');
}

function getOpenSlots(doctorId) {
  let sql = "SELECT id, doctor_id, date_time, status, patient_id FROM slots WHERE status = 'OPEN'";
  const values = [];

  if (doctorId) {
    sql += ' AND doctor_id = ?';
    values.push(doctorId);
  }

  return query(sql + ' ORDER BY date_time', values);
}

function getMyBookings(patientId) {
  return query(
    `SELECT slots.id AS slot_id, slots.date_time, doctors.name AS doctor_name
     FROM slots
     JOIN doctors ON slots.doctor_id = doctors.id
     WHERE slots.patient_id = ? AND slots.status = 'BOOKED'
     ORDER BY slots.date_time`,
    [patientId]
  );
}

function getMyWaitlist(patientId) {
  return query(
    `SELECT waitlist.id, waitlist.days, waitlist.start_hour, waitlist.end_hour,
            waitlist.mode, waitlist.end_date, doctors.name AS doctor_name
     FROM waitlist
     LEFT JOIN doctors ON waitlist.doctor_id = doctors.id
     WHERE waitlist.patient_id = ? AND waitlist.status = 'ACTIVE'
     ORDER BY waitlist.joined_at, waitlist.id`,
    [patientId]
  );
}

function getOffersForPatient(patientId) {
  return query(
    `SELECT offers.id AS offer_id, offers.expires_at,
            slots.date_time, doctors.name AS doctor_name
     FROM offers
     JOIN waitlist ON offers.waitlist_id = waitlist.id
     JOIN slots ON offers.slot_id = slots.id
     JOIN doctors ON slots.doctor_id = doctors.id
     WHERE waitlist.patient_id = ? AND offers.status = 'PENDING'
     ORDER BY offers.expires_at`,
    [patientId]
  );
}

// ---------- staff: add doctors and slots ----------

async function addDoctor(name, specialty) {
  name = String(name || '').trim();
  specialty = String(specialty || '').trim();

  if (name === '' || specialty === '') {
    return { ok: false, message: 'Enter both a doctor name and specialty.' };
  }

  const result = await query(
    'INSERT INTO doctors (name, specialty) VALUES (?, ?)',
    [name, specialty]
  );
  return { ok: true, doctorId: result.insertId };
}

async function deleteDoctor(doctorId) {
  // don't delete a doctor who still has booked appointments or pending offers
  const busy = await query(
    "SELECT id FROM slots WHERE doctor_id = ? AND status IN ('BOOKED', 'OFFERED') LIMIT 1",
    [doctorId]
  );
  if (busy.length > 0) {
    return { ok: false, message: 'This doctor still has booked appointments or pending offers.' };
  }

  // remove everything that points to this doctor first, then the doctor
  await query('DELETE FROM offers WHERE slot_id IN (SELECT id FROM slots WHERE doctor_id = ?)', [doctorId]);
  await query('DELETE FROM slots WHERE doctor_id = ?', [doctorId]);
  await query('DELETE FROM waitlist WHERE doctor_id = ?', [doctorId]);
  const result = await query('DELETE FROM doctors WHERE id = ?', [doctorId]);

  if (result.affectedRows === 0) {
    return { ok: false, message: 'Doctor not found' };
  }
  return { ok: true, message: 'Doctor deleted' };
}

async function addSlot(doctorId, dateTime) {
  const result = await query(
    "INSERT INTO slots (doctor_id, date_time, status) VALUES (?, ?, 'OPEN')",
    [doctorId, dateTime]
  );
  return result.insertId;
}

// ---------- patient: book and cancel ----------

async function bookSlot(slotId, patientId) {
  const result = await query(
    "UPDATE slots SET status = 'BOOKED', patient_id = ? WHERE id = ? AND status = 'OPEN'",
    [patientId, slotId]
  );

  if (result.affectedRows === 0) {
    return { ok: false, message: 'Slot no longer available' };
  }
  return { ok: true, message: 'Slot booked' };
}

async function cancelSlot(slotId, patientId) {
  // only works if the slot is booked by this patient
  const result = await query(
    `UPDATE slots SET status = 'OPEN', patient_id = NULL
     WHERE id = ? AND status = 'BOOKED' AND patient_id = ?`,
    [slotId, patientId]
  );

  if (result.affectedRows === 0) {
    return { ok: false, message: 'This is not your booking' };
  }

  // the slot is free again so give it to the next person on the waitlist
  await offerToNext(slotId);
  return { ok: true, message: 'Appointment cancelled' };
}

// ---------- patient: waitlist ----------

async function joinWaitlist(patientId, doctorId, days, startHour, endHour, mode, endDate) {
  const result = await query(
    `INSERT INTO waitlist
     (patient_id, doctor_id, days, start_hour, end_hour, mode, joined_at, end_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    [patientId, doctorId, days, startHour, endHour, mode, new Date().toISOString(), endDate]
  );
  return result.insertId;
}

async function leaveWaitlist(waitlistId, patientId) {
  const result = await query(
    "UPDATE waitlist SET status = 'EXPIRED' WHERE id = ? AND patient_id = ? AND status = 'ACTIVE'",
    [waitlistId, patientId]
  );

  if (result.affectedRows === 0) {
    return { ok: false, message: 'Active waitlist request not found' };
  }
  return { ok: true, message: 'Removed from waitlist' };
}

// ---------- matching a slot with the waitlist ----------

// does this waitlist request fit this slot?
function matches(request, slot) {
  const time = toDate(slot.date_time);
  const day = DAY_NAMES[time.getDay()];
  const hour = time.getHours();

  return (
    (request.doctor_id === null || request.doctor_id === slot.doctor_id) &&
    slot.date_time.substring(0, 10) <= request.end_date &&
    request.days.split(',').includes(day) &&
    hour >= request.start_hour &&
    hour < request.end_hour
  );
}

// give an open slot to the first waitlist request that fits
async function offerToNext(slotId) {
  const slots = await query('SELECT * FROM slots WHERE id = ?', [slotId]);
  const slot = slots[0];

  if (!slot || slot.status !== 'OPEN') return;

  const hoursLeft = (toDate(slot.date_time) - new Date()) / (1000 * 60 * 60);
  if (hoursLeft <= 0) return; // slot is in the past

  const requests = await query(
    "SELECT * FROM waitlist WHERE status = 'ACTIVE' ORDER BY joined_at, id"
  );

  for (const request of requests) {
    if (!matches(request, slot)) continue;

    // don't offer the same slot to the same request twice
    const old = await query(
      'SELECT id FROM offers WHERE waitlist_id = ? AND slot_id = ? LIMIT 1',
      [request.id, slot.id]
    );
    if (old.length > 0) continue;

    // too late to ask, the slot is less than 3 hours away
    if (request.mode === 'ASK_FIRST' && hoursLeft <= 3) continue;

    if (request.mode === 'AUTO_BOOK') {
      const result = await query(
        "UPDATE slots SET status = 'BOOKED', patient_id = ? WHERE id = ? AND status = 'OPEN'",
        [request.patient_id, slot.id]
      );
      if (result.affectedRows === 1) {
        await query("UPDATE waitlist SET status = 'DONE' WHERE id = ?", [request.id]);
        console.log('Patient ' + request.patient_id + ' was auto booked into slot ' + slot.id);
      }
      return;
    }

    // ASK_FIRST: hold the slot and make an offer
    const hold = await query(
      "UPDATE slots SET status = 'OFFERED' WHERE id = ? AND status = 'OPEN'",
      [slot.id]
    );
    if (hold.affectedRows === 0) return;

    // more time to answer if the slot is far away
    const minutes = hoursLeft > 24 ? 60 : 15;
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

    await query(
      "INSERT INTO offers (waitlist_id, slot_id, status, expires_at) VALUES (?, ?, 'PENDING', ?)",
      [request.id, slot.id, expiresAt]
    );
    console.log('Patient ' + request.patient_id + ' has an offer for slot ' + slot.id);
    return;
  }
}

// ---------- offers: accept, decline, expire ----------

// put a held slot back to OPEN and try the next person
async function reopenSlot(slotId) {
  await query("UPDATE slots SET status = 'OPEN' WHERE id = ? AND status = 'OFFERED'", [slotId]);
  await offerToNext(slotId);
}

async function acceptOffer(offerId, patientId) {
  const rows = await query(
    `SELECT offers.*, waitlist.patient_id
     FROM offers JOIN waitlist ON offers.waitlist_id = waitlist.id
     WHERE offers.id = ?`,
    [offerId]
  );
  const offer = rows[0];

  if (!offer) {
    return { ok: false, message: 'Offer not found' };
  }
  if (String(offer.patient_id) !== String(patientId)) {
    return { ok: false, message: 'This offer does not belong to your account' };
  }
  if (offer.status !== 'PENDING') {
    return { ok: false, message: 'This offer is no longer active' };
  }
  if (new Date(offer.expires_at) < new Date()) {
    return { ok: false, message: 'This offer has expired' };
  }

  const result = await query(
    "UPDATE slots SET status = 'BOOKED', patient_id = ? WHERE id = ? AND status = 'OFFERED'",
    [patientId, offer.slot_id]
  );
  if (result.affectedRows === 0) {
    return { ok: false, message: 'Slot no longer available' };
  }

  await query("UPDATE offers SET status = 'ACCEPTED' WHERE id = ?", [offerId]);
  await query("UPDATE waitlist SET status = 'DONE' WHERE id = ?", [offer.waitlist_id]);

  return { ok: true, message: 'Offer accepted. Appointment booked!' };
}

async function declineOffer(offerId, patientId) {
  const rows = await query(
    `SELECT offers.slot_id, waitlist.patient_id
     FROM offers JOIN waitlist ON offers.waitlist_id = waitlist.id
     WHERE offers.id = ?`,
    [offerId]
  );
  const offer = rows[0];

  if (!offer || String(offer.patient_id) !== String(patientId)) {
    return { ok: false, message: 'This offer does not belong to your account' };
  }

  const result = await query(
    "UPDATE offers SET status = 'DECLINED' WHERE id = ? AND status = 'PENDING'",
    [offerId]
  );
  if (result.affectedRows === 0) {
    return { ok: false, message: 'This offer is no longer active' };
  }

  await reopenSlot(offer.slot_id);
  return { ok: true, message: 'Offer declined' };
}

// runs every minute from server.js
async function expireOffers() {
  const offers = await query("SELECT * FROM offers WHERE status = 'PENDING'");
  const now = new Date();

  for (const offer of offers) {
    if (new Date(offer.expires_at) < now) {
      const result = await query(
        "UPDATE offers SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'",
        [offer.id]
      );
      if (result.affectedRows === 1) {
        console.log('Offer ' + offer.id + ' expired. Trying the next person...');
        await reopenSlot(offer.slot_id);
      }
    }
  }
}

module.exports = {
  getDoctors,
  getOpenSlots,
  getMyBookings,
  getMyWaitlist,
  getOffersForPatient,
  addDoctor,
  deleteDoctor,
  addSlot,
  bookSlot,
  cancelSlot,
  joinWaitlist,
  leaveWaitlist,
  offerToNext,
  acceptOffer,
  declineOffer,
  expireOffers
};