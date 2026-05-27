const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const authController = require('../controllers/authController');
require('dotenv').config();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { login_user_id, login_password } = req.body;
  if (!login_user_id || !login_password)
    return res.status(400).json({ error: 'User ID and password are required.' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE login_user_id = ?', [login_user_id]
    );
    if (rows.length === 0)
      return res.status(401).json({ error: 'Invalid credentials.' });

    const user = rows[0];
    const isMatch = await bcrypt.compare(login_password, user.login_password);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid credentials.' });

    // Get extra info based on type
    let extraInfo = {};
    if (user.user_type === 'employee') {
      const [emp] = await db.query(
        `SELECT e.*, r.name as role_name, r.access_dashboard, r.access_students,
         r.access_daily_attendance, r.access_attendance_report, r.access_fee_payment,
         r.access_salary_slip, r.access_employees, r.access_principals, r.access_reports
         FROM employees e JOIN roles r ON e.role_id = r.id WHERE e.user_id = ?`, [user.id]
      );
      if (emp.length > 0) extraInfo = emp[0];
    } else if (user.user_type === 'principal') {
      const [prin] = await db.query(
        'SELECT * FROM principals WHERE user_id = ?', [user.id]
      );
      if (prin.length > 0) extraInfo = prin[0];
    }

    const payload = {
      id: user.id,
      user_type: user.user_type,
      login_user_id: user.login_user_id,
      ...extraInfo
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN
    });

    res.json({ token, user: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/forgot-password  →  send OTP to email
router.post('/forgot-password', authController.resetPasswordRequest);

// POST /api/auth/verify-reset  →  verify OTP + set new password
router.post('/verify-reset', authController.verifyResetAndSetPassword);

module.exports = router;