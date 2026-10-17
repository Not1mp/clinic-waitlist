require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const logic = require('./logic');
const auth = require('./auth');

// send a JSON reply
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// read the request body and turn it into an object
function readBody(req) {
  return new Promise(function (resolve, reject) {
    let text = '';
    req.on('data', function (chunk) { text += chunk; });
    req.on('end', function () {
      if (text === '') return resolve({});
      try { resolve(JSON.parse(text)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

// true if the user has this role, otherwise sends an error
function hasRole(res, session, role) {
  if (session.user.role === role) return true;
  sendJson(res, 403, { ok: false, message: 'This action is not available for your account.' });
  return false;
}

async function handleApi(req, res, body) {
  const method = req.method;
  const url = new URL(req.url, 'http://localhost');
  const pathName = url.pathname;
  const parts = pathName.split('/'); // /api/offers/5/accept -> ['', 'api', 'offers', '5', 'accept']

  // ----- login, register, logout (no sign in needed) -----
  if (method === 'POST' && pathName === '/api/auth/login') {
    const result = await auth.login(body.email, body.password);
    if (!result.ok || result.user.role !== body.role) {
      return sendJson(res, 401, { ok: false, message: 'Email or password is incorrect.' });
    }
    auth.setSessionCookie(res, auth.createSession(result.user));
    return sendJson(res, 200, { ok: true, user: result.user });
  }
  if (method === 'POST' && pathName === '/api/auth/register') {
    if (body.role !== 'PATIENT') {
      return sendJson(res, 403, { ok: false, message: 'Only patients can register here.' });
    }
    const result = await auth.registerPatient(body.name, body.email, body.password);
    if (!result.ok) return sendJson(res, 400, result);
    auth.setSessionCookie(res, auth.createSession(result.user));
    return sendJson(res, 201, result);
  }
  if (method === 'POST' && pathName === '/api/auth/logout') {
    const session = auth.getSession(req);
    if (session) auth.destroySession(session.token);
    auth.clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  // ----- everything below needs a signed in user -----
  const session = auth.getSession(req);
  if (!session) return sendJson(res, 401, { ok: false, message: 'Please sign in first.' });
  const userId = session.user.id;

  if (method === 'GET' && pathName === '/api/auth/me') return sendJson(res, 200, { ok: true, user: session.user });

  // patients and staff can both look at doctors and open slots
  if (method === 'GET' && pathName === '/api/doctors') return sendJson(res, 200, await logic.getDoctors());
  if (method === 'GET' && pathName === '/api/slots') {
    const doctorId = Number(url.searchParams.get('doctor')) || null; // no doctor = all slots
    return sendJson(res, 200, await logic.getOpenSlots(doctorId));
  }

  // only staff can add doctors and slots
  if (method === 'POST' && pathName === '/api/doctors') {
    if (!hasRole(res, session, 'STAFF')) return;
    return sendJson(res, 200, await logic.addDoctor(body.name, body.specialty));
  }
  if (method === 'DELETE' && parts[2] === 'doctors' && parts.length === 4) {
    if (!hasRole(res, session, 'STAFF')) return;
    return sendJson(res, 200, await logic.deleteDoctor(Number(parts[3])));
  }
  if (method === 'POST' && pathName === '/api/slots') {
    if (!hasRole(res, session, 'STAFF')) return;
    const doctorId = Number(body.doctorId);
    if (!Number.isInteger(doctorId) || !body.dateTime) {
      return sendJson(res, 400, { ok: false, message: 'Choose a doctor, date, and time.' });
    }
    return sendJson(res, 201, { ok: true, slotId: await logic.addSlot(doctorId, body.dateTime) });
  }

  // everything left is for patients only
  if (!hasRole(res, session, 'PATIENT')) return;

  if (method === 'POST' && pathName === '/api/book') return sendJson(res, 200, await logic.bookSlot(Number(body.slotId), userId));
  if (method === 'POST' && pathName === '/api/cancel') return sendJson(res, 200, await logic.cancelSlot(Number(body.slotId), userId));
  if (method === 'GET' && pathName === '/api/my-bookings') return sendJson(res, 200, await logic.getMyBookings(userId));
  if (method === 'GET' && pathName === '/api/my-waitlist') return sendJson(res, 200, await logic.getMyWaitlist(userId));
  if (method === 'GET' && pathName === '/api/offers') return sendJson(res, 200, await logic.getOffersForPatient(userId));

  if (method === 'POST' && pathName === '/api/waitlist') {
    const doctorId = body.doctorId == null ? null : Number(body.doctorId);
    const waitlistId = await logic.joinWaitlist(
      userId, doctorId, body.days, Number(body.startHour), Number(body.endHour), body.mode, body.endDate
    );
    return sendJson(res, 201, { ok: true, waitlistId });
  }
  if (method === 'DELETE' && parts[2] === 'waitlist' && parts.length === 4) {
    return sendJson(res, 200, await logic.leaveWaitlist(Number(parts[3]), userId));
  }
  if (method === 'POST' && parts[2] === 'offers' && parts[4] === 'accept') {
    return sendJson(res, 200, await logic.acceptOffer(Number(parts[3]), userId));
  }
  if (method === 'POST' && parts[2] === 'offers' && parts[4] === 'decline') {
    return sendJson(res, 200, await logic.declineOffer(Number(parts[3]), userId));
  }

  sendJson(res, 404, { ok: false, message: 'API route not found.' });
}

// ----- serve the built React app -----
const frontendDist = path.resolve(__dirname, '..', 'frontend', 'dist');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

function serveFrontend(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '/staff' || urlPath === '/patient') urlPath = '/index.html';

  // stop people from reading files outside the dist folder
  const filePath = path.join(frontendDist, urlPath);
  if (!filePath.startsWith(frontendDist + path.sep)) {
    return sendJson(res, 403, { ok: false, message: 'Invalid path.' });
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      return sendJson(res, 404, {
        ok: false,
        message: 'React app is not built yet. In the frontend folder run: npm install, then npm run build.'
      });
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async function (req, res) {
  try {
    if (req.url.startsWith('/api/')) {
      const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
      return await handleApi(req, res, body);
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveFrontend(req, res);
    sendJson(res, 404, { ok: false, message: 'Not found.' });
  } catch (err) {
    console.error(err);
    if (err instanceof SyntaxError) {
      return sendJson(res, 400, { ok: false, message: 'Request body must be valid JSON.' });
    }
    sendJson(res, 500, { ok: false, message: 'Server error.' });
  }
});

// every minute, check for offers that ran out of time
setInterval(async function () {
  try { await logic.expireOffers(); }
  catch (err) { console.error('Could not check expired offers:', err); }
}, 60 * 1000);

const PORT = Number(process.env.PORT || 3000);
auth.initAuthTable().then(function () {
  server.listen(PORT, function () {
    console.log('Server running at http://localhost:' + PORT);
  });
}).catch(function (err) {
  console.error('Could not connect to MySQL or initialize login table:', err.message);
  process.exit(1);
});