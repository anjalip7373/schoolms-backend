const pool = require('../config/db');

const getTeacherClass = async (userId, role) => {
  const isTeacher = role === 'Teacher' || role === 'teacher';
  if (!isTeacher) return null;
  const [rows] = await pool.execute('SELECT class_assigned FROM users WHERE id = ?', [userId]);
  return rows[0]?.class_assigned || null;
};

exports.getDashboard = async (req, res) => {
  try {
    const { month, year, class_id } = req.query;
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();
    const monthStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
    const userRole = req.user.role;
    const userId = req.user.id;

    // Get teacher's assigned class — force it
    const teacherClass = await getTeacherClass(userId, userRole);
    const isTeacher = !!teacherClass;

    // Teacher always sees only their class, others use selected class or all
    const effectiveClassId = isTeacher ? teacherClass : (class_id || null);

    // Get classes — teacher sees only their class
    const [allClasses] = await pool.execute(
      'SELECT * FROM classes ORDER BY LENGTH(name), name'
    );
    const visibleClasses = isTeacher
      ? allClasses.filter(c => c.id == teacherClass)
      : allClasses;

    // Fee stats — filtered by effectiveClassId
    let feeQuery = `
      SELECT COUNT(DISTINCT s.id) as total_students,
      SUM(CASE WHEN fp.id IS NOT NULL THEN 1 ELSE 0 END) as paid_count
      FROM students s 
      LEFT JOIN fee_payments fp ON fp.student_id = s.id 
        AND DATE_FORMAT(fp.payment_date,'%Y-%m') = ?
      WHERE 1=1`;
    const feeParams = [monthStr];
    if (effectiveClassId) {
      feeQuery += ' AND s.class_id = ?';
      feeParams.push(effectiveClassId);
    }
    const [feeStats] = await pool.execute(feeQuery, feeParams);

    // Salary stats — teachers don't see salary
    let salaryStats = [{ total_employees: 0, generated_count: 0 }];
    if (!isTeacher) {
      [salaryStats] = await pool.execute(
        `SELECT COUNT(DISTINCT u.id) as total_employees,
         SUM(CASE WHEN ss.id IS NOT NULL THEN 1 ELSE 0 END) as generated_count
         FROM users u 
         LEFT JOIN salary_slips ss ON ss.employee_id = u.id AND ss.month = ?
         WHERE u.is_active = 1`,
        [monthStr]
      );
    }

    res.json({
      classes: visibleClasses,
      fees: {
        total: feeStats[0].total_students,
        paid: feeStats[0].paid_count || 0,
        not_paid: (feeStats[0].total_students - (feeStats[0].paid_count || 0))
      },
      salary: {
        total: salaryStats[0].total_employees,
        generated: salaryStats[0].generated_count || 0,
        not_generated: (salaryStats[0].total_employees - (salaryStats[0].generated_count || 0))
      },
      month: currentMonth,
      year: currentYear,
      isTeacher,
      teacherClassId: teacherClass
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};