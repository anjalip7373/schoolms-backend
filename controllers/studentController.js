const pool = require('../config/db');
const { sendStudentWelcomeEmail, sendStudentUpdateEmail } = require('../config/emailService');
const { sendStudentWelcomeWhatsApp, sendStudentUpdateWhatsApp } = require('../config/whatsappService');

const generateRollNo = async (class_id) => {
  const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM students WHERE class_id = ?', [class_id]);
  const count = rows[0].cnt + 1;
  return `STU${class_id}${String(count).padStart(3,'0')}`;
};

const getTeacherClass = async (userId, role) => {
  const isTeacher = role === 'Teacher' || role === 'teacher';
  if (!isTeacher) return null;
  const [rows] = await pool.execute('SELECT class_assigned FROM users WHERE id = ?', [userId]);
  return rows[0]?.class_assigned || null;
};

exports.getAllStudents = async (req, res) => {
  try {
    const { search } = req.query;
    let { class_id } = req.query;
    const teacherClass = await getTeacherClass(req.user.id, req.user.role);
    if (teacherClass) class_id = teacherClass;
    let query = `SELECT s.*, c.name as class_name FROM students s LEFT JOIN classes c ON s.class_id = c.id WHERE 1=1`;
    const params = [];
    if (class_id) { query += ' AND s.class_id = ?'; params.push(class_id); }
    if (search) { query += ' AND (s.full_name LIKE ? OR s.roll_no LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' ORDER BY s.roll_no ASC';
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addStudent = async (req, res) => {
  try {
    const { full_name, class_id, phone, whatsapp_no, email, date_of_birth, address } = req.body;
    const teacherClass = await getTeacherClass(req.user.id, req.user.role);
    const finalClassId = teacherClass || class_id;

    const roll_no = await generateRollNo(finalClassId);

    await pool.execute(
      `INSERT INTO students (roll_no, full_name, class_id, phone, whatsapp_no, email, date_of_birth, address) 
       VALUES (?,?,?,?,?,?,?,?)`,
      [roll_no, full_name, finalClassId, phone, whatsapp_no, email, date_of_birth, address]
    );

    // Get class name for notification
    const [classRows] = await pool.execute('SELECT name FROM classes WHERE id = ?', [finalClassId]);
    const className = classRows[0]?.name || 'Your Class';

    // ✅ Send welcome email
    if (email) {
      sendStudentWelcomeEmail(email, full_name, roll_no, className)
        .catch(e => console.error('Student welcome email failed:', e.message));
    }

    // ✅ Send welcome WhatsApp (use whatsapp_no if available, else phone)
    const waPhone = whatsapp_no || phone;
    if (waPhone) {
      sendStudentWelcomeWhatsApp(waPhone, full_name, roll_no, className)
        .catch(e => console.error('Student welcome WhatsApp failed:', e.message));
    }

    res.json({ message: 'Student added successfully', roll_no });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, class_id, phone, whatsapp_no, email, date_of_birth, address, fee_status } = req.body;

    await pool.execute(
      `UPDATE students SET full_name=?, class_id=?, phone=?, whatsapp_no=?, email=?, date_of_birth=?, address=?, fee_status=? WHERE id=?`,
      [full_name, class_id, phone, whatsapp_no, email, date_of_birth, address, fee_status, id]
    );

    // ✅ Send update email
    if (email) {
      sendStudentUpdateEmail(email, full_name)
        .catch(e => console.error('Student update email failed:', e.message));
    }

    // ✅ Send update WhatsApp
    const waPhone = whatsapp_no || phone;
    if (waPhone) {
      sendStudentUpdateWhatsApp(waPhone, full_name)
        .catch(e => console.error('Student update WhatsApp failed:', e.message));
    }

    res.json({ message: 'Student updated successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getStudentById = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT s.*, c.name as class_name FROM students s LEFT JOIN classes c ON s.class_id = c.id WHERE s.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};