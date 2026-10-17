const db = require('./database');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
const SESSION_HOURS = 12;

async function initAuthTable() {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS auth_users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('STAFF', 'PATIENT') NOT NULL,
      patient_id BIGINT UNSIGNED NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return salt + ':' + key.toString('hex');
}

async function checkPassword(password, storedHash) {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const key = await scrypt(password, parts[0], 64);
  const expected = Buffer.from(parts[1], 'hex');
  return expected.length === key.length && crypto.timingSafeEqual(key, expected);
}

async function registerPatient(name, email, password) {
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanName.length < 2) return { ok: false, message: 'Enter your full name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  if (String(password || '').length < 8) {
    return { ok: false, message: 'Use a password with at least 8 characters.' };
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      'SELECT id FROM auth_users WHERE email = ?', [cleanEmail]
    );
    if (existing.length) {
      await connection.rollback();
      return { ok: false, message: 'An account with that email already exists.' };
    }
    const [patient] = await connection.execute(
      'INSERT INTO patients (name) VALUES (?)', [cleanName]
    );
    const passwordHash = await hashPassword(password);
    await connection.execute(
      "INSERT INTO auth_users (email, password_hash, role, patient_id) VALUES (?, ?, 'PATIENT', ?)",
      [cleanEmail, passwordHash, patient.insertId]
    );
    await connection.commit();
    return {
      ok: true,
      user: { id: patient.insertId, name: cleanName, email: cleanEmail, role: 'PATIENT' }
    };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return { ok: false, message: 'An account with that email already exists.' };
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function login(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const [rows] = await db.execute(
    'SELECT auth_users.id, auth_users.email, auth_users.password_hash, auth_users.role, auth_users.patient_id, patients.name FROM auth_users LEFT JOIN patients ON patients.id = auth_users.patient_id WHERE auth_users.email = ? LIMIT 1',
    [cleanEmail]
  );
  const account = rows[0];
  if (!account || !(await checkPassword(password, account.password_hash))) {
    return { ok: false, message: 'Email or password is incorrect.' };
  }
  return {
    ok: true,
    user: {
      id: account.patient_id || account.id,
      name: account.name || 'Clinic staff',
      email: account.email,
      role: account.role
    }
  };
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    user,
    expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000
  });
  return token;
}

function getSession(request) {
  const match = (request.headers.cookie || '').match(/(?:^|;\s*)clinic_session=([^;]+)/);
  if (!match) return null;
  const session = sessions.get(match[1]);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(match[1]);
    return null;
  }
  return { token: match[1], user: session.user };
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    'clinic_session=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' +
      (SESSION_HOURS * 60 * 60) + secure
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    'Set-Cookie',
    'clinic_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
  );
}

function destroySession(token) {
  sessions.delete(token);
}

module.exports = {
  initAuthTable, hashPassword, registerPatient, login, createSession,
  getSession, setSessionCookie, clearSessionCookie, destroySession
};
