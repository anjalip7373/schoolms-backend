const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { authenticate, requireAdminOrPrincipal } = require('../middleware/auth');

async function generateEmpId() {
  const [rows] = await db.query('SELECT COUNT(*) as cnt FROM employees');
  return `EMP${String(rows[0].cnt + 1).padStart(4, '0')}`;
}

// GET all employees
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*, r.name as role_name, u.login_user_id, c.name as class_name
       FROM employees e 
       JOIN roles r ON e.role_id = r.id
       LEFT JOIN users u ON e.user_id = u.id
       LEFT JOIN classes c ON e.class_assigned = c.id
       ORDER BY e.created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST add employee
router.post('/', authenticate, requireAdminOrPrincipal, async (req, res) => {
  const { name, role_id, login_user_id, login_password, class_assigned,
          phone_no, qualification, subject, salary, joining_date } = req.body;
  if (!name || !role_id || !login_user_id || !login_password || !phone_no ||
      !qualification || !salary || !joining_date)
    return res.status(400).json({ error: 'All fields are mandatory.' });
  try {
    const emp_id = await generateEmpId();
    const hashedPassword = await bcrypt.hash(login_password, 10);
    const [userResult] = await db.query(
      'INSERT INTO users (user_type, login_user_id, login_password) VALUES (?, ?, ?)',
      ['employee', login_user_id, hashedPassword]
    );
    await db.query(
      `INSERT INTO employees (emp_id, name, role_id, user_id, class_assigned, phone_no, qualification, subject, salary, joining_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [emp_id, name, role_id, userResult.insertId, class_assigned || null,
       phone_no, qualification, subject, salary, joining_date]
    );
    res.status(201).json({ emp_id, message: 'Employee added.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT edit employee (emp_id, loginuserid, loginpassword, role NOT editable)
router.put('/:id', authenticate, requireAdminOrPrincipal, async (req, res) => {
  const { name, class_assigned, phone_no, qualification, subject, salary, joining_date } = req.body;
  try {
    await db.query(
      `UPDATE employees SET name=?, class_assigned=?, phone_no=?, qualification=?, 
       subject=?, salary=?, joining_date=? WHERE id=?`,
      [name, class_assigned || null, phone_no, qualification, subject, salary, joining_date, req.params.id]
    );
    res.json({ message: 'Employee updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
