const pool = require('../config/db');
const teacherScope = require('../middleware/teacherScope');

// Additive schema sync — creates the table only if it does not exist.
(async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS teacher_class_subject (
        id INT AUTO_INCREMENT PRIMARY KEY,
        teacher_id INT NOT NULL,
        class_id INT NOT NULL,
        subject_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_teacher_class_subject (teacher_id, class_id, subject_id)
      )
    `);
  } catch (err) {
    console.log('teacher_class_subject init notice:', err.message);
  }
})();

// GET /config/teacher-assignments  (admin) -> [{ id, teacher_id, teacher_name, class_id, class_name, subject_id, subject_name }]
exports.getTeacherAssignments = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.id, t.teacher_id, u.full_name AS teacher_name,
              t.class_id, c.name AS class_name,
              t.subject_id, s.name AS subject_name
         FROM teacher_class_subject t
         JOIN users u ON u.id = t.teacher_id
         JOIN classes c ON c.id = t.class_id
         JOIN subjects s ON s.id = t.subject_id
        ORDER BY u.full_name, c.name, s.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /config/teacher-assignments  (admin)  body: { teacher_id, class_id, subject_id }
exports.addTeacherAssignment = async (req, res) => {
  try {
    const teacher_id = Number(req.body.teacher_id);
    const class_id = Number(req.body.class_id);
    const subject_id = Number(req.body.subject_id);
    if (!teacher_id || !class_id || !subject_id) {
      return res.status(400).json({ message: 'Teacher, class and subject are required' });
    }
    const [t] = await pool.execute(
      `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
        WHERE u.id = ? AND LOWER(r.name) = 'teacher'`, [teacher_id]
    );
    if (!t.length) return res.status(404).json({ message: 'Teacher not found' });

    const [cs] = await pool.execute(
      'SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?', [class_id, subject_id]
    );
    if (!cs.length) return res.status(400).json({ message: 'This subject is not assigned to the selected class' });

    // Duplicate check — same teacher + class + subject already assigned
    const [dup] = await pool.execute(
      'SELECT id FROM teacher_class_subject WHERE teacher_id = ? AND class_id = ? AND subject_id = ?',
      [teacher_id, class_id, subject_id]
    );
    if (dup.length) {
      return res.status(409).json({ message: 'This Teacher + Class + Subject assignment already exists.' });
    }

    await pool.execute(
      'INSERT INTO teacher_class_subject (teacher_id, class_id, subject_id) VALUES (?,?,?)',
      [teacher_id, class_id, subject_id]
    );
    res.json({ message: 'Assigned to teacher' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This Teacher + Class + Subject assignment already exists.' });
    }
    res.status(500).json({ message: err.message });
  }
};

// DELETE /config/teacher-assignments/:id  (admin)
exports.removeTeacherAssignment = async (req, res) => {
  try {
    await pool.execute('DELETE FROM teacher_class_subject WHERE id = ?', [req.params.id]);
    res.json({ message: 'Assignment removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /my-classes  (run after teacherScope) — teacher: own classes; others: all
exports.getMyClasses = async (req, res) => {
  try {
    if (!req.classScope) {
      const [rows] = await pool.execute('SELECT * FROM classes ORDER BY LENGTH(name), name');
      return res.json(rows);
    }
    if (!req.classScope.length) return res.json([]);
    const [rows] = await pool.query(
      'SELECT * FROM classes WHERE id IN (?) ORDER BY LENGTH(name), name', [req.classScope]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /my-subjects?class_id=  (run after teacherScope) — teacher: own subjects in that class
exports.getMySubjects = async (req, res) => {
  try {
    const classId = Number(req.query.class_id);
    if (!classId || !teacherScope.canAccessClass(req, classId)) return res.json([]);
    const ids = await teacherScope.teacherSubjectIds(req, classId); // null = all
    let sql = `SELECT s.id, s.name, s.code FROM class_subjects cs
                 JOIN subjects s ON s.id = cs.subject_id WHERE cs.class_id = ?`;
    const params = [classId];
    if (ids) {
      if (!ids.length) return res.json([]);
      sql += ` AND s.id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }
    const [rows] = await pool.execute(sql + ' ORDER BY s.name', params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /my-broadcast-classes (run after teacherScope) — Broadcast only: assigned classes
exports.getMyBroadcastClasses = async (req, res) => {
  try {
    if (!req.broadcastScope) {
      const [rows] = await pool.execute('SELECT * FROM classes ORDER BY LENGTH(name), name');
      return res.json(rows);
    }
    if (!req.broadcastScope.length) return res.json([]);
    const [rows] = await pool.query(
      'SELECT c.*, (c.id IN (?)) AS is_class_teacher FROM classes c WHERE c.id IN (?) ORDER BY LENGTH(c.name), c.name',
      [req.classScope.length ? req.classScope : [0], req.broadcastScope]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /my-broadcast-subjects?class_id= (run after teacherScope) — Broadcast only: assigned subjects
exports.getMyBroadcastSubjects = async (req, res) => {
  try {
    const classId = Number(req.query.class_id);
    if (!classId || !teacherScope.canBroadcastClass(req, classId)) return res.json([]);
    const ids = await teacherScope.broadcastSubjectIds(req, classId); // null = all
    let sql = `SELECT s.id, s.name, s.code FROM class_subjects cs
                 JOIN subjects s ON s.id = cs.subject_id WHERE cs.class_id = ?`;
    const params = [classId];
    if (ids) {
      if (!ids.length) return res.json([]);
      sql += ` AND s.id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }
    const [rows] = await pool.execute(sql + ' ORDER BY s.name', params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};