const { sendBroadcastWhatsApp } = require('../config/whatsappService');

const pool = require('../config/db');
const { sendBroadcastEmail } = require('../config/emailService');
// const { sendWhatsAppMessage } = require('../config/whatsappService');

// Classes a teacher may broadcast to: every class in teacher_class_subject
// (subject teacher) plus their own class_assigned (class teacher).
// Returns null for non-teachers (admin / principal etc. = no restriction).
const getTeacherAssignedClasses = async (userId, role) => {
  try {
    const isTeacher = String(role || '').trim().toLowerCase() === 'teacher';
    if (!isTeacher) return null;

    const [rows] = await pool.execute(
      'SELECT DISTINCT class_id FROM teacher_class_subject WHERE teacher_id = ?',
      [userId]
    );
    const classIds = rows.map(r => Number(r.class_id));

    const [ownRows] = await pool.execute('SELECT class_assigned FROM users WHERE id = ?', [userId]);
    const ownClass = ownRows[0]?.class_assigned;
    if (ownClass && !classIds.includes(Number(ownClass))) classIds.push(Number(ownClass));
    return classIds;
  } catch (e) {
    return [];   // fail closed: a teacher whose scope can't be read gets no classes
  }
};

// Ensure broadcasts can record the subject (safe, additive)
(async () => {
  try {
    const [cols] = await pool.execute("SHOW COLUMNS FROM broadcasts LIKE 'subject_id'");
    if (!cols.length) await pool.execute('ALTER TABLE broadcasts ADD COLUMN subject_id INT NULL');
  } catch (e) { console.log('broadcasts.subject_id init notice:', e.message); }
})();

// Teachers must pick one of THEIR subjects for the chosen class.
// Class teacher may send a general notice (no subject) to their OWN class only.
// Admin / principal: subject is optional.
const resolveSubject = async (teacherClasses, userId, classId, rawSubjectId) => {
  const subjectId = rawSubjectId ? Number(rawSubjectId) : null;
  if (!teacherClasses) return { subjectId };          // not a teacher

  if (!subjectId) {
    const [own] = await pool.execute('SELECT class_assigned FROM users WHERE id = ?', [userId]);
    if (own[0]?.class_assigned && Number(own[0].class_assigned) === Number(classId)) {
      return { subjectId: null };                      // general notice, own class
    }
    return { error: 'General notifications can only be sent to your own class. Please select a subject for this class.' };
  }

  const [rows] = await pool.execute(
    'SELECT subject_id FROM teacher_class_subject WHERE teacher_id = ? AND class_id = ?',
    [userId, Number(classId)]
  );
  if (!rows.some(r => Number(r.subject_id) === subjectId)) {
    return { error: 'You are not assigned to this subject for the selected class.' };
  }
  return { subjectId };
};

// Same class + same subject + same title already sent by ANOTHER sender?
const findDuplicateAssignment = async (userId, classId, subjectId, title) => {
  if (!classId || !subjectId || !title) return null;
  const cleanTitle = String(title).replace(/^\[WhatsApp\]\s*/i, '').trim().toLowerCase();
  const [rows] = await pool.execute(
    `SELECT b.id, u.full_name AS sent_by_name
       FROM broadcasts b JOIN users u ON u.id = b.sent_by
      WHERE b.target_class_id = ? AND b.subject_id = ? AND b.sent_by <> ?
        AND LOWER(TRIM(REPLACE(b.title, '[WhatsApp] ', ''))) = ?
      ORDER BY b.id DESC LIMIT 1`,
    [Number(classId), Number(subjectId), userId, cleanTitle]
  );
  return rows[0] || null;
};

// Shared guard used by both send endpoints.
// Returns { error, status, extra } on rejection, else { target_type, target_class_id, subjectId }.
const checkSendPermission = async (req, target_type, target_class_id) => {
  const userId = req.user.id;
  const teacherClasses = await getTeacherAssignedClasses(userId, req.user.role);
  target_class_id = target_class_id || null;

  if (teacherClasses) {
    target_type = 'class';
    if (!target_class_id || !teacherClasses.includes(Number(target_class_id))) {
      return { status: 403, error: 'You are only allowed to send broadcasts to your assigned classes.' };
    }
  }

  const subj = await resolveSubject(teacherClasses, userId, target_class_id, req.body.subject_id);
  if (subj.error) return { status: 403, error: subj.error };

  if (String(req.body.force) !== 'true') {
    const dup = await findDuplicateAssignment(userId, target_class_id, subj.subjectId, req.body.title);
    if (dup) {
      return {
        status: 409,
        error: `"${req.body.title}" has already been sent to this class for this subject by ${dup.sent_by_name}.`,
        duplicate: true
      };
    }
  }
  return { target_type, target_class_id, subjectId: subj.subjectId };
};

exports.getBroadcasts = async (req, res) => {
  try {
    const userId = req.user?.id;
    const teacherClasses = await getTeacherAssignedClasses(userId, req.user?.role);
    const { class_id, subject_id } = req.query;

    let query = `
      SELECT b.*, u.full_name as sent_by_name, c.name as class_name, sub.name as subject_name
      FROM broadcasts b
      JOIN users u ON b.sent_by = u.id
      LEFT JOIN classes c ON b.target_class_id = c.id
      LEFT JOIN subjects sub ON b.subject_id = sub.id
      WHERE 1=1
    `;
    const params = [];

    if (teacherClasses) {
      // Keep a teacher's own sent history even after an assignment is removed
      const [sentRows] = await pool.execute(
        'SELECT DISTINCT target_class_id FROM broadcasts WHERE sent_by = ? AND target_class_id IS NOT NULL',
        [userId]
      );
      const visible = [...new Set([...teacherClasses, ...sentRows.map(r => Number(r.target_class_id))])];
      if (!visible.length) return res.json([]);

      query += ` AND b.target_class_id IN (${visible.map(() => '?').join(',')})`;
      params.push(...visible);
      // own broadcasts, or broadcasts for a class+subject this teacher is assigned to
      query += ` AND (b.sent_by = ? OR EXISTS (
        SELECT 1 FROM teacher_class_subject t
         WHERE t.teacher_id = ? AND t.class_id = b.target_class_id AND t.subject_id = b.subject_id))`;
      params.push(userId, userId);
    }

    if (class_id) { query += ` AND b.target_class_id = ?`; params.push(class_id); }
    if (subject_id) { query += ` AND b.subject_id = ?`; params.push(subject_id); }

    query += ` ORDER BY b.created_at DESC`;
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.sendBroadcast = async (req, res) => {
  try {
    const { title, message } = req.body;
    let { target_type, target_class_id } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    // Teachers: only assigned classes + subjects (class teacher may send a general notice to own class)
    const perm = await checkSendPermission(req, target_type, target_class_id);
    if (perm.error) {
      return res.status(perm.status).json(perm.duplicate ? { duplicate: true, message: perm.error } : { message: perm.error });
    }
    target_type = perm.target_type;
    target_class_id = perm.target_class_id;
    const subjectId = perm.subjectId;

    // Media file detection
    let fileUrl = null, fileName = null, fileType = null;
    if (req.file) {
      fileUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5000'}/uploads/${req.file.filename}`;
      fileName = req.file.originalname;
      fileType = req.file.mimetype;
    }

    // Get recipients based on target
    let recipients = [];

    if (target_type === 'all') {
      // All students + all employees
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, 'student' as type FROM students s WHERE s.fee_status = 'active' AND s.email IS NOT NULL AND s.email != ''`
      );
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, 'employee' as type FROM users u WHERE u.is_active = 1 AND u.email IS NOT NULL AND u.email != ''`
      );
      recipients = [...students, ...employees];

    } else if (target_type === 'class') {
      // All students in a class
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, 'student' as type FROM students s 
         WHERE s.class_id = ? AND s.fee_status = 'active' AND s.email IS NOT NULL AND s.email != ''`,
        [target_class_id]
      );
      recipients = students;

    } else if (target_type === 'students') {
      // All students
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, 'student' as type FROM students s WHERE s.fee_status = 'active' AND s.email IS NOT NULL AND s.email != ''`
      );
      recipients = students;

    } else if (target_type === 'employees') {
      // All employees
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, 'employee' as type FROM users u WHERE u.is_active = 1 AND u.email IS NOT NULL AND u.email != ''`
      );
      recipients = employees;
    }

    console.log(`Broadcasting to ${recipients.length} recipients`);

    // Save broadcast record
    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count, file_url, file_name, file_type, subject_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [title, message, target_type, target_class_id || null, req.user.id, recipients.length, fileUrl, fileName, fileType, subjectId]
      );
    } catch (dbErr) {
      // Fallback if file_url/file_name/file_type columns don't exist yet on this DB
      [result] = await pool.execute(
        `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count, subject_id)
         VALUES (?,?,?,?,?,?,?)`,
        [title, message, target_type, target_class_id || null, req.user.id, recipients.length, subjectId]
      );
    }

    // Send emails async
    if (recipients.length > 0) {
      sendBroadcastNotifications(recipients, title, message, req.user.full_name || 'SchoolMS', fileUrl)
        .catch(e => console.error('Broadcast notification error:', e.message));
    }

    res.json({
      message: `Broadcast sent to ${recipients.length} recipients`,
      broadcast_id: result.insertId,
      sent_count: recipients.length,
      file_url: fileUrl
    });

  } catch (err) {
    console.error('Broadcast error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

exports.deleteBroadcast = async (req, res) => {
  try {
    await pool.execute('DELETE FROM broadcasts WHERE id=?', [req.params.id]);
    res.json({ message: 'Broadcast deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Send emails in batches
const sendBroadcastNotifications = async (recipients, title, message, senderName, fileUrl) => {
  const { sendBroadcastEmail } = require('../config/emailService');
  let emailSent = 0, whatsappSent = 0;

  for (const recipient of recipients) {
    // Send Email — attachment shown as a button using the same fileUrl
    if (recipient.email) {
      try {
        await sendBroadcastEmail(recipient.email, recipient.full_name, title, message, senderName, fileUrl);
        emailSent++;
      } catch (e) {
        console.error(`Email failed for ${recipient.email}:`, e.message);
      }
    }

    // Send WhatsApp — image/PDF sent as real media, not a text link
    const phone = recipient.whatsapp_no || recipient.phone;
    if (phone) {
      try {
        await sendBroadcastWhatsApp(phone, recipient.full_name, title, message, fileUrl);
        whatsappSent++;
      } catch (e) {
        console.error(`WhatsApp failed for ${phone}:`, e.message);
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Broadcast complete: ${emailSent} emails, ${whatsappSent} WhatsApp sent`);
};

exports.sendWhatsAppBroadcast = async (req, res) => {
  try {
    const { title, message } = req.body;
    let { target_type, target_class_id } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    // Teachers: only assigned classes + subjects (class teacher may send a general notice to own class)
    const perm = await checkSendPermission(req, target_type, target_class_id);
    if (perm.error) {
      return res.status(perm.status).json(perm.duplicate ? { duplicate: true, message: perm.error } : { message: perm.error });
    }
    target_type = perm.target_type;
    target_class_id = perm.target_class_id;
    const subjectId = perm.subjectId;

    // Media file detection
    let fileUrl = null, fileName = null, fileType = null;
    if (req.file) {
      fileUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5000'}/uploads/${req.file.filename}`;
      fileName = req.file.originalname;
      fileType = req.file.mimetype;
    }

    // Get recipients with phone numbers
    let recipients = [];

    if (target_type === 'all') {
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, 'student' as type 
         FROM students s WHERE s.fee_status = 'active'`
      );
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, u.phone, NULL as whatsapp_no, 'employee' as type 
         FROM users u WHERE u.is_active = 1`
      );
      recipients = [...students, ...employees];

    } else if (target_type === 'class') {
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, 'student' as type 
         FROM students s WHERE s.class_id = ? AND s.fee_status = 'active'`,
        [target_class_id]
      );
      recipients = students;

    } else if (target_type === 'students') {
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, 'student' as type 
         FROM students s WHERE s.fee_status = 'active'`
      );
      recipients = students;

    } else if (target_type === 'employees') {
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, u.phone, NULL as whatsapp_no, 'employee' as type 
         FROM users u WHERE u.is_active = 1`
      );
      recipients = employees;
    }

    

    // Filter only those with phone
    const withPhone = recipients.filter(r => r.whatsapp_no || r.phone);
    console.log(`WhatsApp broadcast to ${withPhone.length} recipients`);

    // Save to broadcast history
    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count, file_url, file_name, file_type, subject_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [`[WhatsApp] ${title}`, message, target_type, target_class_id || null, req.user.id, withPhone.length, fileUrl, fileName, fileType, subjectId]
      );
    } catch (dbErr) {
      [result] = await pool.execute(
        `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count, subject_id)
         VALUES (?,?,?,?,?,?,?)`,
        [`[WhatsApp] ${title}`, message, target_type, target_class_id || null, req.user.id, withPhone.length, subjectId]
      );
    }

    // Send WhatsApp messages async — don't block response
    sendWhatsAppMessages(withPhone, title, message, req.user.full_name, fileUrl)
      .catch(e => console.error('WhatsApp broadcast error:', e.message));

    res.json({
      message: `WhatsApp broadcast sending to ${withPhone.length} recipients`,
      broadcast_id: result.insertId,
      sent_count: withPhone.length,
      skipped: recipients.length - withPhone.length,
      file_url: fileUrl
    });

  } catch (err) {
    console.error('WhatsApp broadcast error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

const sendWhatsAppMessages = async (recipients, title, message, senderName, fileUrl) => {
  let sent = 0;
  for (const recipient of recipients) {
    try {
      const phone = recipient.whatsapp_no || recipient.phone;   // WhatsApp number first, fall back to phone
      await sendBroadcastWhatsApp(phone, recipient.full_name, title, message, fileUrl);
      sent++;
      console.log(`WhatsApp sent to: ${recipient.full_name}`);
    } catch (e) {
      console.error(`WhatsApp failed for ${recipient.full_name}:`, e.message);
    }
  }
  console.log(`WhatsApp broadcast complete: ${sent}/${recipients.length}`);
};