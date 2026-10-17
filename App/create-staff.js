require('dotenv').config();
const db = require('./database');
const auth = require('./auth');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

async function main() {
  await auth.initAuthTable();
  const [staff] = await db.execute(
    "SELECT id FROM auth_users WHERE role = 'STAFF' LIMIT 1"
  );
  if (staff.length) {
    console.log('A staff account already exists. Staff setup is closed.');
    return;
  }

  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    const email = (await terminal.question('Staff email: ')).trim().toLowerCase();
    const password = await terminal.question('Staff password (8+ characters): ');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      throw new Error('Enter a valid email and a password with at least 8 characters.');
    }
    const passwordHash = await auth.hashPassword(password);
    await db.execute(
      "INSERT INTO auth_users (email, password_hash, role) VALUES (?, ?, 'STAFF')",
      [email, passwordHash]
    );
    console.log('Staff account created. You can now sign in at /staff.');
  } finally {
    terminal.close();
  }
}

main().catch(function (error) {
  console.error('Could not create staff account:', error.message);
  process.exitCode = 1;
}).finally(async function () {
  await db.end();
});
