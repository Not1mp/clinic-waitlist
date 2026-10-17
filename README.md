# Clinic Waitlist

A clinic appointment portal with a React patient and staff interface, a Node.js API, and a MySQL database. Patients can book open appointments, manage their bookings, and join a preference-based waitlist. Staff can maintain the doctor list and publish appointment slots.

## Features

- Patient self-registration and sign-in; staff sign-in with administrator-created accounts.
- Staff can add doctors and appointment slots, and remove doctors when they have no booked or offered slots.
- Patients can book and cancel appointments, choose waitlist preferences by doctor, day, time, and end date, and leave a waitlist.
- Waitlist requests can ask the patient to accept an opening or automatically book a matching opening.
- Patient accounts receive time-limited offers for openings and can accept or decline them.
- Role-protected API routes and HTTP-only session cookies.

## Project layout

- `App/` — Node.js API, MySQL access, appointment and waitlist logic, and staff account setup.
- `frontend/` — React 19 interface built with Vite.

## Requirements

- Node.js and npm.
- A running MySQL server and a database initialized with the clinic's existing tables: `doctors`, `patients`, `slots`, `waitlist`, and `offers`. The application creates the `auth_users` table at startup, but does not create the other tables.

## Setup

1. Configure the MySQL connection in `App/.env`:

   ```dotenv
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   DB_NAME=your_database_name
   # Optional; defaults to 3000
   PORT=3000
   ```

   Keep `.env` private. It is not included in the repository.

2. Install backend dependencies:

   ```powershell
   cd App
   npm install
   ```

3. Install frontend dependencies:

   ```powershell
   cd ..\frontend
   npm install
   ```

4. Create the initial staff account once:

   ```powershell
   cd ..\App
   npm run staff:create
   ```

   Enter a valid email and a password of at least 8 characters. This setup command closes staff account creation after the first staff account exists.

Patient accounts can be created from the sign-in page. Registration creates a row in `patients` and links it to a login account. Existing patient records are not automatically linked to login accounts.

## Run locally

Start the API in one terminal:

```powershell
cd App
npm start
```

Start the Vite development server in a second terminal:

```powershell
cd frontend
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Vite forwards `/api` requests to the API at `http://localhost:3000`.

## Production build

Build the React app:

```powershell
cd frontend
npm run build
```

Then start the API from `App/` with `npm start`. The Node server serves the generated frontend from `frontend/dist` and the API on the configured port (3000 by default).

## Authentication and sessions

Passwords are stored as salted scrypt hashes. Successful sign-in sets an HTTP-only session cookie. Sessions are stored in server memory and expire after 12 hours; restarting the server signs users out. The API determines the patient identity from the session and restricts staff and patient actions by role.

For a public deployment, serve the site over HTTPS and review session storage, account recovery, and login rate limiting. Set `NODE_ENV=production` when deploying over HTTPS so the session cookie receives the `Secure` flag.
