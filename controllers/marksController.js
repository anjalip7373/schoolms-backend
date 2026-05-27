const pool = require('../config/db');

// ── SUBJECTS ──────────────────────────────────────────────────
exports.getSubjects = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM subjects ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addSubject = async (req, res) => {
  try {
    const { name, code, max_marks, pass_marks } = req.body;
    await pool.execute(
      'INSERT INTO subjects (name, code, max_marks, pass_marks) VALUES (?,?,?,?)',
      [name, code || null, max_marks || 100, pass_marks || 35]
    );
    res.json({ message: 'Subject added successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateSubject = async (req, res) => {
  try {
    const { name, code, max_marks, pass_marks } = req.body;
    await pool.execute(
      'UPDATE subjects SET name=?, code=?, max_marks=?, pass_marks=? WHERE id=?',
      [name, code || null, max_marks || 100, pass_marks || 35, req.params.id]
    );
    res.json({ message: 'Subject updated successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteSubject = async (req, res) => {
  try {
    await pool.execute('DELETE FROM subjects WHERE id=?', [req.params.id]);
    res.json({ message: 'Subject deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── CLASS-WISE SUBJECTS ───────────────────────────────────────
exports.getClassSubjects = async (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) {
      // Return all with class info
      const [rows] = await pool.execute(`
        SELECT cs.*, s.name as subject_name, s.code, s.max_marks, s.pass_marks,
        c.name as class_name
        FROM class_subjects cs
        JOIN subjects s ON cs.subject_id = s.id
        JOIN classes c ON cs.class_id = c.id
        ORDER BY c.name, s.name
      `);
      return res.json(rows);
    }
    const [rows] = await pool.execute(`
      SELECT cs.*, s.name as subject_name, s.code, s.max_marks, s.pass_marks
      FROM class_subjects cs
      JOIN subjects s ON cs.subject_id = s.id
      WHERE cs.class_id = ?
      ORDER BY s.name
    `, [class_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.assignClassSubject = async (req, res) => {
  try {
    const { class_id, subject_id } = req.body;
    await pool.execute(
      `INSERT IGNORE INTO class_subjects (class_id, subject_id) VALUES (?,?)`,
      [class_id, subject_id]
    );
    res.json({ message: 'Subject assigned to class' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.removeClassSubject = async (req, res) => {
  try {
    await pool.execute('DELETE FROM class_subjects WHERE id=?', [req.params.id]);
    res.json({ message: 'Subject removed from class' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── EXAM TYPES ────────────────────────────────────────────────
exports.getExamTypes = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM exam_types ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addExamType = async (req, res) => {
  try {
    await pool.execute('INSERT INTO exam_types (name) VALUES (?)', [req.body.name]);
    res.json({ message: 'Exam type added' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateExamType = async (req, res) => {
  try {
    await pool.execute('UPDATE exam_types SET name=? WHERE id=?', [req.body.name, req.params.id]);
    res.json({ message: 'Exam type updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteExamType = async (req, res) => {
  try {
    await pool.execute('DELETE FROM exam_types WHERE id=?', [req.params.id]);
    res.json({ message: 'Exam type deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── MARKS ─────────────────────────────────────────────────────
exports.getMarks = async (req, res) => {
  try {
    const { class_id, exam_type_id, academic_year } = req.query;
    const userRole = req.user.role;

    let effectiveClassId = class_id;
    if (userRole === 'Teacher' || userRole === 'teacher') {
      const [empRows] = await pool.execute(
        'SELECT class_assigned FROM users WHERE id=?', [req.user.id]
      );
      effectiveClassId = empRows[0]?.class_assigned;
    }

    if (!effectiveClassId) return res.status(400).json({ message: 'Please select a class' });

    const [students] = await pool.execute(
      `SELECT s.id, s.roll_no, s.full_name FROM students s
       WHERE s.class_id = ? AND s.is_active = 1 ORDER BY s.roll_no`,
      [effectiveClassId]
    );

    // Get CLASS-WISE subjects only
    const [subjects] = await pool.execute(`
      SELECT s.*, cs.id as class_subject_id
      FROM class_subjects cs
      JOIN subjects s ON cs.subject_id = s.id
      WHERE cs.class_id = ?
      ORDER BY s.name
    `, [effectiveClassId]);

    const [marks] = await pool.execute(
      `SELECT sm.* FROM student_marks sm
       WHERE sm.class_id = ? AND sm.exam_type_id = ? AND sm.academic_year = ?`,
      [effectiveClassId, exam_type_id, academic_year]
    );

    // Build marks map: { student_id: { subject_id: { marks, remark } } }
    // Build marks map
    const marksMap = {};
    marks.forEach(m => {
      if (!marksMap[m.student_id]) marksMap[m.student_id] = {};
      marksMap[m.student_id][m.subject_id] = {
        marks: m.marks_obtained,
        is_absent: m.is_absent === 1 || m.is_absent === true,
        remark: m.remark || ''
      };
      
    });

    res.json({ students, subjects, marksMap });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.saveMarks = async (req, res) => {
  try {
    const { class_id, exam_type_id, academic_year, marks } = req.body;
    const userRole = req.user.role;

    let effectiveClassId = class_id;
    if (userRole === 'Teacher' || userRole === 'teacher') {
      const [empRows] = await pool.execute(
        'SELECT class_assigned FROM users WHERE id=?', [req.user.id]
      );
      effectiveClassId = empRows[0]?.class_assigned;
    }

    effectiveClassId = parseInt(effectiveClassId);
    if (!effectiveClassId) {
      return res.status(400).json({ message: 'Class ID required' });
    }

    for (const mark of marks) {
      const { student_id, subject_id, marks_obtained, is_absent } = mark;

      const [subjectRows] = await pool.execute(
        'SELECT max_marks FROM subjects WHERE id=?', [subject_id]
      );
      const maxMarks = subjectRows[0]?.max_marks || 100;

      if (is_absent) {
        // Save as absent
        await pool.execute(
          `INSERT INTO student_marks
           (student_id, subject_id, exam_type_id, class_id, academic_year, marks_obtained, max_marks, is_absent, marked_by)
           VALUES (?,?,?,?,?,NULL,?,1,?)
           ON DUPLICATE KEY UPDATE marks_obtained=NULL, is_absent=1, marked_by=?`,
          [student_id, subject_id, exam_type_id, effectiveClassId, academic_year,
           maxMarks, req.user.id, req.user.id]
        );
      } else {
        if (marks_obtained === '' || marks_obtained === null || marks_obtained === undefined) continue;
        await pool.execute(
          `INSERT INTO student_marks
           (student_id, subject_id, exam_type_id, class_id, academic_year, marks_obtained, max_marks, is_absent, marked_by)
           VALUES (?,?,?,?,?,?,?,0,?)
           ON DUPLICATE KEY UPDATE marks_obtained=?, max_marks=?, is_absent=0, marked_by=?`,
          [student_id, subject_id, exam_type_id, effectiveClassId, academic_year,
           marks_obtained, maxMarks, req.user.id,
           marks_obtained, maxMarks, req.user.id]
        );
      }
    }

    res.json({ message: 'Marks saved successfully' });
  } catch (err) {
    console.error('saveMarks error:', err.message);
    res.status(500).json({ message: err.message });
  }
};


exports.getMarksheet = async (req, res) => {
  try {
    const { exam_type_id, academic_year, student_id } = req.query;
    let { class_id } = req.query;
    const userRole = req.user.role;

    // ✅ For teachers, resolve class_id from their profile
    if (userRole === 'Teacher' || userRole === 'teacher') {
      const [empRows] = await pool.execute(
        'SELECT class_assigned FROM users WHERE id=?', [req.user.id]
      );
      class_id = empRows[0]?.class_assigned;
    }

    // ✅ Validate before querying
    if (!class_id) return res.status(400).json({ message: 'No class assigned. Please contact admin.' });
    if (!exam_type_id) return res.status(400).json({ message: 'exam_type_id is required' });
    if (!academic_year) return res.status(400).json({ message: 'academic_year is required' });

    let studentFilter = '';
    const params = [class_id, exam_type_id, academic_year];
    if (student_id) { studentFilter = 'AND sm.student_id = ?'; params.push(student_id); }

    const [rows] = await pool.execute(
      `SELECT sm.*, sm.is_absent,
       s.full_name as student_name, s.roll_no,
       sub.name as subject_name, sub.code, sub.pass_marks,
       et.name as exam_type_name, c.name as class_name,
       ser.overall_remark
       FROM student_marks sm
       JOIN students s ON sm.student_id = s.id
       JOIN subjects sub ON sm.subject_id = sub.id
       JOIN exam_types et ON sm.exam_type_id = et.id
       JOIN classes c ON sm.class_id = c.id
       LEFT JOIN student_exam_remarks ser
         ON ser.student_id = sm.student_id
         AND ser.exam_type_id = sm.exam_type_id
         AND ser.academic_year = sm.academic_year
       WHERE sm.class_id = ? AND sm.exam_type_id = ? AND sm.academic_year = ?
       ${studentFilter}
       ORDER BY s.roll_no, sub.name`,
      params
    );

    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── TEACHER ASSIGNED SUBJECTS ─────────────────────────────────
exports.getTeacherAssignedSubjects = async (req, res) => {
  try {
    const { teacher_id } = req.query;
    const tid = teacher_id || req.user.id;
    const [rows] = await pool.execute(`
      SELECT tas.*, s.name as subject_name, s.code, s.max_marks
      FROM teacher_assigned_subjects tas
      JOIN subjects s ON tas.subject_id = s.id
      WHERE tas.teacher_id = ?
      ORDER BY s.name
    `, [tid]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.saveTeacherAssignedSubjects = async (req, res) => {
  try {
    const { teacher_id, subject_ids } = req.body;
    // Delete existing
    await pool.execute('DELETE FROM teacher_assigned_subjects WHERE teacher_id = ?', [teacher_id]);
    // Insert new
    if (subject_ids && subject_ids.length > 0) {
      for (const sid of subject_ids) {
        await pool.execute(
          'INSERT IGNORE INTO teacher_assigned_subjects (teacher_id, subject_id) VALUES (?,?)',
          [teacher_id, sid]
        );
      }
    }
    res.json({ message: 'Teacher subjects updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── OVERALL REMARKS ───────────────────────────────────────────
exports.getRemarks = async (req, res) => {
  try {
    const { class_id, exam_type_id, academic_year } = req.query;
    const userRole = req.user.role;

    let effectiveClassId = class_id;

    // Force teacher to their assigned class
    if (userRole === 'Teacher' || userRole === 'teacher') {
      const [empRows] = await pool.execute(
        'SELECT class_assigned FROM users WHERE id=?', [req.user.id]
      );
      effectiveClassId = empRows[0]?.class_assigned;
    }

    effectiveClassId = parseInt(effectiveClassId);
    if (!effectiveClassId || isNaN(effectiveClassId)) {
      return res.json({});
    }

    const [rows] = await pool.execute(
      `SELECT * FROM student_exam_remarks
       WHERE class_id = ? AND exam_type_id = ? AND academic_year = ?`,
      [effectiveClassId, exam_type_id, academic_year]
    );

    const map = {};
    rows.forEach(r => { map[r.student_id] = r.overall_remark; });
    console.log('Remarks fetched:', Object.keys(map).length, 'for class:', effectiveClassId);
    res.json(map);
  } catch (err) {
    console.error('getRemarks error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

exports.saveRemarks = async (req, res) => {
  try {
    const { class_id, exam_type_id, academic_year, remarks } = req.body;
    const userRole = req.user.role;

    // Get effective class ID
    let effectiveClassId = class_id;

    // Force teacher to their assigned class
    if (userRole === 'Teacher' || userRole === 'teacher') {
      const [empRows] = await pool.execute(
        'SELECT class_assigned FROM users WHERE id=?', [req.user.id]
      );
      effectiveClassId = empRows[0]?.class_assigned;
    }

    // Convert to integer and validate
    effectiveClassId = parseInt(effectiveClassId);

    if (!effectiveClassId || isNaN(effectiveClassId)) {
      return res.status(400).json({ message: 'Invalid class ID. Please contact administrator.' });
    }

    console.log('Saving remarks for class:', effectiveClassId, 'exam:', exam_type_id, 'year:', academic_year);

    for (const { student_id, overall_remark } of remarks) {
      await pool.execute(
        `INSERT INTO student_exam_remarks 
         (student_id, class_id, exam_type_id, academic_year, overall_remark, marked_by)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE overall_remark=?, marked_by=?`,
        [
          student_id,
          effectiveClassId,
          exam_type_id,
          academic_year,
          overall_remark || '',
          req.user.id,
          overall_remark || '',
          req.user.id
        ]
      );
    }

    res.json({ message: 'Remarks saved successfully' });
  } catch (err) {
    console.error('saveRemarks error:', err.message);
    res.status(500).json({ message: err.message });
  }
};