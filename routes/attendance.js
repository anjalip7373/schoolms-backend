const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireAdminOrPrincipal } = require('../middleware/auth');

// GET today's student attendance for a class
router.get('/students/today', authenticate, async (req, res) => {
  const { class_id } = req.query;
  const today = new Date().toISOString().split('T')[0];
  try {
    let query = `
      SELECT s.id, s.full_name, s.roll_no, c.name as class_name,
             COALESCE(a.status, 'absent') as status
      FROM students s
      JOIN classes c ON s.class_id = c.id
      LEFT JOIN student_attendance a ON s.id = a.student_id AND a.attendance_date = ?
      WHERE 1=1`;
    const params = [today];
    if (class_id) { query += ' AND s.class_id = ?'; params.push(class_id); }
    query += ' ORDER BY s.roll_no';
    const [rows] = await db.query(query, params);
    res.json({ date: today, attendance: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET today's employee attendance
router.get('/employees/today', authenticate, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const [employees] = await db.query(
      `SELECT e.id, e.name, e.emp_id, 'employee' as type,
              COALESCE(a.status, 'absent') as status
       FROM employees e
       LEFT JOIN employee_attendance a ON e.id = a.employee_id 
         AND a.employee_type='employee' AND a.attendance_date = ?
       UNION ALL
       SELECT p.id, p.name, p.emp_id, 'principal' as type,
              COALESCE(a.status, 'absent') as status
       FROM principals p
       LEFT JOIN employee_attendance a ON p.id = a.employee_id 
         AND a.employee_type='principal' AND a.attendance_date = ?
       ORDER BY name`, [today, today]
    );
    res.json({ date: today, attendance: employees });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST save student attendance (bulk)
router.post('/students', authenticate, requireAdminOrPrincipal, async (req, res) => {
  const { attendance } = req.body; // [{student_id, status}]
  const today = new Date().toISOString().split('T')[0];
  try {
    for (const rec of attendance) {
      await db.query(
        `INSERT INTO student_attendance (student_id, attendance_date, status, marked_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)`,
        [rec.student_id, today, rec.status, req.user.id]
      );
    }
    res.json({ message: 'Student attendance saved.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST save employee attendance (bulk)
router.post('/employees', authenticate, requireAdminOrPrincipal, async (req, res) => {
  const { attendance } = req.body; // [{employee_id, employee_type, status}]
  const today = new Date().toISOString().split('T')[0];
  try {
    for (const rec of attendance) {
      await db.query(
        `INSERT INTO employee_attendance (employee_id, employee_type, attendance_date, status, marked_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)`,
        [rec.employee_id, rec.employee_type, today, rec.status, req.user.id]
      );
    }
    res.json({ message: 'Employee attendance saved.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET monthly attendance report (students)
router.get('/report/students', authenticate, async (req, res) => {
  const { class_id, month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'Month and year required.' });
  try {
    let query = `
      SELECT s.id, s.roll_no, s.full_name, c.name as class_name,
             SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present_count,
             SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) as absent_count,
             SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) as late_count,
             SUM(CASE WHEN a.status='halfday' THEN 1 ELSE 0 END) as halfday_count,
             COUNT(a.id) as total_marked
      FROM students s
      JOIN classes c ON s.class_id = c.id
      LEFT JOIN student_attendance a ON s.id = a.student_id 
        AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?
      WHERE 1=1`;
    const params = [month, year];
    if (class_id) { query += ' AND s.class_id = ?'; params.push(class_id); }
    query += ' GROUP BY s.id ORDER BY c.name, s.roll_no';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET monthly attendance report (employees)
router.get('/report/employees', authenticate, async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'Month and year required.' });
  try {
    const [rows] = await db.query(`
      SELECT e.id, e.emp_id, e.name, 'Employee' as type,
             SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present_count,
             SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) as absent_count,
             SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) as late_count
      FROM employees e
      LEFT JOIN employee_attendance a ON e.id = a.employee_id 
        AND a.employee_type='employee'
        AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?
      GROUP BY e.id
      UNION ALL
      SELECT p.id, p.emp_id, p.name, 'Principal' as type,
             SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present_count,
             SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) as absent_count,
             SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) as late_count
      FROM principals p
      LEFT JOIN employee_attendance a ON p.id = a.employee_id
        AND a.employee_type='principal'
        AND MONTH(a.attendance_date) = ? AND YEAR(a.attendance_date) = ?
      GROUP BY p.id`, [month, year, month, year]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
