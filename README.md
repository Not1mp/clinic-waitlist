# Clinic Waitlist

A small web app for a clinic. Patients can book appointments and join a waitlist for an earlier opening. Staff add doctors and appointment slots. When an appointment is cancelled, the free slot is offered to the next person on the waitlist whose preferences match.

## Features

**Patients**
- Create an account and sign in
- See open appointments and book one
- Cancel their own appointments
- Join the waitlist by choosing a doctor (or any doctor), days, time of day and an end date
- Choose what happens when a slot opens: ask first, or book automatically
- Accept or decline offers, and leave the waitlist

**Staff**
- Sign in with an account made by the administrator
- Add and delete doctors
- Add appointment slots
- See all open slots

## Built with

- HTML, CSS and plain JavaScript for the pages (no framework, no build step)
- Node.js with its built-in `http` module for the server
- MySQL for the data

## Project structure

```
clinic-waitlist/
  App/                 the server
    server.js          routes, input checks, serves the frontend
    logic.js           booking, waitlist and offer logic
    auth.js            sign in, sessions and passwords
    database.js        MySQL connection
    create-staff.js    makes a staff account
    .env               settings (keep private)
    package.json
  frontend/            the pages
    index.html
    style.css
    app.js
  README.md
```

The server reads the pages from the `frontend` folder next to `App`.

## Getting started

You need Node.js and a running MySQL server.

1. Open a terminal in the `App` folder and install the packages:

   ```
   npm install
   ```

2. Check your `.env` file. It holds the MySQL settings that `database.js` reads. `PORT` is optional and defaults to 3000. Never share this file or commit it to git.

3. Make sure the database tables exist (see [Database](#database)). The login table is created automatically when the server starts.

4. Start the server:

   ```
   node server.js
   ```

   You should see `Server running at http://localhost:3000`. If you see `Could not connect to MySQL`, check that MySQL is running and that `.env` is correct.

5. Open http://localhost:3000 in your browser.

### Creating a staff account

Staff cannot register on the website. Run this once in the `App` folder:

```
node create-staff.js
```

Open the file first to see which name, email and password it creates.

## How the waitlist works

1. A patient cancels, or an offer is declined or runs out of time, and the slot becomes open.
2. The server looks at active waitlist requests, earliest first, and picks the first one that matches the doctor, day of the week, time of day and end date.
3. If the request is set to **book automatically**, the patient is booked straight away.
4. If the request is set to **ask first**, the slot is held and the patient gets an offer. They have 60 minutes to answer if the appointment is more than 24 hours away, and 15 minutes if it is closer.
5. If the patient declines or does not answer, the offer ends and the slot goes to the next matching request. If nobody matches, it stays open for anyone to book.

Other rules:
- A patient is never offered the same slot twice.
- Ask-first requests are skipped when the appointment is less than 3 hours away.
- Slots in the past get no offers.
- The server checks for expired offers every minute.
- A doctor cannot be deleted while they have booked appointments or pending offers.

## Waitlist checks

The server rejects a waitlist request unless:
- the doctor is a valid id, or empty for any doctor
- at least one day is chosen, each day is valid (Mon to Sun) and none is repeated
- the start and end hours are whole numbers between 0 and 24, and the start is before the end
- the response option is `ASK_FIRST` or `AUTO_BOOK`
- the end date is a real date that is not in the past

The date picker on the page also blocks past dates.

## Database

`logic.js` uses these tables. The statuses are the values the code expects.

| Table | Columns used | Status values |
| --- | --- | --- |
| `doctors` | id, name, specialty | |
| `slots` | id, doctor_id, date_time, status, patient_id | OPEN, OFFERED, BOOKED |
| `waitlist` | id, patient_id, doctor_id, days, start_hour, end_hour, mode, joined_at, end_date, status | ACTIVE, DONE, EXPIRED |
| `offers` | id, waitlist_id, slot_id, status, expires_at | PENDING, ACCEPTED, DECLINED, EXPIRED |

Patient and staff accounts are handled by `auth.js`. Slot times are handled as text like `2026-10-20 09:30:00`.

## API routes

| Method | Route | Who | What it does |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | anyone | Create a patient account |
| POST | `/api/auth/login` | anyone | Sign in |
| POST | `/api/auth/logout` | anyone | Sign out |
| GET | `/api/auth/me` | signed in | Get the current user |
| GET | `/api/doctors` | signed in | List doctors |
| GET | `/api/slots` | signed in | List open slots |
| POST | `/api/doctors` | staff | Add a doctor |
| DELETE | `/api/doctors/:id` | staff | Delete a doctor |
| POST | `/api/slots` | staff | Add a slot |
| POST | `/api/book` | patient | Book a slot |
| POST | `/api/cancel` | patient | Cancel a booking |
| GET | `/api/my-bookings` | patient | List my appointments |
| GET | `/api/my-waitlist` | patient | List my waitlist requests |
| POST | `/api/waitlist` | patient | Join the waitlist |
| DELETE | `/api/waitlist/:id` | patient | Leave the waitlist |
| GET | `/api/offers` | patient | List my pending offers |
| POST | `/api/offers/:id/accept` | patient | Accept an offer |
| POST | `/api/offers/:id/decline` | patient | Decline an offer |

## Notes

- The server only serves `index.html`, `style.css` and `app.js` from the `frontend` folder. If you add images or other files, add them to the list in `serveFrontend` in `server.js`.
- There is no build step. Edit the files in `frontend`, then refresh the browser.