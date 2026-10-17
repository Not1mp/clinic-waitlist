<<<<<<< HEAD
# Clinic Waitlist: React version

This project has two parts:

- `App/` is the Node.js API and connects to MySQL.
- `frontend/` is the React website.

The React version starts in `frontend/src/`.

## One-time setup

1. Make sure the MySQL database already has the clinic tables used by the earlier project: `doctors`, `patients`, `slots`, `waitlist`, and `offers`.
2. Keep the MySQL connection settings in `App/.env` as before. Do not share that file or put it in a public repository.
3. Open a terminal in `frontend/` and install the React packages:

   ```powershell
   cd C:\Users\aloks\OneDrive\Desktop\clinic-waitlist\frontend
   npm install
   ```

4. Open a terminal in `App/` and create the first staff login:

   ```powershell
   cd C:\Users\aloks\OneDrive\Desktop\clinic-waitlist\App
   npm run staff:create
   ```

   Enter a staff email address and a password with at least 8 characters when prompted. Staff registration is not available from the public login screen.

The Node server creates the `auth_users` table automatically the first time it starts. New patient accounts are created through the patient registration form and also create a row in the existing `patients` table. Patient records that were already in MySQL before login was added do not yet have accounts attached to them; for this learning version, use a newly registered patient account.

## Run in development

Keep two terminals open.

**Terminal 1 — backend:**

```powershell
cd C:\Users\aloks\OneDrive\Desktop\clinic-waitlist\App
npm start
```

**Terminal 2 — React website:**

```powershell
cd C:\Users\aloks\OneDrive\Desktop\clinic-waitlist\frontend
npm run dev
```

Open the local address Vite prints, normally `http://localhost:5173`. Select Patient or Staff on the sign-in page. Patients can create their own account; staff use the account created in the one-time setup.

## Create a production build

In the `frontend/` terminal, run:

```powershell
npm run build
```

Then start the Node server with `npm start` from `App/`. It serves the generated React app and the API from port 3000.

## How sign-in works

- Passwords are stored as salted hashes, not readable passwords.
- The server puts a random, HTTP-only session cookie in the browser after sign-in.
- The API gets the patient ID from the signed-in session. It does not trust a patient ID sent by the page.
- Staff-only actions (adding doctors and appointment slots) are rejected for patient accounts.
- Patient-only actions (booking, cancelling, waitlist, and offers) are rejected for staff accounts.

For this learning version, sign-in sessions are held in server memory and last up to 12 hours. Restarting the server signs everyone out; they can sign in again. Before a public deployment, configure HTTPS, review account recovery and rate limiting, and keep `.env` private.
=======
# clinic-waitlist
>>>>>>> 018f97044a36528c6cc98c6611503fd7a43a7208
