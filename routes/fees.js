const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireAdminOrPrincipal } = require('../middleware/auth');

async function generateReceiptNo() {
  const [rows] = await db.query('SELECT COUNT(*) as cnt FROM fee_payments');
  const year = new Date().getFullYear();
  return `RCP${year}${String(rows[0].cnt + 1).padStart(5, '0')}`;
}

// GET fee payments (with search)
router.get('/', authenticate, async (req, res) => {
  const { student_id, search, class_id } = req.query;
  try {
    let query = `
      SELECT fp.*, s.full_name, s.roll_no, c.name as class_name, ft.name as fee_type_name
      FROM fee_payments fp
      JOIN students s ON fp.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      JOIN fee_types ft ON fp.fee_type_id = ft.id
      WHERE 1=1`;
    const params = [];
    if (student_id) { query += ' AND fp.student_id = ?'; params.push(student_id); }
    if (class_id) { query += ' AND s.class_id = ?'; params.push(class_id); }
    if (search) {
      query += ' AND (s.full_name LIKE ? OR s.roll_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY fp.created_at DESC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create fee payment
router.post('/', authenticate, requireAdminOrPrincipal, async (req, res) => {
  const { student_id, fee_type_id, amount, payment_date, payment_month, payment_year } = req.body;
  if (!student_id || !fee_type_id || !amount || !payment_date || !payment_month || !payment_year)
    return res.status(400).json({ error: 'All fields are required.' });
  try {
    const receipt_no = await generateReceiptNo();
    await db.query(
      `INSERT INTO fee_payments (receipt_no, student_id, fee_type_id, amount, payment_date, payment_month, payment_year, collected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [receipt_no, student_id, fee_type_id, amount, payment_date, payment_month, payment_year, req.user.id]
    );
    res.status(201).json({ receipt_no, message: 'Fee payment saved.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET fee summary for dashboard
router.get('/summary', authenticate, async (req, res) => {
  const { month, year, class_id } = req.query;
  try {
    let classFilter = class_id ? 'AND s.class_id = ?' : '';
    const params = month ? [month, year] : [];
    if (class_id) params.push(class_id);

    const monthFilter = month ? 'AND fp.payment_month = ? AND fp.payment_year = ?' : '';
    // reset params
    const p2 = [];
    if (month) { p2.push(month, year); }
    if (class_id) p2.push(class_id);

    const [paidRows] = await db.query(
      `SELECT COUNT(DISTINCT fp.student_id) as paid
       FROM fee_payments fp JOIN students s ON fp.student_id = s.id
       WHERE 1=1 ${monthFilter} ${classFilter}`, p2
    );
    const [totalRows] = await db.query(
      `SELECT COUNT(*) as total FROM students${class_id ? ' WHERE class_id = ?' : ''}`,
      class_id ? [class_id] : []
    );
    const paid = paidRows[0].paid;
    const total = totalRows[0].total;
    res.json({ paid, not_paid: total - paid, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
