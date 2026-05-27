const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { authenticate, requireAdmin } = require('../middleware/auth');

async function generatePrincipalEmpId() {
  const [rows] = await db.query('SELECT COUNT(*) as cnt FROM principals');
  return `PRI${String(rows[0].cnt + 1).padStart(4, '0')}`;
}

// GET all principals
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, u.login_user_id FROM principals p
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST add principal (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { name, login_user_id, login_password, phone_no, qualification, subject, salary, joining_date } = req.body;
  if (!name || !login_user_id || !login_password || !phone_no || !qualification || !salary || !joining_date)
    return res.status(400).json({ error: 'All fields are mandatory.' });
  try {
    const emp_id = await generatePrincipalEmpId();
    const hashedPassword = await bcrypt.hash(login_password, 10);
    const [userResult] = await db.query(
      'INSERT INTO users (user_type, login_user_id, login_password) VALUES (?, ?, ?)',
      ['principal', login_user_id, hashedPassword]
    );
    await db.query(
      `INSERT INTO principals (emp_id, name, user_id, phone_no, qualification, subject, salary, joining_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [emp_id, name, userResult.insertId, phone_no, qualification, subject, salary, joining_date]
    );
    res.status(201).json({ emp_id, message: 'Principal added.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT edit principal
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { name, phone_no, qualification, subject, salary, joining_date } = req.body;
  try {
    await db.query(
      `UPDATE principals SET name=?, phone_no=?, qualification=?, subject=?, salary=?, joining_date=? WHERE id=?`,
      [name, phone_no, qualification, subject, salary, joining_date, req.params.id]
    );
    res.json({ message: 'Principal updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
