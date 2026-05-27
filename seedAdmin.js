// Run this ONCE to create the default admin user
// node seedAdmin.js

const bcrypt = require('bcryptjs');
const db = require('./config/db');

async function seedAdmin() {
  try {
    const password = 'admin123'; // Change this!
    const hashed = await bcrypt.hash(password, 10);
    
    // Check if admin exists
    const [existing] = await db.query("SELECT id FROM users WHERE login_user_id = 'admin'");
    if (existing.length > 0) {
      await db.query("UPDATE users SET login_password = ? WHERE login_user_id = 'admin'", [hashed]);
      console.log('✅ Admin password updated.');
    } else {
      await db.query(
        "INSERT INTO users (user_type, login_user_id, login_password) VALUES ('admin', 'admin', ?)",
        [hashed]
      );
      console.log('✅ Admin user created. Login: admin / admin123');
    }
    process.exit(0);
  } catch (err) {
    console.error('Error seeding admin:', err);
    process.exit(1);
  }
}

seedAdmin();
