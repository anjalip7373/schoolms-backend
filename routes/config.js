const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ─── ADD-ON: AUTOMATIC EXAM CONFIG TABLE INITIALIZATION ───
db.query(`
  CREATE TABLE IF NOT EXISTS exam_subject_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    exam_type VARCHAR(50) NOT NULL,
    subject_id INT NOT NULL,
    max_marks INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    UNIQUE KEY unique_class_exam_subject (class_id, exam_type, subject_id)
  )
`).then(() => {
  console.log('CRITICAL: exam_subject_config table verified safe and ready.');
}).catch(err => {
  console.error('Database structure loading alert:', err.message);
});

// ---- CLASSES (Fully Intact & Untouched) ----
router.get('/classes', authenticate, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM classes ORDER BY id');
  res.json(rows);
});

router.post('/classes', authenticate, requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Class name required.' });
  try {
    const [r] = await db.query('INSERT INTO classes (name) VALUES (?)', [name]);
    res.status(201).json({ id: r.insertId, name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/classes/:id', authenticate, requireAdmin, async (req, res) => {
  const { name } = req.body;
  await db.query('UPDATE classes SET name=? WHERE id=?', [name, req.params.id]);
  res.json({ message: 'Class updated.' });
});

router.delete('/classes/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM classes WHERE id=?', [req.params.id]);
    res.json({ message: 'Class deleted.' });
  } catch (err) { res.status(500).json({ error: 'Cannot delete class in use.' }); }
});

// ---- FEE TYPES (Fully Intact & Untouched) ----
router.get('/fee-types', authenticate, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM fee_types ORDER BY id');
  res.json(rows);
});

router.post('/fee-types', authenticate, requireAdmin, async (req, res) => {
  const { name } = req.body;
  const [r] = await db.query('INSERT INTO fee_types (name) VALUES (?)', [name]);
  res.status(201).json({ id: r.insertId, name });
});

router.put('/fee-types/:id', authenticate, requireAdmin, async (req, res) => {
  const { name } = req.body;
  await db.query('UPDATE fee_types SET name=? WHERE id=?', [name, req.params.id]);
  res.json({ message: 'Fee type updated.' });
});

router.delete('/fee-types/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM fee_types WHERE id=?', [req.params.id]);
    res.json({ message: 'Fee type deleted.' });
  } catch (err) { res.status(500).json({ error: 'Cannot delete fee type in use.' }); }
});

// ---- ROLES (Fully Intact & Untouched) ----
router.get('/roles', authenticate, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM roles ORDER BY id');
  res.json(rows);
});

router.post('/roles', authenticate, requireAdmin, async (req, res) => {
  const { name, access_dashboard, access_students, access_daily_attendance,
          access_attendance_report, access_fee_payment, access_salary_slip,
          access_employees, access_principals, access_reports } = req.body;
  const [r] = await db.query(
    `INSERT INTO roles (name, access_dashboard, access_students, access_daily_attendance,
     access_attendance_report, access_fee_payment, access_salary_slip,
     access_employees, access_principals, access_reports)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, access_dashboard||false, access_students||false, access_daily_attendance||false,
     access_attendance_report||false, access_fee_payment||false, access_salary_slip||false,
     access_employees||false, access_principals||false, access_reports||false]
  );
  res.status(201).json({ id: r.insertId, message: 'Role created.' });
});

router.put('/roles/:id', authenticate, requireAdmin, async (req, res) => {
  const { name, access_dashboard, access_students, access_daily_attendance,
          access_attendance_report, access_fee_payment, access_salary_slip,
          access_employees, access_principals, access_reports } = req.body;
  await db.query(
    `UPDATE roles SET name=?, access_dashboard=?, access_students=?, access_daily_attendance=?,
     access_attendance_report=?, access_fee_payment=?, access_salary_slip=?,
     access_employees=?, access_principals=?, access_reports=? WHERE id=?`,
    [name, access_dashboard, access_students, access_daily_attendance,
     access_attendance_report, access_fee_payment, access_salary_slip,
     access_employees, access_principals, access_reports, req.params.id]
  );
  res.json({ message: 'Role updated. Changes applied to all users.' });
});

router.delete('/roles/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM roles WHERE id=?', [req.params.id]);
    res.json({ message: 'Role deleted.' });
  } catch (err) { res.status(500).json({ error: 'Cannot delete role in use.' }); }
});

// ─── ADD-ON ENDPOINTS: EXAM TYPE WISE SUBJECT & MARKS MATRICES ───
router.get('/exam-settings', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT esc.*, s.name as subject_name, c.name as class_name 
      FROM exam_subject_config esc
      JOIN subjects s ON esc.subject_id = s.id
      JOIN classes c ON esc.class_id = c.id
      ORDER BY c.id, esc.exam_type
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/exam-settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const { class_id, exam_type, subject_id, max_marks } = req.body;
    if (!class_id || !exam_type || !subject_id || !max_marks) {
      return res.status(400).json({ error: 'All configuration matrix fields are required.' });
    }
    await db.query(`
      INSERT INTO exam_subject_config (class_id, exam_type, subject_id, max_marks)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE max_marks = VALUES(max_marks)
    `, [class_id, exam_type, subject_id, max_marks]);
    res.status(200).json({ message: 'Exam configuration profile successfully compiled!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;