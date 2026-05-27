const pool = require('./config/database');
const bcrypt = require('bcryptjs');

async function fixAdmin() {
  const hash = await bcrypt.hash('admin123', 10);
  await pool.execute(
    `INSERT INTO users (emp_id, full_name, role_id, login_user_id, login_password, phone) 
     VALUES ('EMP001', 'Administrator', 1, 'admin', ?, '9999999999')
     ON DUPLICATE KEY UPDATE login_password = ?`,
    [hash, hash]
  );
  console.log('Admin user fixed! Login with admin / admin123');
  process.exit();
}

fixAdmin().catch(console.error);