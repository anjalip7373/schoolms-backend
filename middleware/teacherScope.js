const pool = require('../config/db');

const uidOf = (req) => req.user?.id ?? req.user?.userId ?? req.user?.user_id;

/**
 * Sets req.classScope (place AFTER authenticateToken):
 *   null       -> no restriction (admin, principal, accountant, any non-teacher role)
 *   [1,2,...]  -> teacher: every class in teacher_class_subject, plus legacy users.class_assigned
 *   []         -> teacher with no class assigned (sees no class data)
 */
const teacherScope = async (req, res, next) => {
  try {
    req.classScope = null;
    req.broadcastScope = null;
    if (String(req.user?.role || '').trim().toLowerCase() !== 'teacher') return next();
    const uid = uidOf(req);
        const [rows] = await pool.execute(
      `SELECT class_assigned FROM users WHERE id = ? AND class_assigned IS NOT NULL`,
      [uid]
    );
    req.classScope = rows.map(r => Number(r.class_assigned));
    const [bRows] = await pool.execute(
      'SELECT DISTINCT class_id FROM teacher_class_subject WHERE teacher_id = ?',
      [uid]
    );
    req.broadcastScope = [...new Set([...bRows.map(r => Number(r.class_id)), ...req.classScope])];
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// " AND <column> IN (...)" for teachers; empty for everyone else.
teacherScope.classScopeSql = (req, column) => {
  if (!req.classScope) return { sql: '', params: [] };
  if (!req.classScope.length) return { sql: ' AND 1=0', params: [] };
  return { sql: ` AND ${column} IN (${req.classScope.map(() => '?').join(',')})`, params: [...req.classScope] };
};

teacherScope.canAccessClass = (req, classId) =>
  !req.classScope || req.classScope.includes(Number(classId));

// Subjects a teacher may handle in a class. null = no restriction
// (non-teacher, or a legacy class_assigned class with no subject rows).
teacherScope.teacherSubjectIds = async (req, classId) => {
  if (!req.classScope) return null;
  if (req.classScope.includes(Number(classId))) return null; // class teacher: all subjects of own class
  const [rows] = await pool.execute(
    'SELECT subject_id FROM teacher_class_subject WHERE teacher_id = ? AND class_id = ?',
    [uidOf(req), Number(classId)]
  );
  return rows.length ? rows.map(r => Number(r.subject_id)) : null;
};

// Broadcast-only: classes/subjects a teacher may broadcast to.
teacherScope.canBroadcastClass = (req, classId) =>
  !req.broadcastScope || req.broadcastScope.includes(Number(classId));

teacherScope.broadcastSubjectIds = async (req, classId) => {
  if (!req.broadcastScope) return null;
  if (req.classScope && req.classScope.includes(Number(classId))) {
    const [mine] = await pool.execute(
      'SELECT subject_id FROM teacher_class_subject WHERE teacher_id = ? AND class_id = ?',
      [uidOf(req), Number(classId)]
    );
    return mine.map(r => Number(r.subject_id)); // own class: assigned subjects only ([] = general notices only)
  }
  const [rows] = await pool.execute(
    'SELECT subject_id FROM teacher_class_subject WHERE teacher_id = ? AND class_id = ?',
    [uidOf(req), Number(classId)]
  );
  return rows.length ? rows.map(r => Number(r.subject_id)) : null;
};

module.exports = teacherScope;