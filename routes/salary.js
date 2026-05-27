const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireAdminOrPrincipal } = require('../middleware/auth');

async function generateSlipNo() {
  const [rows] = await db.query('SELECT COUNT(*) as cnt FROM salary_slips');
  const year = new Date().getFullYear();
  return `SAL${year}${String(rows[0].cnt + 1).padStart(5, '0')}`;
}

// GET all salary slips
router.get('/', authenticate, async (req, res) => {
  const { employee_type, employee_id, month, year } = req.query;
  try {
    let query = `SELECT ss.*, u.login_user_id as generated_by_name FROM salary_slips ss
                 JOIN users u ON ss.generated_by = u.id WHERE 1=1`;
    const params = [];
    if (employee_type) { query += ' AND ss.employee_type = ?'; params.push(employee_type); }
    if (employee_id) { query += ' AND ss.employee_id = ?'; params.push(employee_id); }
    if (month) { query += ' AND ss.salary_month = ? AND ss.salary_year = ?'; params.push(month, year); }
    query += ' ORDER BY ss.created_at DESC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST generate salary slip
router.post('/', authenticate, requireAdminOrPrincipal, async (req, res) => {
  const { employee_id, employee_type, amount, salary_month, salary_year } = req.body;
  if (!employee_id || !employee_type || !amount || !salary_month || !salary_year)
    return res.status(400).json({ error: 'All fields are required.' });

  // Principal can only generate for employees
  if (req.user.user_type === 'principal' && employee_type === 'principal')
    return res.status(403).json({ error: 'Principal cannot generate salary slip for another principal.' });

  try {
    const slip_no = await generateSlipNo();
    await db.query(
      `INSERT INTO salary_slips (slip_no, employee_id, employee_type, amount, salary_month, salary_year, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [slip_no, employee_id, employee_type, amount, salary_month, salary_year, req.user.id]
    );
    res.status(201).json({ slip_no, message: 'Salary slip generated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET salary summary for dashboard
router.get('/summary', authenticate, async (req, res) => {
  const { month, year } = req.query;
  try {
    const [generated] = await db.query(
      `SELECT COUNT(*) as cnt FROM salary_slips WHERE salary_month = ? AND salary_year = ?`,
      [month, year]
    );
    const [totalEmp] = await db.query(
      `SELECT (SELECT COUNT(*) FROM employees) + (SELECT COUNT(*) FROM principals) as total`
    );
    res.json({
      generated: generated[0].cnt,
      not_generated: totalEmp[0].total - generated[0].cnt,
      total: totalEmp[0].total
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
