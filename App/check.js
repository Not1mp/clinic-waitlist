require('dotenv').config();

const mysql = require('mysql2/promise');

async function checkDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [rows] = await connection.execute(
    'SELECT DATABASE() AS databaseName'
  );

  console.log('Connected to:', rows[0].databaseName);

  await connection.end();
}

checkDatabase().catch(function (error) {
  console.error('Connection failed:', error.message);
  process.exitCode = 1;
});