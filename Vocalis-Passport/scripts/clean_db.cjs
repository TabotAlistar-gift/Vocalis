const { Client } = require('pg');
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_RkfpBxw1z6jb@ep-bold-mouse-a5tlgen1-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function clean() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log("Connected to Neon DB...");

  // 1. Delete all passports
  const pRes = await client.query('DELETE FROM passports RETURNING id;');
  console.log(`Deleted ${pRes.rowCount} passport records.`);

  // 2. Delete all student users
  const uRes = await client.query("DELETE FROM users WHERE role != 'admin' RETURNING id, email;");
  console.log(`Deleted ${uRes.rowCount} student accounts:`, uRes.rows);

  // 3. Ensure admin user is active & has fresh hash
  const adminEmail = (process.env.ADMIN_EMAIL || "tabotclarise@gmail.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "VocalisAdmin2026!";
  const hash = await hashPassword(adminPassword);
  const today = new Date().toISOString().slice(0, 10);

  const existingAdmin = await client.query("SELECT * FROM users WHERE email = $1 LIMIT 1;", [adminEmail]);
  if (existingAdmin.rowCount === 0) {
    await client.query(`
      INSERT INTO users (full_name, email, phone, vocalis_id, role, level, badge, passport_status, date_joined, date_issued, password_hash, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
    `, [
      "Clarise Tabot (Founder)",
      adminEmail,
      "+234 800 000 0000",
      "VOC-ADMIN-01",
      "admin",
      "Level Six",
      "Global Citizen",
      "active",
      today,
      today,
      hash,
      true
    ]);
    console.log(`Seeded admin user: ${adminEmail}`);
  } else {
    await client.query(`
      UPDATE users
      SET role = 'admin', active = true, password_hash = $1, passport_status = 'active', date_issued = COALESCE(date_issued, $2)
      WHERE id = $3;
    `, [hash, today, existingAdmin.rows[0].id]);
    console.log(`Updated admin user: ${adminEmail}`);
  }

  const remaining = await client.query("SELECT id, email, full_name, vocalis_id, role, passport_status FROM users;");
  console.log("Remaining users in DB:", remaining.rows);

  await client.end();
  console.log("Database cleared and initialized successfully!");
}

clean().catch((err) => {
  console.error("Clean error:", err);
  process.exit(1);
});
