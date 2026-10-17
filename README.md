# Clinic Waitlist

A small appointment portal with a plain HTML, CSS, and JavaScript frontend, a Node.js API, and a MySQL database. Patients can book available appointments and join a waitlist. Staff can add doctors and appointment slots.

## What patients can do

- Create an account and sign in.
- View open appointment slots and book one.
- Cancel their own bookings.
- Join a waitlist for a doctor or any doctor, choosing days, time of day, and an end date.
- Ask to be offered a matching opening or allow the system to book it automatically.
- Accept or decline offers and leave a waitlist.

## What staff can do

- Sign in with a staff account created from the command line.
- Add doctors and appointment slots.
- View open slots and delete doctors when they have no booked appointments or active offers.

## Project files

- `frontend/index.html` — sign-in, patient, and staff page structure.
- `frontend/style.css` — page styling and mobile layout.
- `frontend/app.js` — browser interactions and API requests.
- `App/server.js` — HTTP server, API routes, and frontend delivery.
- `App/logic.js` — appointment booking, waitlist matching, and offers.
- `App/auth.js` — patient registration, sign-in, password hashes, and sessions.
- `App/database.js` — MySQL connection.
- `App/create-staff.js` — command-line setup for the first staff account.
- `App/check.js` — optional database connection check.

The frontend has no React or Vite build step. The server serves the three frontend files directly.

## Requirements

- Node.js and npm.
- MySQL with the existing `doctors`, `patients`, `slots`, `waitlist`, and `offers` tables. The server creates the `auth_users` login table automatically; it does not create the clinic tables.

## Setup and run

1. Create `App/.env` with your MySQL connection settings:

   ```dotenv
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   DB_NAME=your_database_name
   # Optional; defaults to 3000
   PORT=3000
   ```

   Keep this file private.

2. Install the server dependencies from `App/`:

   ```powershell
   cd App
   npm install
   ```

3. Create the first staff login (run from `App/`):

   ```powershell
   npm run staff:create
   ```

   Enter the staff email and a password of at least 8 characters when prompted. The command refuses to create another staff account after one already exists.

4. Start the app from `App/`:

   ```powershell
   npm start
   ```

5. Open `http://localhost:3000` (or the port configured in `App/.env`). The same server provides the website and `/api` endpoints.

Patients register through the sign-in page. Registration creates a new patient record and links it to the login. Existing patient records are not automatically linked to accounts.

## Waitlist behavior

When a booking is cancelled, or an offer is declined or expires, the server checks active waitlist requests in join order. It matches doctor, weekday, time range, and end date. An automatic request books the slot immediately. An ask-first request holds the slot and creates an offer: 60 minutes to respond when the appointment is more than 24 hours away, otherwise 15 minutes. Ask-first requests are skipped when the appointment is less than 3 hours away. Expired offers are checked once a minute.

## Sessions

Passwords are stored as salted scrypt hashes. Sign-in sets an HTTP-only session cookie. Sessions are held in server memory for up to 12 hours, so restarting the server signs users out. For a public deployment, use HTTPS and review session storage, account recovery, and login rate limiting. Set `NODE_ENV=production` over HTTPS so the cookie receives the `Secure` flag.
