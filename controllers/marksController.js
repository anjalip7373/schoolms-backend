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
    await pool.execute('DELETE FROM class_subjects WHERE id = ?', [req.params.id]);
    res.json({ message: 'Subject removed from class' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── EXAM TYPES (FULLY DYNAMIC DATABASE HANDLERS) ────────────────
exports.getExamTypes = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM exam_types ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addExamType = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Exam type name required.' });
    await pool.execute('INSERT INTO exam_types (name) VALUES (?)', [name]);
    res.json({ message: 'Exam type added successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateExamType = async (req, res) => {
  try {
    const { name } = req.body;
    const [oldRows] = await pool.execute('SELECT name FROM exam_types WHERE id=?', [req.params.id]);
    const oldName = oldRows[0]?.name;

    await pool.execute('UPDATE exam_types SET name=? WHERE id=?', [name, req.params.id]);

    // ✅ FIX: keep exam_subject_config.exam_type text in sync so criteria don't get orphaned on rename
    if (oldName && oldName !== name) {
      await pool.execute('UPDATE exam_subject_config SET exam_type=? WHERE exam_type=?', [name, oldName]);
    }

    res.json({ message: 'Exam type updated successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteExamType = async (req, res) => {
  try {
    await pool.execute('DELETE FROM exam_types WHERE id=?', [req.params.id]);
    res.json({ message: 'Exam type deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── TEACHER ACCESS HELPERS (marks entry) ──────────────────────
const uidOf = (req) => req.user?.id ?? req.user?.userId ?? req.user?.user_id;
const isTeacherRole = (req) => String(req.user.role || '').toLowerCase() === 'teacher';

// Everything a teacher may touch: own class (class teacher) + every class she teaches a subject in.
async function teacherMarksScope(req) {
  const [u] = await pool.execute('SELECT class_assigned FROM users WHERE id=?', [uidOf(req)]);
  const [a] = await pool.execute('SELECT class_id, subject_id FROM teacher_class_subject WHERE teacher_id=?', [uidOf(req)]);
  const ownClass = Number(u[0]?.class_assigned) || null;
  const classIds = new Set(a.map(r => Number(r.class_id)));
  if (ownClass) classIds.add(ownClass);
  return { ownClass, classIds, assignments: a };
}

// editable = subjects she can enter marks for | visible = subjects she can see (null = all)
function teacherAccessFor(scope, classId) {
  const editable = scope.assignments.filter(r => Number(r.class_id) === classId).map(r => Number(r.subject_id));
  const isClassTeacher = scope.ownClass === classId;
  return { isClassTeacher, editable, visible: isClassTeacher ? null : editable };
}

// Non-teachers: access = null (full). Teachers: access = { isClassTeacher, editable, visible }.
async function resolveMarksAccess(req, requestedClassId) {
  const requested = parseInt(requestedClassId) || null;
  if (!isTeacherRole(req)) return { classId: requested, access: null };
  const scope = await teacherMarksScope(req);
  const classId = requested || scope.ownClass || [...scope.classIds][0] || null;
  if (!classId) return { classId: null, access: null, none: true };
  if (!scope.classIds.has(classId)) return { classId, access: null, forbidden: true };
  return { classId, access: teacherAccessFor(scope, classId) };
}

// Classes shown in the Marks Entry dropdown: own class + every class she teaches a subject in.
exports.getMyMarksClasses = async (req, res) => {
  try {
    if (!isTeacherRole(req)) {
      const [all] = await pool.execute('SELECT * FROM classes ORDER BY LENGTH(name), name');
      return res.json(all);
    }
    const scope = await teacherMarksScope(req);
    const ids = [...scope.classIds];
    if (!ids.length) return res.json([]);
    const [rows] = await pool.query('SELECT * FROM classes WHERE id IN (?) ORDER BY LENGTH(name), name', [ids]);
    // her own (class-teacher) class first so the page opens there; other classes are subject-teacher classes
    const list = rows.map(r => ({ ...r, is_class_teacher: Number(r.id) === scope.ownClass }))
                     .sort((a, b) => Number(b.is_class_teacher) - Number(a.is_class_teacher));
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── MARKS ─────────────────────────────────────────────────────
// ── MARKS ENTRY & CUMULATIVE sheet PROCESSING ───────────────────
exports.getMarks = async (req, res) => {
  try {
    const { class_id, exam_type_id, academic_year } = req.query;
    // Teacher access: own class (class teacher) + every class she teaches a subject in
    const { classId: effectiveClassId, access, forbidden, none } = await resolveMarksAccess(req, class_id);
    if (forbidden) return res.status(403).json({ message: 'You are not assigned to this class' });
    if (none) return res.json({ students: [], subjects: [], marksMap: {}, class_id: null, editable_subject_ids: [], can_edit_remarks: false });

    if (!effectiveClassId) return res.status(400).json({ message: 'Please select a class' });

    let examName = exam_type_id;
    if (!isNaN(parseInt(exam_type_id))) {
      const [etRows] = await pool.execute('SELECT name FROM exam_types WHERE id=?', [exam_type_id]);
      if (etRows.length > 0) examName = etRows[0].name;
    }

    // Academic year is stored as "2026-2027" (Apr 2026 – Mar 2027). A student only "existed"
    // for this academic year if they joined on or before its last day (March 31 of the end year).
    const ayParts = String(academic_year || '').split('-').map(y => parseInt(y, 10));
    const ayEndYear = ayParts[1] || ayParts[0] || new Date().getFullYear();
    const academicYearEndDate = `${ayEndYear}-03-31 23:59:59`;

    const [students] = await pool.execute(
      `SELECT s.id, s.roll_no, s.full_name, s.fee_status FROM students s WHERE s.class_id = ? AND s.is_active = 1 AND s.created_at <= ? ORDER BY s.roll_no`,
      [effectiveClassId, academicYearEndDate]
    );

    const [configRows] = await pool.execute(
      `SELECT subject_id, exam_type, max_marks, pass_marks FROM exam_subject_config WHERE class_id = ?`,
      [effectiveClassId]
    );

    const [baseSubjects] = await pool.execute(`
      SELECT s.*, cs.id as class_subject_id FROM class_subjects cs JOIN subjects s ON cs.subject_id = s.id WHERE cs.class_id = ? ORDER BY s.name
    `, [effectiveClassId]);

    // ✅ FIXED: match config rows case/whitespace-insensitively on exam_type, same as getMarksheet.
    // Previously this filtered exam_type = examName directly in SQL, so any case or whitespace
    // mismatch between exam_types.name and exam_subject_config.exam_type silently missed the
    // config row and fell back to the hardcoded 100/35 default (e.g. English configured for 20
    // marks still showing "/100" on the Marks Entry page).
    const subjects = baseSubjects.map(sub => {
      const cfg = configRows.find(c =>
        c.subject_id === sub.id &&
        String(c.exam_type).trim().toLowerCase() === String(examName).trim().toLowerCase()
      );
      return {
        ...sub,
        max_marks: cfg ? cfg.max_marks : (sub.max_marks || 100),
        pass_marks: cfg ? cfg.pass_marks : (sub.pass_marks || 35)
      };
    });

    const [marks] = await pool.execute(
      `SELECT sm.* FROM student_marks sm WHERE sm.class_id = ? AND (sm.exam_type_id = ? OR sm.exam_type_id = (SELECT id FROM exam_types WHERE name=? LIMIT 1)) AND sm.academic_year = ?`,
      [effectiveClassId, exam_type_id, examName, academic_year]
    );

    // Subject teacher: only own subjects. Class teacher / admin: every subject of the class.
    const shownSubjects = access && access.visible
      ? subjects.filter(s => access.visible.includes(Number(s.id)))
      : subjects;
    const shownIds = new Set(shownSubjects.map(s => Number(s.id)));

    const marksMap = {};
    marks.forEach(m => {
      if (!shownIds.has(Number(m.subject_id))) return;
      if (!marksMap[m.student_id]) marksMap[m.student_id] = {};
      marksMap[m.student_id][m.subject_id] = {
        marks: m.marks_obtained,
        is_absent: m.is_absent === 1 || m.is_absent === true,
        remark: m.remark || ''
      };
    });

    res.json({
      students,
      subjects: shownSubjects,
      marksMap,
      class_id: effectiveClassId,
      editable_subject_ids: access ? access.editable : null,   // null = every subject editable
      can_edit_remarks: access ? access.isClassTeacher : true
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.saveMarks = async (req, res) => {
  try {
    const { class_id, exam_type_id, academic_year, marks } = req.body;
    if (!Array.isArray(marks)) return res.status(400).json({ message: 'Marks data required' });

    // Teacher access: only own / assigned classes, and only assigned subjects
    const resolved = await resolveMarksAccess(req, class_id);
    if (resolved.forbidden || resolved.none) return res.status(403).json({ message: 'You are not assigned to this class' });
    const access = resolved.access;

    const effectiveClassId = parseInt(resolved.classId);
    if (!effectiveClassId) return res.status(400).json({ message: 'Class ID required' });

    if (access) {
      // 1) only subjects assigned to this teacher in this class (class teacher's other subjects are view-only)
      if (marks.some(m => !access.editable.includes(Number(m.subject_id)))) {
        return res.status(403).json({ message: 'You can only enter marks for your assigned subjects' });
      }
      // 2) students must belong to this class
      const [stu] = await pool.execute('SELECT id FROM students WHERE class_id = ?', [effectiveClassId]);
      const okStudents = new Set(stu.map(r => Number(r.id)));
      if (marks.some(m => !okStudents.has(Number(m.student_id)))) {
        return res.status(403).json({ message: 'Invalid student for this class' });
      }
    }

    let examName = exam_type_id;
    let numericExamId = isNaN(parseInt(exam_type_id)) ? null : parseInt(exam_type_id);
    
    if (numericExamId) {
      const [etRows] = await pool.execute('SELECT name FROM exam_types WHERE id=?', [numericExamId]);
      if (etRows.length > 0) examName = etRows[0].name;
    } else {
      const [etRows] = await pool.execute('SELECT id FROM exam_types WHERE name=?', [exam_type_id]);
      if (etRows.length > 0) numericExamId = etRows[0].id;
    }

    const [configRows] = await pool.execute(
      `SELECT subject_id, max_marks FROM exam_subject_config WHERE class_id = ? AND exam_type = ?`,
      [effectiveClassId, examName]
    );

    const targetExamIdValue = numericExamId || exam_type_id;

    // Deactivated students are visible in the Marks Entry list (for roster completeness) but
    // their marks are silently skipped on save — no error, no popup, the rest of the class saves fine.
    const markStudentIds = [...new Set(marks.map(m => m.student_id))];
    let activeStudentIds = new Set();
    if (markStudentIds.length) {
      const placeholders = markStudentIds.map(() => '?').join(',');
      const [activeRows] = await pool.execute(
        `SELECT id FROM students WHERE id IN (${placeholders}) AND fee_status = 'active'`,
        markStudentIds
      );
      activeStudentIds = new Set(activeRows.map(r => r.id));
    }

    for (const mark of marks) {
      const { student_id, subject_id, marks_obtained, is_absent } = mark;
      if (!activeStudentIds.has(student_id)) continue;
      const cfg = configRows.find(c => c.subject_id === subject_id);
      const maxMarks = cfg ? cfg.max_marks : 100;

      if (is_absent) {
        await pool.execute(
          `INSERT INTO student_marks (student_id, subject_id, exam_type_id, class_id, academic_year, marks_obtained, max_marks, is_absent, marked_by)
           VALUES (?,?,?,?,?,NULL,?,1,?) ON DUPLICATE KEY UPDATE marks_obtained=NULL, is_absent=1, marked_by=?`,
          [student_id, subject_id, targetExamIdValue, effectiveClassId, academic_year, maxMarks, req.user.id, req.user.id]
        );
      } else {
        if (marks_obtained === '' || marks_obtained === null || marks_obtained === undefined) continue;
        await pool.execute(
          `INSERT INTO student_marks (student_id, subject_id, exam_type_id, class_id, academic_year, marks_obtained, max_marks, is_absent, marked_by)
           VALUES (?,?,?,?,?,?,?,0,?) ON DUPLICATE KEY UPDATE marks_obtained=?, max_marks=?, is_absent=0, marked_by=?`,
          [student_id, subject_id, targetExamIdValue, effectiveClassId, academic_year, marks_obtained, maxMarks, req.user.id, marks_obtained, maxMarks, req.user.id]
        );
      }
    }
    res.json({ message: 'Marks saved successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.getMarksheet = async (req, res) => {
  try {
    const { exam_type_id, academic_year, student_id } = req.query;
    let { class_id } = req.query;

    // Teachers: own class (class teacher -> every subject) or a class where she teaches a subject (-> only those subjects)
    let access = null;
    if (isTeacherRole(req)) {
      const r = await resolveMarksAccess(req, req.query.class_id);
      if (r.forbidden) return res.status(403).json({ message: 'You are not assigned to this class' });
      if (r.none) return res.status(400).json({ message: 'No class assigned. Please contact admin.' });
      class_id = r.classId;
      access = r.access;
      if (access.visible && !access.visible.length) return res.json([]);
    }

    if (!class_id) return res.status(400).json({ message: 'No class assigned. Please contact admin.' });
    if (!exam_type_id) return res.status(400).json({ message: 'exam_type_id is required' });
    if (!academic_year) return res.status(400).json({ message: 'academic_year is required' });

    let examName = String(exam_type_id).trim();
    let numericExamId = parseInt(exam_type_id);
    if (!isNaN(numericExamId)) {
      const [etRows] = await pool.execute('SELECT name FROM exam_types WHERE id=?', [numericExamId]);
      if (etRows.length > 0) examName = etRows[0].name;
    }

    // Resolve the numeric id of the SELECTED exam (needed for remark lookup even when exam_type_id was passed as a name)
    if (isNaN(numericExamId)) {
      const [etByName] = await pool.execute('SELECT id FROM exam_types WHERE name = ?', [examName]);
      if (etByName.length > 0) numericExamId = etByName[0].id;
    }

    const isFinalCumulative = examName.toLowerCase().includes('final') || examName.toLowerCase().includes('annual');

    // ✅ FIXED: Fetch config settings separately to avoid SQL Cross-Join multiplication bugs
    let configQuery = `SELECT subject_id, exam_type, max_marks, pass_marks FROM exam_subject_config WHERE class_id = ?`;
    let configParams = [class_id];
    if (!isFinalCumulative) {
      configQuery += ` AND exam_type = ?`;
      configParams.push(examName);
    }
    const [configRows] = await pool.execute(configQuery, configParams);

    // ✅ FIXED: Subject-level defaults (max_marks / pass_marks) used as the FINAL fallback tier,
    // mirroring what the Marks Entry page (getMarks) already does. Previously this fell back to a
    // hardcoded 100/35, which is why "Drawing" (max 50) was being scored out of 100 in the report.
    const [subjectDefaults] = await pool.execute(
      `SELECT id as subject_id, max_marks, pass_marks
       FROM subjects
       WHERE id IN (SELECT subject_id FROM class_subjects WHERE class_id = ?)`,
      [class_id]
    );

    let examConditionalFilter, examParams;
    if (isFinalCumulative) {
      examConditionalFilter = `AND sm.exam_type_id IS NOT NULL`;
      examParams = [];
    } else {
      examConditionalFilter = `AND (sm.exam_type_id = ? OR sm.exam_type_id = ?)`;
      examParams = [exam_type_id, examName];
    }

    const studentFilter = student_id ? 'AND sm.student_id = ?' : '';
    const params = [class_id, ...examParams, academic_year];
    if (student_id) params.push(student_id);

    // ✅ FIXED: Join exam_types so every row carries its OWN real exam name (sm.exam_type_id can be
    // Unit Test 1, Unit Test 2, Semester 1... when cumulative/annual pulls every exam). The old code
    // hardcoded the same '${examName}' string onto every row, which broke per-exam config matching.
    const [rows] = await pool.execute(
      `SELECT sm.*,
       s.full_name as student_name, s.roll_no, s.fee_status as student_fee_status,
       sub.name as subject_name, sub.code,
       et.name as exam_type_name, c.name as class_name
       FROM student_marks sm
       JOIN students s ON sm.student_id = s.id
       JOIN subjects sub ON sm.subject_id = sub.id
       JOIN classes c ON sm.class_id = c.id
       JOIN exam_types et ON sm.exam_type_id = et.id
       WHERE sm.class_id = ? ${examConditionalFilter} AND sm.academic_year = ?
       ${studentFilter}
       AND sm.subject_id IN (SELECT subject_id FROM class_subjects WHERE class_id = ?)
       ORDER BY s.roll_no, sub.name`,
      [...params, class_id]
    );

    // ✅ FIXED: Remarks are now fetched separately, keyed to the exam the user actually SELECTED
    // (e.g. the "Annual" exam type itself), instead of a LEFT JOIN with no exam_type_id condition.
    // That old join matched on student_id + academic_year only, so a student with remarks saved
    // against more than one exam type got their student_marks rows duplicated (once per matching
    // remark row) — silently doubling/tripling totals in the cumulative/annual view.
    let remarksMap = {};
    if (numericExamId) {
      const [remarkRows] = await pool.execute(
        `SELECT student_id, overall_remark FROM student_exam_remarks WHERE class_id = ? AND exam_type_id = ? AND academic_year = ?`,
        [class_id, numericExamId, academic_year]
      );
      remarkRows.forEach(rr => { remarksMap[rr.student_id] = rr.overall_remark; });
    }

    // ✅ FIXED: Calculate maximum and passing boundaries programmatically per record object.
    // cfg now matches on each row's OWN resolved exam name (r.exam_type_name) instead of comparing
    // a text exam name to a numeric exam_type_id (which could never match), so each underlying exam
    // (Unit Test 1, Unit Test 2, Semester 1...) picks up its correct max/pass marks when cumulative.
    // Subject teacher view: only the subjects assigned to her (class teacher / admin see every subject)
    const restricted = !!(access && access.visible);
    const visibleRows = restricted ? rows.filter(r => access.visible.includes(Number(r.subject_id))) : rows;

    const updatedRows = visibleRows.map(r => {
      const cfg = configRows.find(c => c.subject_id === r.subject_id && String(c.exam_type).toLowerCase() === String(r.exam_type_name).toLowerCase());
      const subjectDefault = subjectDefaults.find(d => d.subject_id === r.subject_id);

      return {
        ...r,
        max_marks: cfg ? cfg.max_marks : (subjectDefault ? subjectDefault.max_marks : 100),
        pass_marks: cfg ? cfg.pass_marks : (subjectDefault ? subjectDefault.pass_marks : 35),
        overall_remark: restricted ? null : (remarksMap[r.student_id] || null),
        restricted_view: restricted
      };
    });

    // ── Extra marksheet fields: school profile, student details, yearly attendance, final-report remark ──
    let school = { school_name: '', address: '', academic_year: '', reopen_date: null };
    let schoolLogo = null;
    try {
      const [sRows] = await pool.execute(
        `SELECT school_name, address, academic_year,
                DATE_FORMAT(reopen_date, '%Y-%m-%d') AS reopen_date
         FROM school_settings WHERE id = 1`
      );
      if (sRows[0]) school = sRows[0];
      // logo: checks the common column names in school_settings
      const [lg] = await pool.execute('SELECT * FROM school_settings WHERE id = 1');
      const sr = lg[0] || {};
      schoolLogo = sr.logo ?? sr.logo_url ?? sr.school_logo ?? sr.logo_path ?? null;
      if (Buffer.isBuffer(schoolLogo)) schoolLogo = 'data:image/png;base64,' + schoolLogo.toString('base64');
    } catch (e) {}

    // Extra student details (read defensively, column names may differ)
    const extras = {};
    try {
      const [stuRows] = await pool.execute('SELECT * FROM students WHERE class_id = ?', [class_id]);
      stuRows.forEach(s => { extras[s.id] = s; });
    } catch (e) {}

    // Yearly attendance (present / total days) for the academic year, 1 April - 31 March
    const attendanceMap = {};
    try {
      const [ayStart, ayEnd] = String(academic_year).split('-').map(Number);
      if (ayStart && ayEnd) {
        const [attRows] = await pool.execute(
          `SELECT a.person_id AS student_id,
                  COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present_days,
                  COUNT(a.id) AS total_days
           FROM attendance a
           JOIN students s ON a.person_id = s.id
           WHERE a.person_type = 'student' AND s.class_id = ?
             AND a.attendance_date >= ? AND a.attendance_date <= ?
           GROUP BY a.person_id`,
          [class_id, `${ayStart}-04-01`, `${ayEnd}-03-31`]
        );
        attRows.forEach(a => { attendanceMap[a.student_id] = `${a.present_days} / ${a.total_days}`; });
      }
    } catch (e) {}

    // Final Report has no exam type of its own, so use the latest saved remark
    const finalRemarks = {};
    if (!numericExamId || isNaN(numericExamId)) {
      try {
        const [rr] = await pool.execute(
          `SELECT student_id, overall_remark FROM student_exam_remarks
           WHERE class_id = ? AND academic_year = ? AND overall_remark <> ''
           ORDER BY exam_type_id`,
          [class_id, academic_year]
        );
        rr.forEach(x => { finalRemarks[x.student_id] = x.overall_remark; });
      } catch (e) {}
    }

    res.json(updatedRows.map(r => {
      const ex = extras[r.student_id] || {};
      return {
        ...r,
        overall_remark: restricted ? null : (r.overall_remark || finalRemarks[r.student_id] || null),
        school_name: school.school_name,
        school_address: school.address,
        school_academic_year: school.academic_year,
        school_reopen_date: school.reopen_date,
        school_logo: schoolLogo,
        gr_no: ex.gr_no ?? ex.gr_number ?? null,
        mother_name: ex.mother_name ?? null,
        dob: ex.dob ?? ex.date_of_birth ?? null,
        yearly_attendance: attendanceMap[r.student_id] || null
      };
    }));
  } catch (err) {
    console.error('getMarksheet Cumulative Matrix Error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

// Teacher Assignments & Remarks - Fully Intact
exports.getTeacherAssignedSubjects = async (req, res) => {
  try {
    const { teacher_id } = req.query;
    const tid = teacher_id || req.user.id;
    const [rows] = await pool.execute(`SELECT tas.*, s.name as subject_name, s.code, s.max_marks FROM teacher_assigned_subjects tas JOIN subjects s ON tas.subject_id = s.id WHERE tas.teacher_id = ? ORDER BY s.name`, [tid]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.saveTeacherAssignedSubjects = async (req, res) => {
  try {
    const { teacher_id, subject_ids } = req.body;
    await pool.execute('DELETE FROM teacher_assigned_subjects WHERE teacher_id = ?', [teacher_id]);
    if (subject_ids && subject_ids.length > 0) {
      for (const sid of subject_ids) {
        await pool.execute('INSERT IGNORE INTO teacher_assigned_subjects (teacher_id, subject_id) VALUES (?,?)', [teacher_id, sid]);
      }
    }
    res.json({ message: 'Teacher subjects updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.getRemarks = async (req, res) => {
  try {
    const { class_id, exam_type_id, academic_year } = req.query;
    // Overall remarks belong to the class teacher (and admin/principal) only
    const { classId: effectiveClassId, access, forbidden, none } = await resolveMarksAccess(req, class_id);
    if (forbidden || none || (access && !access.isClassTeacher)) return res.json({});
    if (!effectiveClassId || isNaN(effectiveClassId)) return res.json({});
    const [rows] = await pool.execute(`SELECT * FROM student_exam_remarks WHERE class_id = ? AND exam_type_id = ? AND academic_year = ?`, [effectiveClassId, exam_type_id, academic_year]);
    const map = {};
    rows.forEach(r => { map[r.student_id] = r.overall_remark; });
    res.json(map);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.saveRemarks = async (req, res) => {
  try {
    const { class_id, exam_type_id, academic_year, remarks } = req.body;
    const resolved = await resolveMarksAccess(req, class_id);
    // Overall remarks belong to the class teacher (and admin/principal) only
    if (resolved.forbidden || resolved.none || (resolved.access && !resolved.access.isClassTeacher)) {
      return res.status(403).json({ message: 'Only the class teacher can enter overall remarks' });
    }
    const effectiveClassId = parseInt(resolved.classId);
    if (!effectiveClassId || isNaN(effectiveClassId)) return res.status(400).json({ message: 'Invalid class ID.' });
    for (const { student_id, overall_remark } of remarks) {
      await pool.execute(`INSERT INTO student_exam_remarks (student_id, class_id, exam_type_id, academic_year, overall_remark, marked_by) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE overall_remark=?, marked_by=?`, [student_id, effectiveClassId, exam_type_id, academic_year, overall_remark || '', req.user.id, overall_remark || '', req.user.id]);
    }
    res.json({ message: 'Remarks saved successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};