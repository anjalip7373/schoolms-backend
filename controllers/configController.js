const pool = require('../config/db');

// ─── SAFE AUTO-INITIALIZATION FOR EXAM MATRIX TABLE ───
pool.execute(`
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
  console.log('CRITICAL LOG: exam_subject_config table successfully loaded!');
}).catch(err => {
  console.error('Database structure load error:', err.message);
});

// Classes Management - Fully Intact
exports.getClasses = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM classes ORDER BY LENGTH(name), name');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.addClass = async (req, res) => {
  try {
    await pool.execute('INSERT INTO classes (name) VALUES (?)', [req.body.name]);
    res.json({ message: 'Class added' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.updateClass = async (req, res) => {
  try {
    await pool.execute('UPDATE classes SET name=? WHERE id=?', [req.body.name, req.params.id]);
    res.json({ message: 'Class updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.deleteClass = async (req, res) => {
  try {
    await pool.execute('DELETE FROM classes WHERE id=?', [req.params.id]);
    res.json({ message: 'Class deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Fee Types Management - Fully Intact
exports.getFeeTypes = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM fee_types ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.addFeeType = async (req, res) => {
  try {
    await pool.execute('INSERT INTO fee_types (name, amount) VALUES (?,?)', [req.body.name, req.body.amount || 0]);
    res.json({ message: 'Fee type added' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.updateFeeType = async (req, res) => {
  try {
    await pool.execute('UPDATE fee_types SET name=?, amount=? WHERE id=?', [req.body.name, req.body.amount || 0, req.params.id]);
    res.json({ message: 'Fee type updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.deleteFeeType = async (req, res) => {
  try {
    await pool.execute('DELETE FROM fee_types WHERE id=?', [req.params.id]);
    res.json({ message: 'Fee type deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Roles Management - Fully Intact
exports.getRoles = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM roles ORDER BY name');
    res.json(rows.map(r => {
      let access = [];
      try {
        if (typeof r.access === 'string' && r.access) access = JSON.parse(r.access);
        else if (Array.isArray(r.access)) access = r.access;
      } catch(e) { access = []; }
      return { ...r, access };
    }));
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.addRole = async (req, res) => {
  try {
    const access = Array.isArray(req.body.access) ? req.body.access : [];
    await pool.execute('INSERT INTO roles (name, access) VALUES (?,?)', [req.body.name, JSON.stringify(access)]);
    res.json({ message: 'Role added' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.updateRole = async (req, res) => {
  try {
    const access = Array.isArray(req.body.access) ? req.body.access : [];
    await pool.execute('UPDATE roles SET name=?, access=? WHERE id=?', [req.body.name, JSON.stringify(access), req.params.id]);
    res.json({ message: 'Role updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.deleteRole = async (req, res) => {
  try {
    await pool.execute('DELETE FROM roles WHERE id=?', [req.params.id]);
    res.json({ message: 'Role deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── NEW ADD-ON CONTROLLERS ACTION TRIGGERS FOR EXAM MATRIX MAPPING ───
exports.getExamSettings = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT esc.*, s.name as subject_name, c.name as class_name 
      FROM exam_subject_config esc
      JOIN subjects s ON esc.subject_id = s.id
      JOIN classes c ON esc.class_id = c.id
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.saveExamSettings = async (req, res) => {
  try {
    const { class_id, exam_type, subject_id, max_marks } = req.body;
    await pool.execute(`
      INSERT INTO exam_subject_config (class_id, exam_type, subject_id, max_marks)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE max_marks = VALUES(max_marks)
    `, [class_id, exam_type, subject_id, max_marks]);
    res.json({ message: 'Exam criteria mapped successfully!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};