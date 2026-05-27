const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireAdminOrPrincipal } = require('../middleware/auth');

// Generate roll number: auto
async function generateRollNo(classId) {
  const [rows] = await db.query(
    'SELECT COUNT(*) as cnt FROM students WHERE class_id = ?', [classId]
  );
  const count = rows[0].cnt + 1;
  return `CLS${classId}-${String(count).padStart(4, '0')}`;
}

// GET all students (with optional filters)
router.get('/', authenticate, async (req, res) => {
  const { class_id, search } = req.query;
  let query = `SELECT s.*, c.name as class_name FROM students s 
               JOIN classes c ON s.class_id = c.id WHERE 1=1`;
  const params = [];
  if (class_id) { query += ' AND s.class_id = ?'; params.push(class_id); }
  if (search) {
    query += ' AND (s.full_name LIKE ? OR s.roll_no LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY s.created_at DESC';
  try {
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single student
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, c.name as class_name FROM students s 
       JOIN classes c ON s.class_id = c.id WHERE s.id = ?`, [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST add student
router.post('/', authenticate, requireAdminOrPrincipal, async (req, res) => {
  const { full_name, class_id, phone_no, whatsapp_no, email, date_of_birth, address } = req.body;
  if (!full_name || !class_id || !phone_no || !whatsapp_no || !email || !date_of_birth || !address)
    return res.status(400).json({ error: 'All fields are mandatory.' });
  try {
    const roll_no = await generateRollNo(class_id);
    const [result] = await db.query(
      `INSERT INTO students (roll_no, full_name, class_id, phone_no, whatsapp_no, email, date_of_birth, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [roll_no, full_name, class_id, phone_no, whatsapp_no, email, date_of_birth, address]
    );
    res.status(201).json({ id: result.insertId, roll_no, message: 'Student added.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT edit student
router.put('/:id', authenticate, requireAdminOrPrincipal, async (req, res) => {
  const { full_name, class_id, phone_no, whatsapp_no, email, date_of_birth, address, fee_status } = req.body;
  try {
    await db.query(
      `UPDATE students SET full_name=?, class_id=?, phone_no=?, whatsapp_no=?, 
       email=?, date_of_birth=?, address=?, fee_status=? WHERE id=?`,
      [full_name, class_id, phone_no, whatsapp_no, email, date_of_birth, address, fee_status, req.params.id]
    );
    res.json({ message: 'Student updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
